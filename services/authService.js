const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { ORG_STATUS } = require("../config/constants");

const INVALID = "Invalid email or password";

async function authenticate(rawEmail, password) {
  const email = String(rawEmail).trim().toLowerCase();

  const [rows] = await pool.query(
    `SELECT u.*,
            o.name   AS organization_name,
            o.code   AS organization_code,
            o.status AS organization_status
       FROM users u
       INNER JOIN organizations o ON o.id = u.organization_id
      WHERE u.email = ?
      LIMIT 1`,
    [email],
  );

  if (!rows.length) throw Object.assign(new Error(INVALID), { status: 401 });

  const user = rows[0];

  // Organization-status gate — gives clear UX before password check
  switch (user.organization_status) {
    case ORG_STATUS.PENDING:
      throw Object.assign(
        new Error(
          "Your organization registration is pending approval. Please try again later.",
        ),
        { status: 403 },
      );
    case ORG_STATUS.REJECTED:
      throw Object.assign(
        new Error(
          "Your organization registration was rejected. Please contact support.",
        ),
        { status: 403 },
      );
    case ORG_STATUS.SUSPENDED:
      throw Object.assign(
        new Error("Your organization account is suspended."),
        { status: 403 },
      );
    case ORG_STATUS.ACTIVE:
      break;
    default:
      throw Object.assign(
        new Error("Your organization account is not active."),
        { status: 403 },
      );
  }

  if (user.status !== "active") {
    throw Object.assign(
      new Error("Your account is inactive. Please contact your administrator."),
      { status: 403 },
    );
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw Object.assign(new Error(INVALID), { status: 401 });

  const token = jwt.sign(
    {
      id: user.id,
      user_id: user.id, // per requirement
      role_id: user.role_id,
      employee_id: user.employee_id,
      organization_id: user.organization_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );

  delete user.password;
  delete user.organization_status; // don't leak internal

  return { token, user };
}

module.exports = { authenticate };
