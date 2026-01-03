require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const fs = require("fs");

// Persistência (Railway Volume)
const DATA_DIR = process.env.DATA_DIR || null;
const DB_PATH = process.env.DB_PATH || null;
if (DB_PATH) process.env.DB_PATH = DB_PATH;

// Segurança ingest
const INGEST_TOKEN = process.env.INGEST_TOKEN || "";

// DB helpers
const { initDb, nowParts, normalizePhone } = require("./db");

const PORT = process.env.PORT || 3000;
const CHECKIN_COOLDOWN_MIN = Number(process.env.CHECKIN_COOLDOWN_MIN || 30);

// ===== CSV helpers =====
function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows, headers) {
  const head = headers.map(csvEscape).join(",");
  const body = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}
function safeDayKey(s) {
  const v = String(s || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}
function parseJsonArrayMaybe(s) {
  if (!s) return [];
  const t = String(s).trim();
  if (!t) return [];
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ✅ Página de sucesso iOS-friendly
function renderSuccessHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="cache-control" content="no-store, no-cache, must-revalidate" />
  <meta http-equiv="pragma" content="no-cache" />
  <meta http-equiv="expires" content="-1" />
  <title>Internet liberada</title>
  <style>
    :root{ --g1:#0b5a2a; --g2:#1f7a36; --line:#e7edf0; --muted:#5b677a; }
    *{box-sizing:border-box}
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;background:#fff;padding:18px}
    .wrap{max-width:420px;margin:0 auto}
    .logo{display:flex;justify-content:center;margin-bottom:10px}
    .logo img{width:100%;max-width:220px;height:auto}
    .card{border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 10px 22px rgba(0,0,0,.08)}
    h1{margin:0 0 8px;color:var(--g1);font-size:20px}
    p{margin:0 0 14px;color:var(--muted);font-size:14px;line-height:1.35}
    button{width:100%;padding:12px;border:0;border-radius:12px;font-weight:900;font-size:15px;color:#fff;background:linear-gradient(90deg,var(--g1),var(--g2));cursor:pointer}
    .small{margin-top:10px;color:#7a8799;font-size:12px;text-align:center}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo"><img src="/logo_bs.png" alt="Boa Safra"></div>
    <div class="card">
      <h1>Internet liberada ✅</h1>
      <p>Seu acesso já foi liberado. Se esta tela não fechar sozinha, toque em <b>OK</b>.</p>
      <button onclick="tryClose()">OK</button>
      <div class="small">Você já pode navegar normalmente.</div>
    </div>
  </div>
  <script>
    function tryClose(){
      try { window.close(); } catch(e){}
      document.body.innerHTML =
        '<div style="font-family:system-ui;padding:18px;color:#0b5a2a;font-weight:900">Conectado ✅ Pode fechar esta aba.</div>';
    }
    setTimeout(tryClose, 900);
  </script>
</body>
</html>`;
}

async function fetchCountsByOrigem(db, whereSql, params) {
  const rows = await db.all(`SELECT origem, COUNT(*) as n FROM leads ${whereSql} GROUP BY origem`, params);
  const wifi = rows.find((r) => r.origem === "wifi")?.n ?? 0;
  const ipad = rows.find((r) => r.origem === "ipad")?.n ?? 0;
  return { wifi, ipad };
}

// Agregados do PRODUTOR
async function producerAggregates(db, dayKey = null) {
  const params = [];
  let where = "WHERE perfil = 'produtor'";
  if (dayKey) {
    where += " AND day_key = ?";
    params.push(dayKey);
  }

  const rows = await db.all(
    `SELECT area_soja, sementes_atuais, sementes_outras, culturas, culturas_outras
     FROM leads ${where}`,
    params
  );

  const area = new Map();
  const sementes = new Map();
  const culturas = new Map();

  const inc = (m, k) => {
    const key = String(k || "").trim();
    if (!key) return;
    m.set(key, (m.get(key) || 0) + 1);
  };

  for (const r of rows) {
    inc(area, r.area_soja);

    const sArr = parseJsonArrayMaybe(r.sementes_atuais);
    for (const s of sArr) inc(sementes, s);

    const sOut = String(r.sementes_outras || "").trim();
    if (sOut) inc(sementes, `Outras: ${sOut}`);

    const cArr = parseJsonArrayMaybe(r.culturas);
    for (const c of cArr) inc(culturas, c);

    const cOut = String(r.culturas_outras || "").trim();
    if (cOut) inc(culturas, `Outras: ${cOut}`);
  }

  const toArr = (m) =>
    Array.from(m.entries())
      .map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n);

  return {
    produtor_total: rows.length,
    produtor_area_soja: toArr(area),
    produtor_sementes: toArr(sementes),
    produtor_culturas: toArr(culturas),
  };
}

async function dashboardForDay(db, dayKey) {
  const leads = await db.get("SELECT COUNT(*) as n FROM leads WHERE day_key = ?", dayKey);
  const checkins = await db.get("SELECT COUNT(*) as n FROM checkins WHERE day_key = ?", dayKey);
  const { wifi, ipad } = await fetchCountsByOrigem(db, "WHERE day_key = ?", [dayKey]);

  const byPerfil = await db.all(
    "SELECT perfil, COUNT(*) as n FROM leads WHERE day_key = ? GROUP BY perfil ORDER BY n DESC",
    dayKey
  );

  const byHour = await db.all(
    "SELECT hour, COUNT(*) as n FROM checkins WHERE day_key = ? GROUP BY hour ORDER BY hour",
    dayKey
  );

  const prodAgg = await producerAggregates(db, dayKey);

  return {
    ok: true,
    mode: "day",
    day: dayKey,
    leads_total: leads.n ?? 0,
    leads_wifi: wifi,
    leads_ipad: ipad,
    checkins_total: checkins.n ?? 0,
    leads_by_perfil: byPerfil,
    checkins_by_hour: byHour,
    ...prodAgg,
  };
}

async function dashboardSummary(db) {
  const leads = await db.get("SELECT COUNT(*) as n FROM leads");
  const checkins = await db.get("SELECT COUNT(*) as n FROM checkins");
  const { wifi, ipad } = await fetchCountsByOrigem(db, "", []);

  const byPerfil = await db.all("SELECT perfil, COUNT(*) as n FROM leads GROUP BY perfil ORDER BY n DESC");
  const byDayLeads = await db.all("SELECT day_key, COUNT(*) as n FROM leads GROUP BY day_key ORDER BY day_key");
  const byDayCheckins = await db.all("SELECT day_key, COUNT(*) as n FROM checkins GROUP BY day_key ORDER BY day_key");

  const prodAgg = await producerAggregates(db, null);

  return {
    ok: true,
    mode: "summary",
    leads_total: leads.n ?? 0,
    leads_wifi: wifi,
    leads_ipad: ipad,
    checkins_total: checkins.n ?? 0,
    leads_by_perfil: byPerfil,
    leads_by_day: byDayLeads,
    checkins_by_day: byDayCheckins,
    ...prodAgg,
  };
}

// CSV limpo
async function exportLeadsClean(db, dayKey = null) {
  const params = [];
  let where = "";
  if (dayKey) {
    where = "WHERE day_key = ?";
    params.push(dayKey);
  }

  return db.all(
    `
    SELECT
      created_at       AS created_at,
      nome             AS nome,
      telefone_raw     AS telefone,
      email            AS email,
      perfil           AS perfil,
      origem           AS origem,
      consentimento    AS consentimento,

      area_soja        AS area_soja,
      cliente_boasafra AS cliente_boasafra,
      comprou_ultima   AS comprou_ultima,
      sementes_atuais  AS sementes_atuais,
      sementes_outras  AS sementes_outras,
      culturas         AS culturas,
      culturas_outras  AS culturas_outras,

      comercial_empresa AS comercial_empresa,
      comercial_regiao  AS comercial_regiao,
      comercial_cargo   AS comercial_cargo
    FROM leads
    ${where}
    ORDER BY datetime(created_at) DESC
    `,
    params
  );
}

const EXPORT_LEADS_HEADERS = [
  "created_at",
  "nome",
  "telefone",
  "email",
  "perfil",
  "origem",
  "consentimento",
  "area_soja",
  "cliente_boasafra",
  "comprou_ultima",
  "sementes_atuais",
  "sementes_outras",
  "culturas",
  "culturas_outras",
  "comercial_empresa",
  "comercial_regiao",
  "comercial_cargo",
];

// ====== Start ======
(async () => {
  const db = await initDb();

  // garante índice único p/ não duplicar checkins no Railway
  try {
    await db.run("CREATE UNIQUE INDEX IF NOT EXISTS ux_checkins_lead_time ON checkins(lead_id, created_at)");
  } catch {}

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    if (req.path.endsWith(".html")) res.setHeader("Content-Type", "text/html; charset=utf-8");
    next();
  });

  app.use(express.static(path.join(__dirname, "public")));

  // BACKUP CSV (30 min)
  async function autoCsvBackup() {
    try {
      const baseDir = DATA_DIR ? path.resolve(DATA_DIR) : __dirname;
      const backupDir = path.join(baseDir, "backups");
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const rows = await exportLeadsClean(db, null);
      const csv = toCsv(rows, EXPORT_LEADS_HEADERS);

      const now = new Date();
      const stamp =
        now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") +
        "-" +
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0");

      fs.writeFileSync(path.join(backupDir, `leads-clean-${stamp}.csv`), "\uFEFF" + csv, "utf8");
      fs.writeFileSync(path.join(backupDir, "latest.csv"), "\uFEFF" + csv, "utf8");
      console.log(`[BACKUP] CSV (limpo) salvo: leads-clean-${stamp}.csv (rows: ${rows.length})`);
    } catch (err) {
      console.error("[BACKUP] erro:", err);
    }
  }
  autoCsvBackup();
  setInterval(autoCsvBackup, 30 * 60 * 1000);

  async function getLeadByPhoneNorm(phoneNorm) {
    return db.get("SELECT * FROM leads WHERE telefone_norm = ?", phoneNorm);
  }

  async function createLead(payload, origem) {
    const { iso, dayKey, hour } = nowParts();
    const telefoneNorm = normalizePhone(payload.telefone || payload.telefone_raw);
    if (!telefoneNorm) throw new Error("Telefone inválido");

    const perfil = payload.perfil;
    const consentimento = payload.consentimento === false ? 0 : 1;

    const area_soja = (payload.area_soja || "").trim() || null;

    let cliente_boasafra = null;
    if (payload.cliente_boasafra === true) cliente_boasafra = 1;
    else if (payload.cliente_boasafra === false) cliente_boasafra = 0;

    let comprou_ultima = null;
    if (payload.comprou_ultima === true) comprou_ultima = 1;
    else if (payload.comprou_ultima === false) comprou_ultima = 0;

    const sementes_atuais = Array.isArray(payload.sementes_atuais) ? JSON.stringify(payload.sementes_atuais) : (payload.sementes_atuais || null);
    const sementes_outras = (payload.sementes_outras || "").trim() || null;

    const culturas = Array.isArray(payload.culturas) ? JSON.stringify(payload.culturas) : (payload.culturas || null);
    const culturas_outras = (payload.culturas_outras || "").trim() || null;

    const comercial_empresa = (payload.comercial_empresa || "").trim() || null;
    const comercial_regiao = (payload.comercial_regiao || "").trim() || null;
    const comercial_cargo = (payload.comercial_cargo || "").trim() || null;

    const created_at = payload.created_at || iso;
    const day_key = payload.day_key || dayKey;
    const hh = Number.isFinite(payload.hour) ? payload.hour : hour;

    await db.run(
      `INSERT OR IGNORE INTO leads
      (nome, telefone_raw, telefone_norm, email, perfil,
       area_soja, cliente_boasafra, comprou_ultima, sementes_atuais, sementes_outras, culturas, culturas_outras,
       comercial_empresa, comercial_regiao, comercial_cargo,
       origem, consentimento, created_at, day_key, hour)
      VALUES (?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?, ?, ?)`,
      [
        (payload.nome || "").trim(),
        String(payload.telefone_raw || payload.telefone || ""),
        telefoneNorm,
        (payload.email || "").trim() || null,
        perfil,

        (perfil === "produtor" ? area_soja : null),
        (perfil === "produtor" ? cliente_boasafra : null),
        (perfil === "produtor" ? comprou_ultima : null),
        (perfil === "produtor" ? sementes_atuais : null),
        (perfil === "produtor" ? sementes_outras : null),
        (perfil === "produtor" ? culturas : null),
        (perfil === "produtor" ? culturas_outras : null),

        (perfil === "comercial" ? comercial_empresa : null),
        (perfil === "comercial" ? comercial_regiao : null),
        (perfil === "comercial" ? comercial_cargo : null),

        origem,
        consentimento,
        created_at,
        day_key,
        hh,
      ]
    );

    return getLeadByPhoneNorm(telefoneNorm);
  }

  async function maybeCreateCheckin(leadId) {
    const { iso, dayKey, hour } = nowParts();
    const last = await db.get("SELECT created_at FROM checkins WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1", leadId);
    if (last?.created_at) {
      const lastMs = Date.parse(last.created_at);
      const nowMs = Date.parse(iso);
      const diffMin = (nowMs - lastMs) / 60000;
      if (diffMin < CHECKIN_COOLDOWN_MIN) return { created: false, diffMin };
    }
    await db.run("INSERT INTO checkins (lead_id, origem, created_at, day_key, hour) VALUES (?, 'wifi', ?, ?, ?)", [
      leadId, iso, dayKey, hour
    ]);
    return { created: true };
  }

  // ====== ✅ INGEST (Rasp -> Railway) ======
  app.post("/api/ingest", async (req, res) => {
    try {
      if (!INGEST_TOKEN) return res.status(500).json({ ok: false, error: "missing_token_server" });
      const token = String(req.body?.token || "");
      if (token !== INGEST_TOKEN) return res.status(401).json({ ok: false, error: "bad_token" });

      const leads = Array.isArray(req.body?.leads) ? req.body.leads : [];
      const checkins = Array.isArray(req.body?.checkins) ? req.body.checkins : [];

      let leadsOk = 0;
      let checkinsOk = 0;

      // 1) grava leads
      for (const item of leads) {
        try {
          if (!item?.nome || !(item?.telefone_raw || item?.telefone_norm || item?.telefone)) continue;
          if (!item?.perfil) continue;
          const origem = item.origem === "wifi" || item.origem === "ipad" ? item.origem : "ipad";
          await createLead(item, origem);
          leadsOk++;
        } catch {}
      }

      // 2) grava checkins (resolve lead_id por telefone_norm)
      for (const c of checkins) {
        try {
          const telefoneNorm = c.telefone_norm ? String(c.telefone_norm) : normalizePhone(c.telefone_raw || c.telefone);
          if (!telefoneNorm) continue;

          const lead = await db.get("SELECT id FROM leads WHERE telefone_norm = ?", telefoneNorm);
          if (!lead?.id) continue;

          const created_at = c.created_at || new Date().toISOString();
          const day_key = c.day_key || created_at.slice(0, 10);
          const hh = Number.isFinite(c.hour) ? c.hour : Number(String(created_at).slice(11, 13));

          // evita duplicar com índice único (lead_id, created_at)
          await db.run(
            "INSERT OR IGNORE INTO checkins (lead_id, origem, created_at, day_key, hour) VALUES (?, 'wifi', ?, ?, ?)",
            [lead.id, created_at, day_key, hh]
          );
          checkinsOk++;
        } catch {}
      }

      return res.json({ ok: true, leads_received: leads.length, leads_saved: leadsOk, checkins_received: checkins.length, checkins_saved: checkinsOk });
    } catch {
      return res.status(500).json({ ok: false, error: "ingest_failed" });
    }
  });

  // ===== Wi-Fi (/hs) =====
  app.get("/hs", async (req, res) => {
    try {
      const nome = (req.query.nome || "").trim();
      const telefone = String(req.query.telefone || "");
      const email = (req.query.email || "").trim();
      const perfil = String(req.query.perfil || "").trim();
      const area_soja = String(req.query.area_soja || "").trim();

      if (nome && telefone && perfil) {
        const lead = await createLead({ nome, telefone, email, perfil, area_soja }, "wifi");
        if (lead?.id) await maybeCreateCheckin(lead.id);
      }
    } catch {}

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderSuccessHtml());
  });

  app.post("/hs", async (req, res) => {
    try {
      const nome = (req.body?.nome || "").trim();
      const telefone = String(req.body?.telefone || "");
      const email = (req.body?.email || "").trim();
      const perfil = String(req.body?.perfil || "").trim();
      const area_soja = String(req.body?.area_soja || "").trim();

      if (nome && telefone && perfil) {
        const lead = await createLead({ nome, telefone, email, perfil, area_soja }, "wifi");
        if (lead?.id) await maybeCreateCheckin(lead.id);
      }
    } catch {}

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(renderSuccessHtml());
  });

  // iPad
  app.post("/api/leads", async (req, res) => {
    try {
      const p = req.body || {};
      if (!p.nome || !p.telefone || !p.perfil) return res.status(200).json({ ok: true });
      await createLead(p, "ipad");
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(200).json({ ok: true });
    }
  });

  // Dashboard APIs
  app.get("/api/dashboard/days", async (req, res) => {
    try {
      const rows = await db.all("SELECT DISTINCT day_key FROM leads ORDER BY day_key");
      return res.json({ ok: true, days: rows.map((r) => r.day_key).filter(Boolean) });
    } catch {
      return res.status(500).json({ ok: false });
    }
  });

  app.get("/api/dashboard/summary", async (req, res) => {
  try {
    return res.json(await dashboardSummary(db));
  } catch (err) {
    console.error("❌ /api/dashboard/summary error:", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});


  app.get("/api/dashboard/day/:dayKey", async (req, res) => {
    try {
      const dayKey = safeDayKey(req.params.dayKey);
      if (!dayKey) return res.status(400).json({ ok: false, error: "invalid_day" });
      return res.json(await dashboardForDay(db, dayKey));
    } catch {
      return res.status(500).json({ ok: false });
    }
  });

  // CSV
  app.get("/api/export/leads.csv", async (req, res) => {
    try {
      const qDay = safeDayKey(req.query.day);
      const rows = await exportLeadsClean(db, qDay);

      const csv = toCsv(rows, EXPORT_LEADS_HEADERS);
      const suffix = qDay ? `_${qDay}` : `_${new Date().toISOString().slice(0, 10)}`;
      const filename = `boasafra_leads${suffix}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send("\uFEFF" + csv);
    } catch {
      return res.status(500).send("export_failed");
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Leads system rodando em http://0.0.0.0:${PORT}`);
  });
})();
// teste