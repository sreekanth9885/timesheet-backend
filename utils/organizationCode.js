const pool = require("../config/database");

const slug = (name) =>
  (name || "ORG")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8) || "ORG";

const suffix = (n = 4) => {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(
    { length: n },
    () => c[Math.floor(Math.random() * c.length)],
  ).join("");
};

async function generateUniqueOrgCode(companyName) {
  const base = slug(companyName);
  for (let i = 0; i < 6; i++) {
    const candidate = `${base}${suffix(4)}`;
    const [rows] = await pool.query(
      "SELECT id FROM organizations WHERE code = ? LIMIT 1",
      [candidate],
    );
    if (!rows.length) return candidate;
  }
  return `${base}${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

module.exports = { generateUniqueOrgCode };
