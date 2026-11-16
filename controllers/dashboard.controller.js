const pool = require("../config/database");

const ROLES = { SUPER_ADMIN: 1, ORG_ADMIN: 2, EMPLOYEE: 3 };

/* ── Guard ───────────────────────────────────────────── */

function requireOrg(req) {
  const orgId = req.user?.organization_id;
  if (!orgId) {
    throw Object.assign(new Error("Organization context missing"), {
      status: 403,
    });
  }
  return Number(orgId);
}

/* ── GET /api/dashboard (admin view) ─────────────────── */
exports.getAdmin = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    /* Every COUNT / SUM is now per-org. */

    const [empCount] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM users
        WHERE status = 'active'
          AND role_id = ?
          AND organization_id = ?`,
      [ROLES.EMPLOYEE, orgId],
    );

    const [projCount] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM projects
        WHERE status = 'active'
          AND organization_id = ?`,
      [orgId],
    );

    const [pendingTs] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM timesheet_entries
        WHERE status = 'submitted'
          AND organization_id = ?`,
      [orgId],
    );

    const [pendingOt] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM overtime_requests
        WHERE status = 'pending'
          AND organization_id = ?`,
      [orgId],
    );

    const [pendingTasks] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM tasks
        WHERE approval_status = 'pending'
          AND organization_id = ?`,
      [orgId],
    );

    const [todayHours] = await pool.query(
      `SELECT COALESCE(SUM(total_hours), 0) AS hours
         FROM timesheet_entries
        WHERE date = CURDATE()
          AND organization_id = ?`,
      [orgId],
    );

    res.json({
      success: true,
      data: {
        totalEmployees: empCount[0].count,
        activeProjects: projCount[0].count,
        pendingApprovals: {
          timesheets: pendingTs[0].count,
          overtime: pendingOt[0].count,
          tasks: pendingTasks[0].count,
          total:
            pendingTs[0].count + pendingOt[0].count + pendingTasks[0].count,
        },
        todaysTotalHours: todayHours[0].hours || 0,
      },
    });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/dashboard (employee view) ──────────────── */
exports.getEmployee = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const userId = Number(req.user.id);

    /* Belt + suspenders: employee_id already uniquely identifies the user,
       but scoping by organization_id defends against a user row being
       reassigned across tenants (shouldn't happen, but costs nothing). */

    const [today] = await pool.query(
      `SELECT COALESCE(SUM(total_hours), 0) AS hours
         FROM timesheet_entries
        WHERE employee_id = ?
          AND organization_id = ?
          AND date = CURDATE()`,
      [userId, orgId],
    );

    const [week] = await pool.query(
      `SELECT COALESCE(SUM(total_hours), 0) AS hours
         FROM timesheet_entries
        WHERE employee_id = ?
          AND organization_id = ?
          AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)`,
      [userId, orgId],
    );

    const [month] = await pool.query(
      `SELECT COALESCE(SUM(total_hours), 0) AS hours
         FROM timesheet_entries
        WHERE employee_id = ?
          AND organization_id = ?
          AND MONTH(date) = MONTH(CURDATE())
          AND YEAR(date)  = YEAR(CURDATE())`,
      [userId, orgId],
    );

    const [pendingApprovals] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM timesheet_entries
        WHERE employee_id = ?
          AND organization_id = ?
          AND status = 'submitted'`,
      [userId, orgId],
    );

    /* Preserved original semantics: total overtime requests ever (not just pending).
       If you meant "pending overtime count", change to:
         AND status = 'pending'
       See note below. */
    const [overtimeCount] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM overtime_requests
        WHERE employee_id = ?
          AND organization_id = ?`,
      [userId, orgId],
    );

    const [assignedTasks] = await pool.query(
      `SELECT COUNT(*) AS count
         FROM tasks
        WHERE assigned_to = ?
          AND organization_id = ?
          AND status != 'completed'`,
      [userId, orgId],
    );

    res.json({
      success: true,
      data: {
        hours: {
          today: today[0].hours || 0,
          week: week[0].hours || 0,
          month: month[0].hours || 0,
        },
        pendingApprovals: pendingApprovals[0].count,
        overtimeCount: overtimeCount[0].count,
        activeAssignedTasks: assignedTasks[0].count,
      },
    });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── Router boilerplate ──────────────────────────────── */
exports.getAll = async (req, res, next) => {
  /* Fix: Number() wrapping — same string-vs-number gotcha we hit elsewhere */
  if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
    return exports.getEmployee(req, res, next);
  }
  return exports.getAdmin(req, res, next);
};
exports.getById = async (_req, res) => res.json({ success: true });
exports.create = async (_req, res) => res.json({ success: true });
exports.update = async (_req, res) => res.json({ success: true });
exports.delete = async (_req, res) => res.json({ success: true });
