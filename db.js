const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

async function initDb() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  const schemaPath = path.join(__dirname, "schema.sql");

if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, "utf8");
  try {
    await db.exec(schema);
  } catch (err) {
    // ignora erro de tabelas já existentes
    if (!String(err.message).includes("already exists")) {
      throw err;
    }
  }
}

  return db;
}

function nowParts() {
  const d = new Date();
  const iso = d.toISOString();      // UTC
  const dayKey = iso.slice(0, 10);  // YYYY-MM-DD (UTC)
  const hour = d.getHours();        // hora local do Raspberry
  return { iso, dayKey, hour };
}

function normalizePhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "";

  // Já com 55 (55 + DDD + número)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;

  // Sem 55, com DDD (10/11 dígitos)
  if (digits.length === 10 || digits.length === 11) return "55" + digits;

  return digits;
}

module.exports = { initDb, nowParts, normalizePhone };
