
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

function getSslConfig() {
  const caPath = process.env.DB_CA_PATH || "/etc/secrets/ca.pem";
  if (fs.existsSync(caPath)) {
    try {
      return { ca: fs.readFileSync(caPath) };
    } catch (_) {}
  }
  if (process.env.DB_CA_CERT) {
    return { ca: process.env.DB_CA_CERT };
  }
  // Enable SSL fallback when connecting to remote cloud databases (e.g., Aiven)
  if (process.env.DB_HOST && !["localhost", "127.0.0.1"].includes(process.env.DB_HOST)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ai_studylab",
  ssl: getSslConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

/**
 * Safe database schema initializer.
 * Runs CREATE TABLE IF NOT EXISTS for all 9 required tables in the active database.
 * Never drops tables or deletes existing data.
 */
async function initDatabase() {
  const schemaPath = path.join(__dirname, "..", "database.sql");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const rawSql = fs.readFileSync(schemaPath, "utf8");
  const statements = rawSql
    .split(/;\s*[\r\n]+/)
    .map(stmt => stmt.trim())
    .filter(stmt => {
      const nonComment = stmt
        .split("\n")
        .filter(l => !l.trim().startsWith("--"))
        .join("\n")
        .trim();
      return nonComment.length > 0;
    });

  const connection = await pool.getConnection();
  try {
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (
        trimmed.toUpperCase().startsWith("SET NAMES") ||
        trimmed.toUpperCase().startsWith("CREATE TABLE")
      ) {
        await connection.query(trimmed);
      }
    }
    return true;
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  query,
  testConnection,
  initDatabase
};
