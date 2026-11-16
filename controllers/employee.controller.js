const pool = require("../config/database");
const bcrypt = require("bcryptjs");
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

/** Fetch a user row only if it belongs to the caller's org. */
async function findUserInOrg(userId, orgId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.organization_id
       FROM users u
      WHERE u.id = ? AND u.organization_id = ?
      LIMIT 1`,
    [userId, orgId],
  );
  return rows[0] || null;
}

/* ── GET /api/employees ──────────────────────────────── */
exports.getAll = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    let {
      page = 1,
      limit = 10,
      search = "",
      department_id,
      status,
    } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(200, Number(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    /* WHERE clause — always scoped by orgId, and never shows super admins */
    let where = `WHERE u.organization_id = ? AND u.role_id <> ?`;
    const params = [orgId, ROLES.SUPER_ADMIN];

    if (search) {
      where += ` AND (
        u.first_name LIKE ? OR u.last_name LIKE ? OR
        u.email      LIKE ? OR u.employee_id LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (department_id) {
      where += ` AND u.department_id = ?`;
      params.push(department_id);
    }
    if (status) {
      where += ` AND u.status = ?`;
      params.push(status);
    }

    /* Total */
    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
      params,
    );
    const total = countResult[0].total;

    /* Page */
    const [employees] = await pool.query(
      `SELECT u.id, u.employee_id, u.first_name, u.last_name,
              u.email, u.mobile, u.status, u.designation,
              u.department_id, u.role_id,
              d.name AS department_name, r.name AS role_name
         FROM users u
         LEFT JOIN departments d
                ON d.id = u.department_id
               AND d.organization_id = u.organization_id
         LEFT JOIN roles r ON r.id = u.role_id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT ${limitNum} OFFSET ${offset}`,
      params,
    );

    res.json({
      success: true,
      data: employees,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
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

/* ── GET /api/employees/:id ──────────────────────────── */
exports.getById = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const [users] = await pool.query(
      `SELECT u.*, d.name AS department_name, r.name AS role_name
         FROM users u
         LEFT JOIN departments d
                ON d.id = u.department_id
               AND d.organization_id = u.organization_id
         LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = ? AND u.organization_id = ?`,
      [req.params.id, orgId],
    );

    if (!users.length) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }
    delete users[0].password;
    res.json({ success: true, data: users[0] });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── POST /api/employees ─────────────────────────────── */
exports.create = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const {
      employee_id,
      first_name,
      last_name,
      email,
      password,
      mobile,
      department_id,
      designation,
      role_id,
    } = req.body;

    /* Cannot create super admins from the org console */
    if (Number(role_id) === ROLES.SUPER_ADMIN) {
      return res.status(400).json({
        success: false,
        message: "Cannot create a super admin from this endpoint.",
      });
    }

    /* Duplicate check must also be per-org (emails are globally unique in schema,
       but employee_id is scoped per-org conceptually) */
    const [existing] = await pool.query(
      `SELECT id FROM users
        WHERE organization_id = ?
          AND (email = ? OR employee_id = ?)
        LIMIT 1`,
      [orgId, email, employee_id],
    );
    if (existing.length) {
      return res.status(400).json({
        success: false,
        message: "Email or Employee ID already exists in your organization",
      });
    }

    /* If department_id supplied, verify it belongs to this org */
    if (department_id) {
      const [dept] = await pool.query(
        `SELECT id FROM departments WHERE id = ? AND organization_id = ? LIMIT 1`,
        [department_id, orgId],
      );
      if (!dept.length) {
        return res.status(400).json({
          success: false,
          message: "Department does not belong to your organization",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users
         (employee_id, first_name, last_name, email, password,
          mobile, department_id, designation, role_id, organization_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employee_id,
        first_name,
        last_name,
        email,
        hashedPassword,
        mobile || null,
        department_id || null,
        designation || null,
        role_id,
        orgId,
      ],
    );

    await auditLog(req, "CREATE", "USER", result.insertId, null, {
      employee_id,
      email,
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

/* ── PUT /api/employees/:id ──────────────────────────── */
exports.update = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const target = await findUserInOrg(req.params.id, orgId);
    if (!target) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    const {
      first_name,
      last_name,
      mobile,
      department_id,
      designation,
      role_id,
    } = req.body;

    /* Prevent escalating someone to super admin */
    if (role_id !== undefined && Number(role_id) === ROLES.SUPER_ADMIN) {
      return res.status(400).json({
        success: false,
        message: "Cannot assign the super admin role.",
      });
    }

    /* Department must belong to the same org */
    if (department_id) {
      const [dept] = await pool.query(
        `SELECT id FROM departments WHERE id = ? AND organization_id = ? LIMIT 1`,
        [department_id, orgId],
      );
      if (!dept.length) {
        return res.status(400).json({
          success: false,
          message: "Department does not belong to your organization",
        });
      }
    }

    await pool.query(
      `UPDATE users
          SET first_name = ?, last_name = ?, mobile = ?,
              department_id = ?, designation = ?, role_id = ?
        WHERE id = ? AND organization_id = ?`,
      [
        first_name,
        last_name,
        mobile || null,
        department_id || null,
        designation || null,
        role_id,
        req.params.id,
        orgId,
      ],
    );

    await auditLog(req, "UPDATE", "USER", req.params.id, null, req.body);
    res.json({ success: true, message: "Employee updated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── PATCH /api/employees/:id/status ─────────────────── */
exports.updateStatus = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const target = await findUserInOrg(req.params.id, orgId);
    if (!target) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    const { status } = req.body;
    if (!["active", "inactive", "terminated"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    /* Org admin cannot deactivate themselves */
    if (Number(req.params.id) === Number(req.user.id) && status !== "active") {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own status.",
      });
    }

    await pool.query(
      `UPDATE users SET status = ? WHERE id = ? AND organization_id = ?`,
      [status, req.params.id, orgId],
    );
    await auditLog(req, "UPDATE_STATUS", "USER", req.params.id, null, {
      status,
    });
    res.json({ success: true, message: "Status updated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── DELETE /api/employees/:id (soft) ────────────────── */
exports.delete = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const target = await findUserInOrg(req.params.id, orgId);
    if (!target) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    /* Cannot terminate yourself */
    if (Number(req.params.id) === Number(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot terminate your own account.",
      });
    }

    await pool.query(
      `UPDATE users SET status = 'terminated'
        WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    await auditLog(req, "DELETE", "USER", req.params.id, null, {
      status: "terminated",
    });
    res.json({ success: true, message: "Employee terminated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};
