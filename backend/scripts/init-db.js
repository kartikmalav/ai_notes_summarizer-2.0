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
    const identity = await db.getDatabaseIdentity();
    console.log(`✓ MySQL connection verified successfully.`);
    console.log(`  Connected Database: ${identity.database}`);
    console.log(`  Server Hostname:    ${identity.hostname}`);
    console.log(`  Server Port:        ${identity.port}`);

    console.log("\nRunning safe schema initialization (CREATE TABLE IF NOT EXISTS)...");
    const initRes = await db.initDatabase();
    console.log(`✓ Schema initialization completed successfully.`);

    const verification = await db.verifyRequiredTables();
    console.log(`\nVerified ${verification.existingTables.length} tables present in '${verification.database}' via information_schema:`);
    verification.existingTables.forEach((name, i) => {
      console.log(`  ${i + 1}. ${name}`);
    });

    if (!verification.isUsersTablePresent) {
      throw new Error(`CRITICAL: 'users' table is missing from '${verification.database}'!`);
    }

    console.log("\n✓ 'users' table is confirmed present and ready for signups.");
    console.log("All required tables are verified. You can now use signup, login, and all AI study tools.");
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

