const bcrypt = require("bcryptjs");
const pool = require("../config/database");
const { ROLES, ORG_STATUS } = require("../config/constants");
const { generateUniqueOrgCode } = require("../utils/organizationCode");

async function registerOrganization({
  company_name,
  contact_person,
  email,
  mobile,
  password,
}) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [dupEmail] = await conn.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail],
    );
    if (dupEmail.length) {
      throw Object.assign(
        new Error("An account with this email already exists."),
        { status: 409 },
      );
    }

    const [dupOrg] = await conn.query(
      "SELECT id FROM organizations WHERE name = ? AND status IN ('active','pending') LIMIT 1",
      [company_name.trim()],
    );
    if (dupOrg.length) {
      throw Object.assign(
        new Error(
          "This organization is already registered or pending approval.",
        ),
        { status: 409 },
      );
    }

    // Temporary placeholder code; regenerated on approval
    const tempCode = `PEND-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    const [orgRes] = await conn.query(
      `INSERT INTO organizations (name, code, contact_person, email, phone, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [
        company_name.trim(),
        tempCode,
        contact_person.trim(),
        normalizedEmail,
        mobile || null,
      ],
    );
    const orgId = orgRes.insertId;

    const parts = contact_person.trim().split(/\s+/);
    const firstName = parts[0] || "Admin";
    const lastName = parts.slice(1).join(" ") || "";
    const employeeId = `ADMIN-${orgId}-${Date.now().toString().slice(-5)}`;
    const hash = await bcrypt.hash(password, 10);

    const [userRes] = await conn.query(
      `INSERT INTO users
         (employee_id, first_name, last_name, email, password, mobile,
          role_id, status, organization_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'inactive', ?)`,
      [
        employeeId,
        firstName,
        lastName,
        normalizedEmail,
        hash,
        mobile || null,
        ROLES.ORG_ADMIN,
        orgId,
      ],
    );

    await conn.commit();
    return {
      organization_id: orgId,
      admin_user_id: userRes.insertId,
      status: ORG_STATUS.PENDING,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function listPendingOrganizations() {
  const [rows] = await pool.query(
    `SELECT o.id, o.name, o.contact_person, o.email, o.phone,
            o.status, o.created_at,
            u.id AS admin_user_id, u.first_name AS admin_first_name,
            u.last_name AS admin_last_name, u.email AS admin_email
       FROM organizations o
       LEFT JOIN users u ON u.organization_id = o.id AND u.role_id = ?
      WHERE o.status = 'pending'
      ORDER BY o.created_at ASC`,
    [ROLES.ORG_ADMIN],
  );
  return rows;
}

async function listAllOrganizations(status) {
  const params = [];
  let where = "";
  if (status) {
    where = "WHERE o.status = ?";
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT o.id, o.name, o.code, o.contact_person, o.email, o.phone,
            o.status, o.rejection_reason, o.created_at
       FROM organizations o
       ${where}
      ORDER BY o.created_at DESC`,
    params,
  );
  return rows;
}

async function approveOrganization(orgId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT * FROM organizations WHERE id = ? FOR UPDATE",
      [orgId],
    );
    if (!rows.length)
      throw Object.assign(new Error("Organization not found"), { status: 404 });
    if (rows[0].status !== ORG_STATUS.PENDING) {
      throw Object.assign(
        new Error(
          `Cannot approve organization with status "${rows[0].status}"`,
        ),
        { status: 400 },
      );
    }

    const code = await generateUniqueOrgCode(rows[0].name);

    await conn.query(
      `UPDATE organizations
          SET status = 'active', code = ?, rejection_reason = NULL
        WHERE id = ?`,
      [code, orgId],
    );

    await conn.query(
      `UPDATE users SET status = 'active'
        WHERE organization_id = ? AND role_id = ?`,
      [orgId, ROLES.ORG_ADMIN],
    );

    await conn.commit();
    return { organization_id: orgId, organization_code: code };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function rejectOrganization(orgId, reason) {
  const [rows] = await pool.query(
    "SELECT status FROM organizations WHERE id = ?",
    [orgId],
  );
  if (!rows.length)
    throw Object.assign(new Error("Organization not found"), { status: 404 });
  if (rows[0].status !== ORG_STATUS.PENDING) {
    throw Object.assign(
      new Error(`Cannot reject organization with status "${rows[0].status}"`),
      { status: 400 },
    );
  }
  await pool.query(
    "UPDATE organizations SET status = 'rejected', rejection_reason = ? WHERE id = ?",
    [reason || null, orgId],
  );
  return { organization_id: orgId, status: ORG_STATUS.REJECTED };
}

module.exports = {
  registerOrganization,
  listPendingOrganizations,
  listAllOrganizations,
  approveOrganization,
  rejectOrganization,
};
