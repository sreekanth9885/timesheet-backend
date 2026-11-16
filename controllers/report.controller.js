const pool = require("../config/database");

const ROLES = { SUPER_ADMIN: 1, ORG_ADMIN: 2, EMPLOYEE: 3 };

/* ── Guards ──────────────────────────────────────────── */

function requireOrg(req) {
  const orgId = req.user?.organization_id;
  if (!orgId) {
    throw Object.assign(new Error("Organization context missing"), {
      status: 403,
    });
  }
  return Number(orgId);
}

function ensureAdmin(req) {
  if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
    throw Object.assign(new Error("Only administrators can view reports"), {
      status: 403,
    });
  }
}

/* ── Shared error handling ───────────────────────────── */

function handle(res, next, error) {
  if (error.status) {
    return res
      .status(error.status)
      .json({ success: false, message: error.message });
  }
  next(error);
}

/* ── GET /api/reports/employees ──────────────────────── */
exports.getEmployeeReport = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    ensureAdmin(req);

    const { start_date, end_date } = req.query;

    let query = `
      SELECT t.employee_id, u.first_name, u.last_name,
             COALESCE(SUM(t.total_hours), 0) AS total_hours,
             COUNT(t.id) AS entries_count
        FROM timesheet_entries t
        JOIN users u
          ON u.id = t.employee_id
         AND u.organization_id = t.organization_id
       WHERE t.organization_id = ?
    `;
    const params = [orgId];

    if (start_date && end_date) {
      query += " AND t.date BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    query += `
      GROUP BY t.employee_id, u.first_name, u.last_name
      ORDER BY total_hours DESC
    `;

    const [report] = await pool.query(query, params);
    res.json({ success: true, data: report });
  } catch (error) {
    handle(res, next, error);
  }
};

/* ── GET /api/reports/projects ───────────────────────── */
exports.getProjectReport = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    ensureAdmin(req);

    /* NOTE the org filter placement:
       - `p.organization_id = ?` goes in WHERE (primary table scoping)
       - `t.organization_id = p.organization_id` goes in the LEFT JOIN's ON
         clause, NOT in WHERE — otherwise projects with zero approved entries
         get filtered out, which defeats the point of LEFT JOIN. */
    const [report] = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.budget_hours,
         p.estimated_hours,
         COALESCE(SUM(t.total_hours), 0) AS actual_hours,
         (COALESCE(SUM(t.total_hours), 0) / NULLIF(p.budget_hours, 0)) * 100
           AS budget_utilization_percent
       FROM projects p
       LEFT JOIN timesheet_entries t
              ON t.project_id = p.id
             AND t.organization_id = p.organization_id
             AND t.status = 'approved'
      WHERE p.organization_id = ?
      GROUP BY p.id, p.name, p.budget_hours, p.estimated_hours
      ORDER BY p.name ASC`,
      [orgId],
    );
    res.json({ success: true, data: report });
  } catch (error) {
    handle(res, next, error);
  }
};

/* ── GET /api/reports/tasks ──────────────────────────── */
exports.getTaskReport = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    ensureAdmin(req);

    const [report] = await pool.query(
      `SELECT
         t.status,
         COUNT(t.id) AS task_count,
         COALESCE(SUM(t.estimated_hours), 0) AS total_estimated,
         COALESCE(SUM(t.actual_hours), 0)    AS total_actual
       FROM tasks t
      WHERE t.organization_id = ?
      GROUP BY t.status`,
      [orgId],
    );
    res.json({ success: true, data: report });
  } catch (error) {
    handle(res, next, error);
  }
};

/* ── GET /api/reports/overtime ───────────────────────── */
exports.getOvertimeReport = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    ensureAdmin(req);

    const [report] = await pool.query(
      `SELECT
         u.first_name,
         u.last_name,
         COALESCE(SUM(o.extra_hours), 0) AS total_overtime,
         COUNT(o.id) AS request_count
       FROM overtime_requests o
       JOIN users u
         ON u.id = o.employee_id
        AND u.organization_id = o.organization_id
      WHERE o.status = 'approved'
        AND o.organization_id = ?
      GROUP BY o.employee_id, u.first_name, u.last_name
      ORDER BY total_overtime DESC`,
      [orgId],
    );
    res.json({ success: true, data: report });
  } catch (error) {
    handle(res, next, error);
  }
};

/* ── GET /api/reports/departments ────────────────────── */
exports.getDepartmentReport = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    ensureAdmin(req);

    /* Same LEFT JOIN rule as getProjectReport:
       - `d.organization_id = ?` in WHERE scopes the primary table
       - User & timesheet joins must be org-scoped in the ON clause so
         departments with no employees still appear (with 0 counts). */
    const [report] = await pool.query(
      `SELECT
         d.name,
         COUNT(DISTINCT u.id) AS employee_count,
         COALESCE(SUM(t.total_hours), 0) AS total_hours
       FROM departments d
       LEFT JOIN users u
              ON u.department_id = d.id
             AND u.organization_id = d.organization_id
       LEFT JOIN timesheet_entries t
              ON t.employee_id = u.id
             AND t.organization_id = d.organization_id
      WHERE d.organization_id = ?
      GROUP BY d.id, d.name
      ORDER BY d.name ASC`,
      [orgId],
    );
    res.json({ success: true, data: report });
  } catch (error) {
    handle(res, next, error);
  }
};

/* ── Boilerplate ─────────────────────────────────────── */
exports.getAll = async (_req, res) =>
  res.json({ success: true, message: "Use specific report endpoints" });
exports.getById = async (_req, res) => res.json({ success: true });
exports.create = async (_req, res) => res.json({ success: true });
exports.update = async (_req, res) => res.json({ success: true });
exports.delete = async (_req, res) => res.json({ success: true });
