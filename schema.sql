CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone_raw TEXT NOT NULL,
  telefone_norm TEXT NOT NULL UNIQUE,
  email TEXT,
  perfil TEXT NOT NULL CHECK (perfil IN ('produtor','comercial','visitante','estudante')),
  ja_usou_boasafra INTEGER,
  marca_semente TEXT,
  comprou_ultima INTEGER,
  origem TEXT NOT NULL CHECK (origem IN ('ipad','wifi')),
  consentimento INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  day_key TEXT NOT NULL,
  hour INTEGER NOT NULL
, area_soja TEXT, cliente_boasafra INTEGER, sementes_atuais TEXT, sementes_outras TEXT, culturas TEXT, culturas_outras TEXT, comercial_empresa TEXT, comercial_regiao TEXT, comercial_cargo TEXT);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('wifi')),
  created_at TEXT NOT NULL,
  day_key TEXT NOT NULL,
  hour INTEGER NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
CREATE INDEX idx_checkins_lead_time ON checkins(lead_id, created_at);
CREATE INDEX idx_leads_day ON leads(day_key);
CREATE INDEX idx_checkins_day ON checkins(day_key);
