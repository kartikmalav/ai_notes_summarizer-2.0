#!/usr/bin/env node
/**
 * Safe Database Schema Initializer for AI StudyLab
 * Compatible with Aiven MySQL, local MySQL, or any standard MySQL 8.0+ instance.
 *
 * Runs CREATE TABLE IF NOT EXISTS for all 9 required tables.
 * Safe to rerun: Never drops or deletes existing data or tables.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const db = require("../config/db");

async function main() {
  console.log("=================================================");
  console.log("AI StudyLab - Database Schema Initializer");
  console.log("=================================================");
  console.log(`Connecting to database: ${process.env.DB_NAME || "ai_studylab"} on ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}...`);

  try {
    await db.testConnection();
    console.log("✓ MySQL connection verified successfully.");

    console.log("Running safe schema initialization (CREATE TABLE IF NOT EXISTS)...");
    await db.initDatabase();
    console.log("✓ Schema initialization completed successfully.");

    // Query SHOW TABLES to display verified tables
    const tables = await db.query("SHOW TABLES");
    const tableKey = Object.keys(tables[0] || {})[0];
    const tableNames = tables.map(r => r[tableKey]);

    console.log(`\nVerified ${tableNames.length} tables present in ${process.env.DB_NAME || "database"}:`);
    tableNames.forEach((name, i) => {
      console.log(`  ${i + 1}. ${name}`);
    });

    console.log("\nAll required tables are ready. You can now use signup, login, and all AI study tools.");
  } catch (err) {
    console.error("\n✗ Database initialization failed:", err.message);
    if (err.code === "ER_BAD_DB_ERROR") {
      console.error(`Database '${process.env.DB_NAME}' does not exist on the MySQL server.`);
    } else if (err.code === "ER_ACCESS_DENIED_ERROR") {
      console.error("Access denied. Please check your DB_USER, DB_PASSWORD, and SSL settings in .env.");
    }
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

main();

