
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { TABLES_DDL } = require("./schema");

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
 * Returns runtime MySQL identity info without revealing sensitive credentials.
 */
async function getDatabaseIdentity() {
  const [rows] = await pool.query(
    "SELECT DATABASE() AS current_db, @@hostname AS host_name, @@port AS port_number"
  );
  return {
    database: rows[0]?.current_db || null,
    hostname: rows[0]?.host_name || null,
    port: rows[0]?.port_number || null
  };
}

/**
 * Inspects information_schema.tables to verify that required tables exist in current database.
 */
async function verifyRequiredTables() {
  const identity = await getDatabaseIdentity();
  if (!identity.database) {
    throw new Error("No database selected in MySQL session.");
  }

  const [rows] = await pool.query(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ?",
    [identity.database]
  );
  const existingTables = new Set(rows.map(r => r.TABLE_NAME.toLowerCase()));
  const required = TABLES_DDL.map(t => t.name.toLowerCase());
  const missing = required.filter(name => !existingTables.has(name));

  return {
    database: identity.database,
    hostname: identity.hostname,
    port: identity.port,
    existingTables: Array.from(existingTables),
    missingTables: missing,
    isUsersTablePresent: existingTables.has("users"),
    allPresent: missing.length === 0
  };
}

/**
 * Safe database schema initializer.
 * Runs CREATE TABLE IF NOT EXISTS for all 9 required tables and verifies their existence.
 * Never drops tables or deletes existing data.
 */
async function initDatabase() {
  const connection = await pool.getConnection();
  try {
    const [idRows] = await connection.query(
      "SELECT DATABASE() AS current_db, @@hostname AS host_name, @@port AS port_number"
    );
    const currentDb = idRows[0]?.current_db;
    const hostName = idRows[0]?.host_name;
    const portNum = idRows[0]?.port_number;

    if (!currentDb) {
      throw new Error("Cannot initialize schema: No database selected in MySQL session. Check DB_NAME.");
    }

    console.log(`[DB INIT] Target MySQL database: '${currentDb}' on server '${hostName}:${portNum}'`);

    await connection.query("SET NAMES utf8mb4");

    for (const table of TABLES_DDL) {
      try {
        await connection.query(table.sql);
      } catch (err) {
        throw new Error(`Failed executing DDL for table '${table.name}' in '${currentDb}': ${err.message}`);
      }
    }

    // Explicitly verify from information_schema.tables that tables actually exist
    const [checkRows] = await connection.query(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ?",
      [currentDb]
    );
    const existing = new Set(checkRows.map(r => r.TABLE_NAME.toLowerCase()));
    const missing = TABLES_DDL.map(t => t.name.toLowerCase()).filter(n => !existing.has(n));

    if (missing.length > 0) {
      throw new Error(
        `Database schema verification failed in '${currentDb}': Missing tables: ${missing.join(", ")}`
      );
    }

    if (!existing.has("users")) {
      throw new Error(`Critical: Table '${currentDb}.users' does not exist after initialization.`);
    }

    return {
      database: currentDb,
      hostname: hostName,
      port: portNum,
      tables: Array.from(existing)
    };
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  query,
  testConnection,
  getDatabaseIdentity,
  verifyRequiredTables,
  initDatabase
};
