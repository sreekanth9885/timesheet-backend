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

function ensureNotEmployee(req) {
  if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
    throw Object.assign(new Error("Only administrators can view audit logs"), {
      status: 403,
    });
  }
}

/* ── GET /api/audit-logs ─────────────────────────────── */
exports.getAll = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    ensureNotEmployee(req);

    const isSuperAdmin = Number(req.user.role_id) === ROLES.SUPER_ADMIN;

    /* Pagination + filters */
    let {
      page = 1,
      limit = 20,
      action,
      entity_type,
      user_id,
      start_date,
      end_date,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    /* Org scope: super admin sees all, org admin sees their org */
    let where = isSuperAdmin ? "WHERE 1=1" : "WHERE a.organization_id = ?";
    const filterParams = isSuperAdmin ? [] : [orgId];

    if (action) {
      where += " AND a.action = ?";
      filterParams.push(action);
    }
    if (entity_type) {
      where += " AND a.entity_type = ?";
      filterParams.push(entity_type);
    }
    if (user_id) {
      where += " AND a.user_id = ?";
      filterParams.push(user_id);
    }
    if (start_date && end_date) {
      where += " AND DATE(a.created_at) BETWEEN ? AND ?";
      filterParams.push(start_date, end_date);
    }

    /* Total */
    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_logs a ${where}`,
      filterParams,
    );
    const total = countResult[0].total;

    /* Page — join users only within the same org, so a cross-org user
       reassignment can never leak another tenant's name/email. */
    const [logs] = await pool.query(
      `SELECT
         a.*,
         u.first_name,
         u.last_name,
         u.email
       FROM audit_logs a
       LEFT JOIN users u
              ON u.id = a.user_id
             AND u.organization_id = a.organization_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...filterParams, limitNum, offset],
    );

    res.json({
      success: true,
      data: logs,
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

/* ── GET /api/audit-logs/:id ─────────────────────────── */
exports.getById = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    ensureNotEmployee(req);

    const isSuperAdmin = Number(req.user.role_id) === ROLES.SUPER_ADMIN;

    const where = isSuperAdmin
      ? "WHERE id = ?"
      : "WHERE id = ? AND organization_id = ?";
    const params = isSuperAdmin ? [req.params.id] : [req.params.id, orgId];

    const [logs] = await pool.query(
      `SELECT * FROM audit_logs ${where} LIMIT 1`,
      params,
    );

    if (!logs.length) {
      return res.status(404).json({
        success: false,
        message: "Audit log not found",
      });
    }

    res.json({ success: true, data: logs[0] });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── Boilerplate ─────────────────────────────────────── */
exports.create = async (_req, res) => res.json({ success: true });
exports.update = async (_req, res) => res.json({ success: true });
exports.delete = async (_req, res) => res.json({ success: true });
