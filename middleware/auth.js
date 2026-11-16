const jwt = require("jsonwebtoken");
const pool = require("../config/database");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Support old tokens during migration.
    const [users] = await pool.query(
      `SELECT id, role_id, employee_id, organization_id
             FROM users
             WHERE id = ?
               AND status = 'active'
             LIMIT 1`,
      [decoded.id],
    );

    if (!users.length) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    const user = users[0];

    // New tokens must match the user's current organization.
    if (
      decoded.organization_id &&
      Number(decoded.organization_id) !== Number(user.organization_id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Invalid organization context",
      });
    }

    req.user = {
      ...decoded,
      id: user.id,
      role_id: user.role_id,
      employee_id: user.employee_id,
      organization_id: user.organization_id,
    };

    req.organizationId = user.organization_id;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid token.",
    });
  }
};

module.exports = auth;
