const pool = require("../config/database");
const auditLog = require("../middleware/auditLog");

const ROLES = { SUPER_ADMIN: 1, ORG_ADMIN: 2, EMPLOYEE: 3 };

/* ── Per-entity metadata ─────────────────────────────── */
/* Everything that differs between the three approvable types lives here,
   so the approve/reject/getPending logic stays generic.                */

const ENTITY = {
  timesheet: {
    table: "timesheet_entries",
    statusColumn: "status",
    pendingValue: "submitted", // timesheets sit in "submitted" awaiting approval
    ownerColumn: "employee_id", // column used for self-approval check
    approvedValue: "approved",
    rejectedValue: "rejected",
  },
  overtime: {
    table: "overtime_requests",
    statusColumn: "status",
    pendingValue: "pending",
    ownerColumn: "employee_id",
    approvedValue: "approved",
    rejectedValue: "rejected",
    extraUpdates: "reviewed_by = ?, reviewed_at = NOW(), remarks = ?",
  },
  task: {
    table: "tasks",
    statusColumn: "approval_status",
    pendingValue: "pending",
    ownerColumn: "created_by",
    approvedValue: "approved",
    rejectedValue: "rejected",
  },
};

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
    throw Object.assign(
      new Error("Only administrators can approve or reject entries"),
      { status: 403 },
    );
  }
}

function getEntityMeta(entity_type) {
  const meta = ENTITY[entity_type];
  if (!meta) {
    throw Object.assign(
      new Error(
        "Invalid entity_type. Must be one of: timesheet, overtime, task",
      ),
      { status: 400 },
    );
  }
  return meta;
}

/**
 * Fetch the entity row scoped to the caller's org, verify it exists,
 * verify it is still pending, and enforce self-approval protection.
 * Throws if any check fails — caller wraps in try/catch (with rollback).
 */
async function loadAndValidateEntity(conn, entity_type, entity_id, req, orgId) {
  const meta = getEntityMeta(entity_type);

  const [rows] = await conn.query(
    `SELECT id, ${meta.ownerColumn} AS owner_id,
            ${meta.statusColumn} AS current_status
       FROM ${meta.table}
      WHERE id = ? AND organization_id = ?
      LIMIT 1
      FOR UPDATE`,
    [entity_id, orgId],
  );

  if (!rows.length) {
    throw Object.assign(new Error(`${entity_type} not found`), { status: 404 });
  }

  const row = rows[0];

  if (row.current_status !== meta.pendingValue) {
    throw Object.assign(
      new Error(
        `Cannot act on a ${entity_type} with status "${row.current_status}" ` +
          `(expected "${meta.pendingValue}")`,
      ),
      { status: 400 },
    );
  }

  /* Self-approval / self-rejection guard */
  if (Number(row.owner_id) === Number(req.user.id)) {
    throw Object.assign(
      new Error(
        `You cannot approve or reject your own ${entity_type}. ` +
          `Ask another administrator to review it.`,
      ),
      { status: 403 },
    );
  }

  return { meta, row };
}

/* ── GET /api/approvals/pending ──────────────────────── */
exports.getPending = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    ensureAdmin(req);

    /* Timesheets */
    const [timesheets] = await pool.query(
      `SELECT t.*, p.name AS project_name,
              u.first_name, u.last_name
         FROM timesheet_entries t
         JOIN projects p
           ON p.id = t.project_id
          AND p.organization_id = t.organization_id
         JOIN users u
           ON u.id = t.employee_id
          AND u.organization_id = t.organization_id
        WHERE t.status = 'submitted'
          AND t.organization_id = ?`,
      [orgId],
    );

    /* Overtime */
    const [overtime] = await pool.query(
      `SELECT o.*, u.first_name, u.last_name
         FROM overtime_requests o
         JOIN users u
           ON u.id = o.employee_id
          AND u.organization_id = o.organization_id
        WHERE o.status = 'pending'
          AND o.organization_id = ?`,
      [orgId],
    );

    /* Employee-created tasks */
    const [tasks] = await pool.query(
      `SELECT t.*, p.name AS project_name,
              u.first_name, u.last_name
         FROM tasks t
         JOIN projects p
           ON p.id = t.project_id
          AND p.organization_id = t.organization_id
         JOIN users u
           ON u.id = t.created_by
          AND u.organization_id = t.organization_id
        WHERE t.approval_status = 'pending'
          AND t.organization_id = ?`,
      [orgId],
    );

    res.json({ success: true, data: { timesheets, overtime, tasks } });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── Shared core for approve / reject ────────────────── */
async function processDecision(req, res, next, decision) {
  const conn = await pool.getConnection();
  try {
    const orgId = requireOrg(req);
    ensureAdmin(req);

    const { entity_type, entity_id, comments } = req.body;
    if (!entity_type || !entity_id) {
      return res.status(400).json({
        success: false,
        message: "entity_type and entity_id are required",
      });
    }

    await conn.beginTransaction();

    const { meta } = await loadAndValidateEntity(
      conn,
      entity_type,
      entity_id,
      req,
      orgId,
    );

    const newStatus =
      decision === "approved" ? meta.approvedValue : meta.rejectedValue;

    /* 1. Record the decision (also gets organization_id) */
    await conn.query(
      `INSERT INTO approvals
         (entity_type, entity_id, approver_id, status, comments, organization_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [entity_type, entity_id, req.user.id, decision, comments || null, orgId],
    );

    /* 2. Update the entity */
    if (entity_type === "overtime") {
      await conn.query(
        `UPDATE overtime_requests
            SET status = ?, ${meta.extraUpdates}
          WHERE id = ? AND organization_id = ?`,
        [newStatus, req.user.id, comments || null, entity_id, orgId],
      );
    } else {
      await conn.query(
        `UPDATE ${meta.table}
            SET ${meta.statusColumn} = ?
          WHERE id = ? AND organization_id = ?`,
        [newStatus, entity_id, orgId],
      );
    }

    await conn.commit();

    await auditLog(
      req,
      decision === "approved" ? "APPROVE" : "REJECT",
      entity_type.toUpperCase(),
      entity_id,
      null,
      { comments: comments || null, organization_id: orgId },
    );

    res.json({
      success: true,
      message: `${entity_type} ${decision} successfully`,
    });
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }

    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  } finally {
    conn.release();
  }
}

/* ── POST /api/approvals/approve ─────────────────────── */
exports.approve = async (req, res, next) =>
  processDecision(req, res, next, "approved");

/* ── POST /api/approvals/reject ──────────────────────── */
exports.reject = async (req, res, next) =>
  processDecision(req, res, next, "rejected");

/* ── Boilerplate kept for router compatibility ───────── */
exports.getAll = async (req, res, next) => exports.getPending(req, res, next);
exports.getById = async (_req, res) => res.json({ success: true });
exports.create = async (_req, res) => res.json({ success: true });
exports.update = async (_req, res) => res.json({ success: true });
exports.delete = async (_req, res) => res.json({ success: true });
