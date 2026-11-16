const pool = require("../config/database");
const auditLog = require("../middleware/auditLog");
const { sendSelectiveEncrypted } = require("../utils/projectEncryption");

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

async function findProjectInOrg(projectId, orgId) {
  const [rows] = await pool.query(
    `SELECT * FROM projects
      WHERE id = ? AND organization_id = ?
      LIMIT 1`,
    [projectId, orgId],
  );
  return rows[0] || null;
}

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

/* ── GET /api/projects ───────────────────────────────── */
exports.getAll = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    let projects;

    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      /* Employees see only projects they are allocated to, in their org */
      [projects] = await pool.query(
        `SELECT p.*
           FROM projects p
           INNER JOIN project_employees pe
                   ON pe.project_id = p.id
                  AND pe.organization_id = p.organization_id
          WHERE pe.employee_id = ?
            AND p.organization_id = ?
          ORDER BY p.created_at DESC`,
        [req.user.id, orgId],
      );
    } else {
      /* Org admins see every project in their org */
      [projects] = await pool.query(
        `SELECT * FROM projects
          WHERE organization_id = ?
          ORDER BY created_at DESC`,
        [orgId],
      );
    }

    return sendSelectiveEncrypted(req, res, 200, {
      success: true,
      data: projects,
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

/* ── GET /api/projects/:id ───────────────────────────── */
exports.getById = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const projectId = Number(req.params.id);

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    let projects;

    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      [projects] = await pool.query(
        `SELECT p.*
           FROM projects p
           INNER JOIN project_employees pe
                   ON pe.project_id = p.id
                  AND pe.organization_id = p.organization_id
          WHERE p.id = ?
            AND p.organization_id = ?
            AND pe.employee_id = ?
          LIMIT 1`,
        [projectId, orgId, req.user.id],
      );
    } else {
      [projects] = await pool.query(
        `SELECT * FROM projects
          WHERE id = ? AND organization_id = ?
          LIMIT 1`,
        [projectId, orgId],
      );
    }

    if (projects.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    return sendSelectiveEncrypted(req, res, 200, {
      success: true,
      data: projects[0],
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

/* ── POST /api/projects ──────────────────────────────── */
exports.create = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        message: "Only administrators can create projects",
      });
    }

    const {
      project_code,
      name,
      client_name,
      description,
      start_date,
      end_date,
      priority,
      budget_hours,
      estimated_hours,
    } = req.body;

    if (!project_code || !name) {
      return res.status(400).json({
        success: false,
        message: "Project code and name are required",
      });
    }

    /* Project code must be unique per org. project_code column is globally unique
       in your schema, so make it truly unique across tenants here too. */
    const [existing] = await pool.query(
      `SELECT id FROM projects WHERE project_code = ? LIMIT 1`,
      [project_code],
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "Project code already exists",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO projects
         (project_code, name, client_name, description,
          start_date, end_date, priority, budget_hours, estimated_hours,
          created_by, organization_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project_code,
        name,
        client_name || null,
        description || null,
        start_date || null,
        end_date || null,
        priority || "medium",
        budget_hours || null,
        estimated_hours || null,
        req.user.id,
        orgId,
      ],
    );

    await auditLog(req, "CREATE", "PROJECT", result.insertId, null, {
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

/* ── PUT /api/projects/:id ───────────────────────────── */
exports.update = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        message: "Employees cannot edit projects",
      });
    }

    const project = await findProjectInOrg(req.params.id, orgId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    const {
      name,
      client_name,
      description,
      start_date,
      end_date,
      priority,
      budget_hours,
      estimated_hours,
      status,
    } = req.body;

    await pool.query(
      `UPDATE projects
          SET name = ?, client_name = ?, description = ?,
              start_date = ?, end_date = ?, priority = ?,
              budget_hours = ?, estimated_hours = ?, status = ?
        WHERE id = ? AND organization_id = ?`,
      [
        name,
        client_name || null,
        description || null,
        start_date || null,
        end_date || null,
        priority || "medium",
        budget_hours || null,
        estimated_hours || null,
        status || project.status,
        req.params.id,
        orgId,
      ],
    );

    await auditLog(req, "UPDATE", "PROJECT", req.params.id, null, req.body);
    res.json({ success: true, message: "Project updated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── PATCH /api/projects/:id/status ──────────────────── */
exports.updateStatus = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        message: "Employees cannot change project status",
      });
    }

    const project = await findProjectInOrg(req.params.id, orgId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    const { status } = req.body;
    const allowed = ["draft", "active", "on_hold", "completed", "cancelled"];
    if (!allowed.includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    await pool.query(
      `UPDATE projects SET status = ? WHERE id = ? AND organization_id = ?`,
      [status, req.params.id, orgId],
    );

    await auditLog(req, "UPDATE_STATUS", "PROJECT", req.params.id, null, {
      status,
    });
    res.json({ success: true, message: "Project status updated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── DELETE /api/projects/:id ────────────────────────── */
exports.delete = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        message: "Only administrators can delete projects",
      });
    }

    const project = await findProjectInOrg(req.params.id, orgId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    /* tasks has FK ON DELETE RESTRICT via project_id, so delete will fail
       if tasks still reference this project. Surface a clearer error. */
    const [tasks] = await pool.query(
      `SELECT COUNT(*) AS n FROM tasks
        WHERE project_id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    if (tasks[0].n > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete a project with ${tasks[0].n} task(s) attached. Reassign or remove them first.`,
      });
    }

    await pool.query(
      `DELETE FROM projects WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );

    await auditLog(req, "DELETE", "PROJECT", req.params.id, null, null);
    res.json({ success: true, message: "Project deleted" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/projects/:id/employees ─────────────────── */
exports.getEmployees = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    const project = await findProjectInOrg(req.params.id, orgId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    const [employees] = await pool.query(
      `SELECT
         u.id, u.first_name, u.last_name, u.email,
         pe.allocation_percentage, pe.start_date, pe.end_date
       FROM project_employees pe
       JOIN users u
         ON u.id = pe.employee_id
        AND u.organization_id = pe.organization_id
       WHERE pe.project_id = ?
         AND pe.organization_id = ?`,
      [req.params.id, orgId],
    );

    res.json({ success: true, data: employees });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── POST /api/projects/:id/employees ────────────────── */
exports.allocateEmployee = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        message: "Only administrators can allocate employees",
      });
    }

    /* Project must be in my org */
    const project = await findProjectInOrg(req.params.id, orgId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    const { employee_id, allocation_percentage, start_date, end_date } =
      req.body;
    if (!employee_id) {
      return res.status(400).json({
        success: false,
        message: "employee_id is required",
      });
    }

    /* Employee must belong to the same org */
    const employee = await findUserInOrg(employee_id, orgId);
    if (!employee) {
      return res.status(400).json({
        success: false,
        message: "Employee does not belong to your organization",
      });
    }

    /* UNIQUE(project_id, employee_id) in the schema — surface a clean message */
    const [existing] = await pool.query(
      `SELECT id FROM project_employees
        WHERE project_id = ? AND employee_id = ?
        LIMIT 1`,
      [req.params.id, employee_id],
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "Employee is already allocated to this project",
      });
    }

    const pct = Number(allocation_percentage ?? 100);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({
        success: false,
        message: "allocation_percentage must be between 0 and 100",
      });
    }

    await pool.query(
      `INSERT INTO project_employees
         (project_id, employee_id, allocation_percentage,
          start_date, end_date, organization_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        employee_id,
        pct,
        start_date || null,
        end_date || null,
        orgId,
      ],
    );

    await auditLog(req, "ALLOCATE", "PROJECT", req.params.id, null, req.body);
    res.json({ success: true, message: "Employee allocated to project" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── DELETE /api/projects/:id/employees/:employeeId ──── */
exports.deallocateEmployee = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      return res.status(403).json({
        success: false,
        message: "Only administrators can deallocate employees",
      });
    }

    const project = await findProjectInOrg(req.params.id, orgId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, message: "Project not found" });
    }

    const [result] = await pool.query(
      `DELETE FROM project_employees
        WHERE project_id = ?
          AND employee_id = ?
          AND organization_id = ?`,
      [req.params.id, req.params.employeeId, orgId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Allocation not found",
      });
    }

    await auditLog(req, "DEALLOCATE", "PROJECT", req.params.id, null, {
      employeeId: req.params.employeeId,
    });
    res.json({ success: true, message: "Employee deallocated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};
