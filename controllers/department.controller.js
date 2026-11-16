const pool = require("../config/database");
const auditLog = require("../middleware/auditLog");

function requireOrg(req) {
  const orgId = req.user?.organization_id;
  if (!orgId) {
    throw Object.assign(new Error("Organization context missing"), {
      status: 403,
    });
  }
  return Number(orgId);
}

/* ── GET /api/departments ────────────────────────────── */
exports.getAll = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const { search, status } = req.query;

    let where = `WHERE organization_id = ?`;
    const params = [orgId];

    if (search) {
      where += ` AND name LIKE ?`;
      params.push(`%${search}%`);
    }
    if (status) {
      where += ` AND status = ?`;
      params.push(status);
    }

    const [departments] = await pool.query(
      `SELECT id, name, description, status, organization_id, created_at
         FROM departments
         ${where}
         ORDER BY name ASC`,
      params,
    );

    res.json({ success: true, data: departments });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/departments/:id ────────────────────────── */
exports.getById = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const [rows] = await pool.query(
      `SELECT id, name, description, status, organization_id, created_at
         FROM departments
        WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── POST /api/departments ───────────────────────────── */
exports.create = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Department name is required",
      });
    }

    /* Unique per org */
    const [existing] = await pool.query(
      `SELECT id FROM departments WHERE organization_id = ? AND name = ? LIMIT 1`,
      [orgId, name.trim()],
    );
    if (existing.length) {
      return res.status(409).json({
        success: false,
        message:
          "A department with this name already exists in your organization",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO departments (name, description, organization_id)
       VALUES (?, ?, ?)`,
      [name.trim(), description || null, orgId],
    );

    await auditLog(req, "CREATE", "DEPARTMENT", result.insertId, null, {
      name,
      organization_id: orgId,
    });

    res.status(201).json({
      success: true,
      data: { id: result.insertId, name: name.trim(), organization_id: orgId },
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

/* ── PUT /api/departments/:id ────────────────────────── */
exports.update = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const { name, description } = req.body;

    const [existing] = await pool.query(
      `SELECT id FROM departments WHERE id = ? AND organization_id = ? LIMIT 1`,
      [req.params.id, orgId],
    );
    if (!existing.length) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    await pool.query(
      `UPDATE departments SET name = ?, description = ?
        WHERE id = ? AND organization_id = ?`,
      [name, description || null, req.params.id, orgId],
    );

    await auditLog(req, "UPDATE", "DEPARTMENT", req.params.id, null, req.body);
    res.json({ success: true, message: "Department updated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── PATCH /api/departments/:id/status ───────────────── */
exports.updateStatus = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const { status } = req.body;

    if (!["active", "inactive"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const [result] = await pool.query(
      `UPDATE departments SET status = ? WHERE id = ? AND organization_id = ?`,
      [status, req.params.id, orgId],
    );
    if (!result.affectedRows) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    await auditLog(req, "UPDATE_STATUS", "DEPARTMENT", req.params.id, null, {
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

/* ── DELETE /api/departments/:id (soft) ──────────────── */
exports.delete = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    /* Block delete if any employee is still in this dept */
    const [assigned] = await pool.query(
      `SELECT COUNT(*) AS n FROM users
        WHERE department_id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    if (assigned[0].n > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete a department that still has employees assigned.",
      });
    }

    const [result] = await pool.query(
      `UPDATE departments SET status = 'inactive'
        WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );
    if (!result.affectedRows) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    await auditLog(req, "DELETE", "DEPARTMENT", req.params.id, null, {
      status: "inactive",
    });
    res.json({ success: true, message: "Department deactivated" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};
