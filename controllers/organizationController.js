const svc = require("../services/organizationService");

/* ── Error helper ─────────────────────────────────────── */

function handle(res, next, err) {
  if (err?.status) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
}

/* Parse & validate a positive integer from a route param. */
function parseId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw Object.assign(new Error("Invalid organization ID"), { status: 400 });
  }
  return id;
}

/* ── Public ───────────────────────────────────────────── */

exports.register = async (req, res, next) => {
  try {
    const data = await svc.registerOrganization(req.body);
    res.status(201).json({
      success: true,
      message:
        "Organization registration submitted. Awaiting super admin approval.",
      data,
    });
  } catch (e) {
    handle(res, next, e);
  }
};

/* ── Super admin ──────────────────────────────────────── */

exports.listPending = async (_req, res, next) => {
  try {
    const data = await svc.listPendingOrganizations();
    res.json({ success: true, data });
  } catch (e) {
    handle(res, next, e);
  }
};

exports.listAll = async (req, res, next) => {
  try {
    const allowedStatuses = [
      "pending",
      "active",
      "rejected",
      "suspended",
      "inactive",
    ];
    const status = req.query.status;

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status filter. Must be one of: ${allowedStatuses.join(", ")}`,
      });
    }

    const data = await svc.listAllOrganizations(status);
    res.json({ success: true, data });
  } catch (e) {
    handle(res, next, e);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const data = await svc.approveOrganization(id);
    res.json({
      success: true,
      message: "Organization approved and activated.",
      data,
    });
  } catch (e) {
    handle(res, next, e);
  }
};

exports.reject = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);

    const rawReason = req.body?.reason;
    if (rawReason != null && typeof rawReason !== "string") {
      return res.status(400).json({
        success: false,
        message: "Reason must be a string",
      });
    }
    if (rawReason && rawReason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Reason must be 500 characters or fewer",
      });
    }

    const data = await svc.rejectOrganization(id, rawReason?.trim() || null);
    res.json({
      success: true,
      message: "Organization registration rejected.",
      data,
    });
  } catch (e) {
    handle(res, next, e);
  }
};
