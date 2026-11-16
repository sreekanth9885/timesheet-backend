const svc = require("../services/organizationService");

const handle = (res, next) => (err) => {
  if (err.status)
    return res
      .status(err.status)
      .json({ success: false, message: err.message });
  next(err);
};

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
    handle(res, next)(e);
  }
};

exports.listPending = async (_req, res, next) => {
  try {
    res.json({ success: true, data: await svc.listPendingOrganizations() });
  } catch (e) {
    next(e);
  }
};

exports.listAll = async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await svc.listAllOrganizations(req.query.status),
    });
  } catch (e) {
    next(e);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const data = await svc.approveOrganization(Number(req.params.id));
    res.json({
      success: true,
      message: "Organization approved and activated.",
      data,
    });
  } catch (e) {
    handle(res, next)(e);
  }
};

exports.reject = async (req, res, next) => {
  try {
    const data = await svc.rejectOrganization(
      Number(req.params.id),
      req.body.reason,
    );
    res.json({
      success: true,
      message: "Organization registration rejected.",
      data,
    });
  } catch (e) {
    handle(res, next)(e);
  }
};
