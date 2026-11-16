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

/** Validate a project exists in this org. Returns the row or null. */
async function findProjectInOrg(projectId, orgId) {
  const [rows] = await pool.query(
    `SELECT id, name FROM projects
      WHERE id = ? AND organization_id = ?
      LIMIT 1`,
    [projectId, orgId],
  );
  return rows[0] || null;
}

/** Validate a user exists in this org. Returns the row or null. */
async function findUserInOrg(userId, orgId) {
  const [rows] = await pool.query(
    `SELECT id, first_name, last_name
       FROM users
      WHERE id = ? AND organization_id = ?
      LIMIT 1`,
    [userId, orgId],
  );
  return rows[0] || null;
}

/** Fetch a task row only if it belongs to this org. */
async function findTaskInOrg(taskId, orgId) {
  const [rows] = await pool.query(
    `SELECT * FROM tasks
      WHERE id = ? AND organization_id = ?
      LIMIT 1`,
    [taskId, orgId],
  );
  return rows[0] || null;
}

/* ── GET /api/tasks ──────────────────────────────────── */
exports.getAll = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const { project_id, assigned_to, status, priority } = req.query;

    let query = `
      SELECT
        t.*,
        p.name AS project_name,
        u.first_name AS assignee_first,
        u.last_name  AS assignee_last
      FROM tasks t
      JOIN projects p
        ON p.id = t.project_id
       AND p.organization_id = t.organization_id
      LEFT JOIN users u
        ON u.id = t.assigned_to
       AND u.organization_id = t.organization_id
      WHERE t.organization_id = ?
    `;

    const params = [orgId];

    /* Employees see only their own tasks. */
    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      query += " AND t.assigned_to = ?";
      params.push(req.user.id);
    } else if (assigned_to) {
      query += " AND t.assigned_to = ?";
      params.push(assigned_to);
    }

    if (project_id) {
      query += " AND t.project_id = ?";
      params.push(project_id);
    }
    if (status) {
      query += " AND t.status = ?";
      params.push(status);
    }
    if (priority) {
      query += " AND t.priority = ?";
      params.push(priority);
    }

    query += " ORDER BY t.created_at DESC";

    const [tasks] = await pool.query(query, params);
    res.json({ success: true, data: tasks });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/tasks/my-tasks ─────────────────────────── */
exports.getMyTasks = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const [tasks] = await pool.query(
      `SELECT t.*, p.name AS project_name
         FROM tasks t
         JOIN projects p
           ON p.id = t.project_id
          AND p.organization_id = t.organization_id
        WHERE t.assigned_to = ?
          AND t.organization_id = ?
        ORDER BY t.created_at DESC`,
      [req.user.id, orgId],
    );
    res.json({ success: true, data: tasks });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/tasks/:id ──────────────────────────────── */
exports.getById = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    const [tasks] = await pool.query(
      `SELECT
         t.*,
         p.name AS project_name,
         u.first_name AS assignee_first,
         u.last_name  AS assignee_last
       FROM tasks t
       JOIN projects p
         ON p.id = t.project_id
        AND p.organization_id = t.organization_id
       LEFT JOIN users u
         ON u.id = t.assigned_to
        AND u.organization_id = t.organization_id
       WHERE t.id = ?
         AND t.organization_id = ?
       LIMIT 1`,
      [req.params.id, orgId],
    );

    if (!tasks.length) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    /* Employees may only read their own task */
    if (
      Number(req.user.role_id) === ROLES.EMPLOYEE &&
      Number(tasks[0].assigned_to) !== Number(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    res.json({ success: true, data: tasks[0] });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── POST /api/tasks ─────────────────────────────────── */
exports.create = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const {
      name,
      description,
      project_id,
      assigned_to,
      estimated_hours,
      due_date,
      priority,
    } = req.body;

    if (!name || !project_id) {
      return res.status(400).json({
        success: false,
        message: "Task name and project are required",
      });
    }

    /* Project must belong to caller's org */
    const project = await findProjectInOrg(project_id, orgId);
    if (!project) {
      return res.status(400).json({
        success: false,
        message: "Project does not belong to your organization",
      });
    }

    /* Assignee (if provided) must belong to same org */
    if (assigned_to) {
      const assignee = await findUserInOrg(assigned_to, orgId);
      if (!assignee) {
        return res.status(400).json({
          success: false,
          message: "Assigned user does not belong to your organization",
        });
      }
    }

    /* Employees creating tasks must be assigned to themselves
       (or unassigned) and the task requires approval. */
    const isEmployee = Number(req.user.role_id) === ROLES.EMPLOYEE;
    const is_employee_created = isEmployee;
    const approval_status = isEmployee ? "pending" : "approved";
    const finalAssignedTo = isEmployee ? req.user.id : assigned_to || null;

    const [result] = await pool.query(
      `INSERT INTO tasks
         (name, description, project_id, assigned_to, created_by,
          estimated_hours, priority, due_date,
          is_employee_created, approval_status, organization_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || null,
        project_id,
        finalAssignedTo,
        req.user.id,
        estimated_hours || null,
        priority || "medium",
        due_date || null,
        is_employee_created,
        approval_status,
        orgId,
      ],
    );

    await auditLog(req, "CREATE", "TASK", result.insertId, null, {
      ...req.body,
      organization_id: orgId,
    });

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── PUT /api/tasks/:id ──────────────────────────────── */
exports.update = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const task = await findTaskInOrg(req.params.id, orgId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    /* Only admins may update. Employees use PATCH status only. */
    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        message: "Employees cannot edit task details",
      });
    }

    const {
      name,
      description,
      assigned_to,
      estimated_hours,
      due_date,
      priority,
    } = req.body;

    /* Assignee must belong to same org */
    if (assigned_to) {
      const assignee = await findUserInOrg(assigned_to, orgId);
      if (!assignee) {
        return res.status(400).json({
          success: false,
          message: "Assigned user does not belong to your organization",
        });
      }
    }

    await pool.query(
      `UPDATE tasks
          SET name = ?, description = ?, assigned_to = ?,
              estimated_hours = ?, due_date = ?, priority = ?
        WHERE id = ? AND organization_id = ?`,
      [
        name,
        description || null,
        assigned_to || null,
        estimated_hours || null,
        due_date || null,
        priority || "medium",
        req.params.id,
        orgId,
      ],
    );

    await auditLog(req, "UPDATE", "TASK", req.params.id, null, req.body);
    res.json({ success: true, message: "Task updated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── PATCH /api/tasks/:id/status ─────────────────────── */
exports.updateStatus = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const task = await findTaskInOrg(req.params.id, orgId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    /* Employees can only update their own task status */
    if (
      Number(req.user.role_id) === ROLES.EMPLOYEE &&
      Number(task.assigned_to) !== Number(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { status } = req.body;
    const allowed = [
      "pending",
      "in_progress",
      "completed",
      "rejected",
      "on_hold",
    ];
    if (!allowed.includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    await pool.query(
      `UPDATE tasks SET status = ? WHERE id = ? AND organization_id = ?`,
      [status, req.params.id, orgId],
    );

    await auditLog(req, "UPDATE_STATUS", "TASK", req.params.id, null, {
      status,
    });
    res.json({ success: true, message: "Task status updated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── PATCH /api/tasks/:id/allocate-hours ─────────────── */
exports.allocateHours = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    /* Only admins can allocate hours */
    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        message: "Only administrators can allocate hours",
      });
    }

    const task = await findTaskInOrg(req.params.id, orgId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    const { estimated_hours } = req.body;
    if (estimated_hours == null || Number(estimated_hours) < 0) {
      return res.status(400).json({
        success: false,
        message: "A non-negative estimated_hours is required",
      });
    }

    await pool.query(
      `UPDATE tasks SET estimated_hours = ?
        WHERE id = ? AND organization_id = ?`,
      [estimated_hours, req.params.id, orgId],
    );

    await auditLog(req, "ALLOCATE_HOURS", "TASK", req.params.id, null, {
      estimated_hours,
    });
    res.json({ success: true, message: "Hours allocated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── DELETE /api/tasks/:id ───────────────────────────── */
exports.delete = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        message: "Only administrators can delete tasks",
      });
    }

    const task = await findTaskInOrg(req.params.id, orgId);
    if (!task) {
      return res
        .status(404)
        .json({ success: false, message: "Task not found" });
    }

    await pool.query(`DELETE FROM tasks WHERE id = ? AND organization_id = ?`, [
      req.params.id,
      orgId,
    ]);

    await auditLog(req, "DELETE", "TASK", req.params.id, null, null);
    res.json({ success: true, message: "Task deleted" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};
