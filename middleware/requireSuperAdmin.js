const { ROLES } = require("../config/constants");

module.exports = (req, res, next) => {
  if (!req.user || Number(req.user.role_id) !== ROLES.SUPER_ADMIN) {
    return res
      .status(403)
      .json({ success: false, message: "Super admin access required" });
  }
  next();
};
