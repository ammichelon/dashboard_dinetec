const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

async function initDb() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  // ✅ garante as tabelas (não quebra se já existir)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone_raw TEXT NOT NULL,
      telefone_norm TEXT NOT NULL UNIQUE,
      email TEXT,
      perfil TEXT NOT NULL,
      origem TEXT NOT NULL,
      consentimento INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      day_key TEXT NOT NULL,
      hour INTEGER NOT NULL,

      area_soja TEXT,
      cliente_boasafra INTEGER,
      comprou_ultima INTEGER,
      sementes_atuais TEXT,
      sementes_outras TEXT,
      culturas TEXT,
      culturas_outras TEXT,
      comercial_empresa TEXT,
      comercial_regiao TEXT,
      comercial_cargo TEXT
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      origem TEXT NOT NULL,
      created_at TEXT NOT NULL,
      day_key TEXT NOT NULL,
      hour INTEGER NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE INDEX IF NOT EXISTS idx_checkins_lead_time ON checkins(lead_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_leads_day ON leads(day_key);
    CREATE INDEX IF NOT EXISTS idx_checkins_day ON checkins(day_key);
  `);

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
