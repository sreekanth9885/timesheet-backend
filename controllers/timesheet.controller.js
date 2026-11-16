const pool = require("../config/database");
const auditLog = require("../middleware/auditLog");

const ROLES = { SUPER_ADMIN: 1, ORG_ADMIN: 2, EMPLOYEE: 3 };

/* ── Helpers ─────────────────────────────────────────── */

function requireOrg(req) {
  const orgId = req.user?.organization_id;
  if (!orgId) {
    throw Object.assign(new Error("Organization context missing"), {
      status: 403,
    });
  }
  return Number(orgId);
}

async function findEntryInOrg(entryId, orgId) {
  const [rows] = await pool.query(
    `SELECT * FROM timesheet_entries
      WHERE id = ? AND organization_id = ?
      LIMIT 1`,
    [entryId, orgId],
  );
  return rows[0] || null;
}

async function findProjectInOrg(projectId, orgId) {
  const [rows] = await pool.query(
    `SELECT id, status FROM projects
      WHERE id = ? AND organization_id = ?
      LIMIT 1`,
    [projectId, orgId],
  );
  return rows[0] || null;
}

async function findTaskInOrg(taskId, orgId, projectId) {
  const [rows] = await pool.query(
    `SELECT id, status FROM tasks
      WHERE id = ? AND organization_id = ?
        AND project_id = ?
      LIMIT 1`,
    [taskId, orgId, projectId],
  );
  return rows[0] || null;
}

/** Load per-org settings with sane defaults. */
async function loadOrgSettings(orgId) {
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value
       FROM settings
      WHERE organization_id = ?
        AND setting_key IN ('max_hours_per_day', 'overtime_threshold')`,
    [orgId],
  );
  const map = Object.fromEntries(
    rows.map((r) => [r.setting_key, r.setting_value]),
  );
  return {
    maxHours: parseFloat(map.max_hours_per_day ?? 16),
    overtimeThreshold: parseFloat(map.overtime_threshold ?? 8),
  };
}

/* ── POST /api/timesheets ────────────────────────────── */
exports.create = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const employee_id = Number(req.user.id);

    const {
      date,
      project_id,
      task_id,
      start_time,
      end_time,
      break_minutes,
      description,
      work_summary,
    } = req.body;

    if (!date || !project_id || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "date, project_id, start_time and end_time are required",
      });
    }

    /* Per-org settings */
    const { maxHours, overtimeThreshold } = await loadOrgSettings(orgId);

    /* Project must belong to my org AND be active */
    const project = await findProjectInOrg(project_id, orgId);
    if (!project) {
      return res.status(400).json({
        success: false,
        message: "Project does not belong to your organization",
      });
    }
    if (["completed", "cancelled", "on_hold"].includes(project.status)) {
      return res.status(400).json({
        success: false,
        message: "Cannot log time to inactive/closed project",
      });
    }

    /* Employee assignment check (employees only) */
    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      const [assignments] = await pool.query(
        `SELECT id FROM project_employees
          WHERE project_id = ? AND employee_id = ? AND organization_id = ?
          LIMIT 1`,
        [project_id, employee_id, orgId],
      );
      if (!assignments.length) {
        return res.status(403).json({
          success: false,
          message: "You are not assigned to this project",
        });
      }
    }

    /* Task (optional) must belong to same project + org */
    if (task_id) {
      const task = await findTaskInOrg(task_id, orgId, project_id);
      if (!task) {
        return res.status(400).json({
          success: false,
          message: "Task does not belong to the selected project",
        });
      }
    }

    /* Duration calc (cross-midnight aware) */
    const start = new Date(`1970-01-01T${start_time}Z`);
    const end = new Date(`1970-01-01T${end_time}Z`);
    let diffHours = (end - start) / (1000 * 60 * 60);
    if (diffHours < 0) diffHours += 24;
    const total_hours = diffHours - (Number(break_minutes) || 0) / 60;

    if (total_hours <= 0) {
      return res.status(400).json({
        success: false,
        message: "Total duration must be greater than 0 minutes",
      });
    }

    /* Overlap check (scoped by employee AND org) */
    const [overlaps] = await pool.query(
      `SELECT id FROM timesheet_entries
        WHERE employee_id = ?
          AND organization_id = ?
          AND date = ?
          AND (
                (start_time <= ? AND end_time >  ?) OR
                (start_time <  ? AND end_time >= ?)
              )`,
      [employee_id, orgId, date, start_time, start_time, end_time, end_time],
    );
    if (overlaps.length) {
      return res.status(400).json({
        success: false,
        message: "This time overlaps with an existing entry for that day",
      });
    }

    /* Max-hours check */
    const [dailyTotalRow] = await pool.query(
      `SELECT COALESCE(SUM(total_hours), 0) AS daily_total
         FROM timesheet_entries
        WHERE employee_id = ? AND organization_id = ? AND date = ?`,
      [employee_id, orgId, date],
    );
    const daily_total = parseFloat(dailyTotalRow[0].daily_total || 0);
    if (daily_total + total_hours > maxHours) {
      return res.status(400).json({
        success: false,
        message: `Exceeds max allowed hours per day (${maxHours})`,
      });
    }

    /* Overtime flag */
    const is_overtime = daily_total + total_hours > overtimeThreshold;

    /* Insert with organization_id */
    const [result] = await pool.query(
      `INSERT INTO timesheet_entries
         (employee_id, date, project_id, task_id, start_time, end_time,
          break_minutes, total_hours, description, work_summary,
          is_overtime, organization_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employee_id,
        date,
        project_id,
        task_id || null,
        start_time,
        end_time,
        Number(break_minutes) || 0,
        total_hours,
        description || null,
        work_summary || null,
        is_overtime,
        orgId,
      ],
    );

    /* Overtime request also needs org_id */
    if (is_overtime) {
      const extra_hours = daily_total + total_hours - overtimeThreshold;
      await pool.query(
        `INSERT INTO overtime_requests
           (employee_id, timesheet_entry_id, date, extra_hours, reason, organization_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          employee_id,
          result.insertId,
          date,
          extra_hours,
          "Auto-generated from timesheet",
          orgId,
        ],
      );
    }

    await auditLog(req, "CREATE", "TIMESHEET", result.insertId, null, req.body);
    res.status(201).json({
      success: true,
      data: { id: result.insertId },
      message: "Timesheet entry created",
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

/* ── PUT /api/timesheets/:id ─────────────────────────── */
exports.update = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const entry = await findEntryInOrg(req.params.id, orgId);
    if (!entry) {
      return res
        .status(404)
        .json({ success: false, message: "Entry not found" });
    }

    /* Employees can only edit their own entries */
    if (
      Number(req.user.role_id) === ROLES.EMPLOYEE &&
      Number(entry.employee_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (entry.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Cannot edit approved entries",
      });
    }

    const { start_time, end_time, break_minutes, description, work_summary } =
      req.body;

    if (!start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "start_time and end_time are required",
      });
    }

    const start = new Date(`1970-01-01T${start_time}Z`);
    const end = new Date(`1970-01-01T${end_time}Z`);
    let diffHours = (end - start) / (1000 * 60 * 60);
    if (diffHours < 0) diffHours += 24;
    const total_hours = diffHours - (Number(break_minutes) || 0) / 60;

    if (total_hours <= 0) {
      return res.status(400).json({
        success: false,
        message: "Total duration must be greater than 0 minutes",
      });
    }

    await pool.query(
      `UPDATE timesheet_entries
          SET start_time = ?, end_time = ?, break_minutes = ?,
              total_hours = ?, description = ?, work_summary = ?
        WHERE id = ? AND organization_id = ?`,
      [
        start_time,
        end_time,
        Number(break_minutes) || 0,
        total_hours,
        description || null,
        work_summary || null,
        req.params.id,
        orgId,
      ],
    );

    await auditLog(req, "UPDATE", "TIMESHEET", req.params.id, entry, req.body);
    res.json({ success: true, message: "Timesheet updated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── POST /api/timesheets/:id/submit ─────────────────── */
exports.submit = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const entry = await findEntryInOrg(req.params.id, orgId);
    if (!entry) {
      return res
        .status(404)
        .json({ success: false, message: "Entry not found" });
    }

    if (
      Number(req.user.role_id) === ROLES.EMPLOYEE &&
      Number(entry.employee_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (entry.status !== "draft") {
      return res.status(400).json({
        success: false,
        message: "Only draft entries can be submitted",
      });
    }

    await pool.query(
      `UPDATE timesheet_entries SET status = 'submitted'
        WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    await auditLog(
      req,
      "SUBMIT",
      "TIMESHEET",
      req.params.id,
      { status: entry.status },
      { status: "submitted" },
    );

    res.json({ success: true, message: "Timesheet submitted" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── DELETE /api/timesheets/:id ──────────────────────── */
exports.delete = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const entry = await findEntryInOrg(req.params.id, orgId);
    if (!entry) {
      return res
        .status(404)
        .json({ success: false, message: "Entry not found" });
    }

    if (entry.status !== "draft") {
      return res.status(400).json({
        success: false,
        message: "Can only delete draft entries",
      });
    }

    if (
      Number(req.user.role_id) === ROLES.EMPLOYEE &&
      Number(entry.employee_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await pool.query(
      `DELETE FROM timesheet_entries WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    await auditLog(req, "DELETE", "TIMESHEET", req.params.id, entry, null);

    res.json({ success: true, message: "Timesheet deleted" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/timesheets ─────────────────────────────── */
exports.getAll = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    let query = `
      SELECT t.*, p.name AS project_name,
             u.first_name AS employee_first, u.last_name AS employee_last
        FROM timesheet_entries t
        LEFT JOIN projects p
               ON p.id = t.project_id
              AND p.organization_id = t.organization_id
        LEFT JOIN users u
               ON u.id = t.employee_id
              AND u.organization_id = t.organization_id
       WHERE t.organization_id = ?
    `;
    const params = [orgId];

    /* Employees only see their own entries */
    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      query += " AND t.employee_id = ?";
      params.push(req.user.id);
    }

    query += " ORDER BY t.date DESC, t.start_time DESC";

    const [entries] = await pool.query(query, params);
    res.json({ success: true, data: entries });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/timesheets/:id ─────────────────────────── */
exports.getById = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const entry = await findEntryInOrg(req.params.id, orgId);
    if (!entry) {
      return res
        .status(404)
        .json({ success: false, message: "Entry not found" });
    }

    if (
      Number(req.user.role_id) === ROLES.EMPLOYEE &&
      Number(entry.employee_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    res.json({ success: true, data: entry });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/timesheets/my-today ────────────────────── */
exports.getMyToday = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const today = new Date().toISOString().split("T")[0];
    const [entries] = await pool.query(
      `SELECT * FROM timesheet_entries
        WHERE employee_id = ? AND organization_id = ? AND date = ?`,
      [req.user.id, orgId, today],
    );
    res.json({ success: true, data: entries });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/timesheets/my-week ─────────────────────── */
exports.getMyWeek = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const [entries] = await pool.query(
      `SELECT * FROM timesheet_entries
        WHERE employee_id = ?
          AND organization_id = ?
          AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)`,
      [req.user.id, orgId],
    );
    res.json({ success: true, data: entries });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/timesheets/my-month ────────────────────── */
exports.getMyMonth = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const [entries] = await pool.query(
      `SELECT * FROM timesheet_entries
        WHERE employee_id = ?
          AND organization_id = ?
          AND MONTH(date) = MONTH(CURDATE())
          AND YEAR(date)  = YEAR(CURDATE())`,
      [req.user.id, orgId],
    );
    res.json({ success: true, data: entries });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/timesheets/my-history ──────────────────── */
exports.getMyHistory = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const { start_date, end_date } = req.query;

    let query = `
      SELECT t.*, p.name AS project_name, tk.name AS task_name
        FROM timesheet_entries t
        LEFT JOIN projects p
               ON p.id = t.project_id
              AND p.organization_id = t.organization_id
        LEFT JOIN tasks tk
               ON tk.id = t.task_id
              AND tk.organization_id = t.organization_id
       WHERE t.employee_id = ?
         AND t.organization_id = ?
    `;
    const params = [req.user.id, orgId];

    if (start_date && end_date) {
      query += " AND t.date BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }
    query += " ORDER BY t.date DESC, t.start_time DESC";

    const [entries] = await pool.query(query, params);
    res.json({ success: true, data: entries });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};
