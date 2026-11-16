const pool = require("../config/database");
const auditLog = require("../middleware/auditLog");

const ROLES = { SUPER_ADMIN: 1, ORG_ADMIN: 2, EMPLOYEE: 3 };

/* ── Guards & helpers ────────────────────────────────── */

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
      new Error("Only administrators can approve or reject overtime"),
      { status: 403 },
    );
  }
}

async function findOvertimeInOrg(
  conn,
  overtimeId,
  orgId,
  { forUpdate = false } = {},
) {
  const runner = conn || pool;
  const [rows] = await runner.query(
    `SELECT * FROM overtime_requests
      WHERE id = ? AND organization_id = ?
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [overtimeId, orgId],
  );
  return rows[0] || null;
}

async function findTimesheetEntryInOrg(conn, entryId, orgId) {
  const runner = conn || pool;
  const [rows] = await runner.query(
    `SELECT id, employee_id FROM timesheet_entries
      WHERE id = ? AND organization_id = ?
      LIMIT 1`,
    [entryId, orgId],
  );
  return rows[0] || null;
}

/* ── GET /api/overtime ───────────────────────────────── */
exports.getAll = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    let query = `
      SELECT o.*, u.first_name, u.last_name, u.employee_id AS emp_code
        FROM overtime_requests o
        JOIN users u
          ON u.id = o.employee_id
         AND u.organization_id = o.organization_id
       WHERE o.organization_id = ?
    `;
    const params = [orgId];

    /* Employees only see their own requests. */
    if (Number(req.user.role_id) === ROLES.EMPLOYEE) {
      query += " AND o.employee_id = ?";
      params.push(req.user.id);
    }

    query += " ORDER BY o.created_at DESC";

    const [requests] = await pool.query(query, params);
    res.json({ success: true, data: requests });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};

/* ── GET /api/overtime/:id ───────────────────────────── */
exports.getById = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);

    const [rows] = await pool.query(
      `SELECT o.*, u.first_name, u.last_name
         FROM overtime_requests o
         JOIN users u
           ON u.id = o.employee_id
          AND u.organization_id = o.organization_id
        WHERE o.id = ? AND o.organization_id = ?
        LIMIT 1`,
      [req.params.id, orgId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Overtime request not found",
      });
    }

    /* Employees may only read their own request. */
    if (
      Number(req.user.role_id) === ROLES.EMPLOYEE &&
      Number(rows[0].employee_id) !== Number(req.user.id)
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
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

/* ── Shared core for approve / reject ────────────────── */
async function processDecision(req, res, next, decision) {
  const conn = await pool.getConnection();
  try {
    const orgId = requireOrg(req);
    ensureAdmin(req);

    await conn.beginTransaction();

    const ot = await findOvertimeInOrg(conn, req.params.id, orgId, {
      forUpdate: true,
    });
    if (!ot) {
      throw Object.assign(new Error("Overtime request not found"), {
        status: 404,
      });
    }

    /* Only pending can transition. */
    if (ot.status !== "pending") {
      throw Object.assign(
        new Error(
          `Cannot ${decision} a request with status "${ot.status}" (already reviewed).`,
        ),
        { status: 400 },
      );
    }

    /* Self-review guard. */
    if (Number(ot.employee_id) === Number(req.user.id)) {
      throw Object.assign(
        new Error(
          "You cannot review your own overtime request. Ask another administrator.",
        ),
        { status: 403 },
      );
    }

    const remarks = req.body.remarks || "";

    await conn.query(
      `UPDATE overtime_requests
          SET status = ?, reviewed_by = ?, reviewed_at = NOW(), remarks = ?
        WHERE id = ? AND organization_id = ?`,
      [decision, req.user.id, remarks, req.params.id, orgId],
    );

    /* On approval, also flag the linked timesheet entry (org-scoped). */
    if (decision === "approved" && ot.timesheet_entry_id) {
      await conn.query(
        `UPDATE timesheet_entries
            SET is_overtime = TRUE
          WHERE id = ? AND organization_id = ?`,
        [ot.timesheet_entry_id, orgId],
      );
    }

    await conn.commit();

    await auditLog(
      req,
      decision === "approved" ? "APPROVE" : "REJECT",
      "OVERTIME",
      req.params.id,
      null,
      { remarks, organization_id: orgId },
    );

    res.json({
      success: true,
      message: `Overtime ${decision}`,
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

/* ── POST /api/overtime/:id/approve ──────────────────── */
exports.approve = async (req, res, next) =>
  processDecision(req, res, next, "approved");

/* ── POST /api/overtime/:id/reject ───────────────────── */
exports.reject = async (req, res, next) =>
  processDecision(req, res, next, "rejected");

/* ── POST /api/overtime ──────────────────────────────── */
exports.create = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const employee_id = Number(req.user.id);
    const { date, extra_hours, reason, timesheet_entry_id } = req.body;

    if (!date || extra_hours == null || Number(extra_hours) <= 0) {
      return res.status(400).json({
        success: false,
        message: "date and a positive extra_hours value are required",
      });
    }

    /* If linking a timesheet entry, it must be my own + in my org. */
    if (timesheet_entry_id) {
      const entry = await findTimesheetEntryInOrg(
        null,
        timesheet_entry_id,
        orgId,
      );
      if (!entry) {
        return res.status(400).json({
          success: false,
          message: "Linked timesheet entry not found in your organization",
        });
      }
      if (Number(entry.employee_id) !== employee_id) {
        return res.status(403).json({
          success: false,
          message: "You can only attach your own timesheet entries",
        });
      }
    }

    const proof_file = req.file ? req.file.filename : null;

    /* Insert overtime with organization_id. */
    const [result] = await pool.query(
      `INSERT INTO overtime_requests
         (employee_id, timesheet_entry_id, date, extra_hours,
          reason, proof_file, organization_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        employee_id,
        timesheet_entry_id || null,
        date,
        extra_hours,
        reason || null,
        proof_file,
        orgId,
      ],
    );

    /* Proof record also needs org scoping. */
    if (req.file) {
      await pool.query(
        `INSERT INTO proofs
           (entity_type, entity_id, file_name, file_path,
            file_type, file_size, uploaded_by, organization_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "overtime",
          result.insertId,
          req.file.originalname,
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          employee_id,
          orgId,
        ],
      );
    }

    await auditLog(req, "CREATE", "OVERTIME", result.insertId, null, {
      date,
      extra_hours,
      reason,
      organization_id: orgId,
    });

    res.status(201).json({
      success: true,
      data: { id: result.insertId },
      message: "Overtime request submitted successfully",
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

/* ── PUT /api/overtime/:id (kept stubbed for router compat) */
exports.update = async (_req, res) => res.json({ success: true });

/* ── DELETE /api/overtime/:id ────────────────────────── */
exports.delete = async (req, res, next) => {
  try {
    const orgId = requireOrg(req);
    const ot = await findOvertimeInOrg(null, req.params.id, orgId);

    if (!ot) {
      return res.status(404).json({
        success: false,
        message: "Overtime request not found",
      });
    }

    /* Only the owner can delete, and only while still pending. */
    if (Number(ot.employee_id) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own overtime requests",
      });
    }
    if (ot.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending requests can be deleted",
      });
    }

    await pool.query(
      `DELETE FROM overtime_requests
        WHERE id = ? AND organization_id = ?`,
      [req.params.id, orgId],
    );

    await auditLog(req, "DELETE", "OVERTIME", req.params.id);
    res.json({ success: true, message: "Overtime request deleted" });
  } catch (error) {
    if (error.status) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};
