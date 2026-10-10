
const pool = require("./config/database");

async function testConnection() {
  try {
    const [rows] = await pool.query(
      "SELECT DATABASE() AS db, VERSION() AS mysql_version"
    );

    console.log("Database connected successfully:", rows[0]);
  } catch (error) {
    console.error("Database connection failed:", error.message);
  } finally {
    await pool.end();
  }
}

testConnection();
