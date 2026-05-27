// ────────────────────────────────────────────────────────────────────
// Social Sundhed Aarhus — brobygger-prototype
// Vanilla JS + sql.js (SQLite WebAssembly). Ingen backend.
// ────────────────────────────────────────────────────────────────────

let db = null;
let selectedBorgerId = null;
const recentRegistrations = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  const status = $("#status");
  try {
    const SQL = await initSqlJs({
      locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`,
    });
    const res = await fetch("prototype.db");
    if (!res.ok) throw new Error(`Kunne ikke hente prototype.db (${res.status})`);
    const buf = await res.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buf));
    status.textContent = "Database klar";
    status.className = "status ready";

    setupTabs();
    renderBorgere();
    populateForm();
    renderReports();
    updateCounters();
  } catch (err) {
    console.error(err);
    status.textContent = "Fejl: " + err.message;
    status.className = "status error";
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function exec(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function tableFromRows(rows, opts = {}) {
  if (!rows.length) return '<p class="hint">Ingen data.</p>';
  const cols = Object.keys(rows[0]);
  const numericCols = new Set(
    cols.filter(c => rows.every(r => r[c] === null || typeof r[c] === "number"))
  );
  const head = cols.map(c => `<th>${c}</th>`).join("");
  const body = rows.map(r =>
    "<tr>" + cols.map(c => {
      const v = r[c] ?? "";
      const cls = numericCols.has(c) ? ' class="num"' : "";
      return `<td${cls}>${v}</td>`;
    }).join("") + "</tr>"
  ).join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ── Tabs ──────────────────────────────────────────────────────────
function setupTabs() {
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach(b => b.classList.remove("active"));
      $$(".panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $("#tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}

// ── Tab: Borgere ──────────────────────────────────────────────────
function renderBorgere() {
  const search = $("#borger-search").value.trim().toLowerCase();
  const statusFilter = $("#borger-status").value;

  let sql = `
    SELECT b.borger_id, b.alder_kategori, b.koen, b.postnr,
           b.saarbarhed_primaer, b.oprettet_dato, b.lukket_dato,
           (SELECT COUNT(*) FROM forloeb f
             WHERE f.borger_id = b.borger_id AND f.status='aktiv') AS aktive
    FROM borger b`;
  const where = [];
  if (statusFilter === "aktive")  where.push("aktive > 0");
  if (statusFilter === "lukkede") where.push("b.lukket_dato IS NOT NULL");
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY b.borger_id LIMIT 10000";

  let rows = query(sql);
  if (search) {
    rows = rows.filter(r =>
      String(r.borger_id).includes(search) ||
      (r.postnr || "").toLowerCase().includes(search) ||
      (r.saarbarhed_primaer || "").toLowerCase().includes(search)
    );
  }

  // Vis tællerlinje
  const counter = $("#borger-count");
  if (counter) counter.textContent = `${rows.length.toLocaleString("da-DK")} borgere vist`;

  const tbody = $("#borger-table tbody");
  tbody.innerHTML = rows.map(r => `
    <tr data-id="${r.borger_id}" class="${r.borger_id === selectedBorgerId ? "selected" : ""}">
      <td>#${r.borger_id}</td>
      <td>${r.alder_kategori}</td>
      <td>${r.koen}</td>
      <td>${r.postnr}</td>
      <td>${r.saarbarhed_primaer}</td>
      <td>${r.oprettet_dato}</td>
    </tr>`).join("");

  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", () => {
      selectedBorgerId = Number(tr.dataset.id);
      renderBorgere();
      renderBorgerDetail(selectedBorgerId);
    });
  });
}

function renderBorgerDetail(id) {
  const b = query("SELECT * FROM borger WHERE borger_id=?", [id])[0];
  if (!b) return;
  const forloeb = query(`
    SELECT f.*, br.navn AS brobygger_navn, h.navn AS kilde_navn
    FROM forloeb f
    LEFT JOIN brobygger br        ON br.brobygger_id = f.brobygger_id
    LEFT JOIN henvisningskilde h  ON h.kilde_id      = f.kilde_id
    WHERE f.borger_id=? ORDER BY f.start_dato`, [id]);

  const ledsagelser = query(`
    SELECT l.dato, l.type, l.varighed_min, l.transport, s.navn AS aktoer
    FROM ledsagelse l
    JOIN forloeb f       ON f.forloeb_id = l.forloeb_id
    LEFT JOIN sundhedsaktoer s ON s.aktoer_id = l.aktoer_id
    WHERE f.borger_id=? ORDER BY l.dato DESC LIMIT 20`, [id]);

  const kontakter = query(`
    SELECT COUNT(*) AS n FROM kontakt k
    JOIN forloeb f ON f.forloeb_id = k.forloeb_id WHERE f.borger_id=?`, [id])[0].n;

  const forloebHtml = forloeb.map(f => `
    <div style="border-left:3px solid #2563a0; padding:6px 10px; margin:6px 0; background:#f8fafc;">
      <div><strong>Forløb #${f.forloeb_id}</strong>
        <span class="pill ${f.status}">${f.status}</span></div>
      <div style="font-size:13px; color:#4b5563;">
        ${f.start_dato} → ${f.slut_dato || "pågår"}<br>
        Brobygger: ${f.brobygger_navn || "–"} · Henvist af: ${f.kilde_navn || "–"}<br>
        Formål: <em>${f.formaal}</em>
      </div>
    </div>`).join("");

  $("#borger-detail").innerHTML = `
    <h4>Borger #${b.borger_id}</h4>
    <div class="meta">${b.alder_kategori} · ${b.koen} · ${b.postnr} · ${b.saarbarhed_primaer}</div>
    <div class="meta">Oprettet ${b.oprettet_dato}${b.lukket_dato ? " · Lukket " + b.lukket_dato : ""}</div>

    <div class="sub-section">
      <h5>Forløb (${forloeb.length})</h5>
      ${forloebHtml || '<p class="hint">Ingen forløb.</p>'}
    </div>

    <div class="sub-section">
      <h5>Seneste ledsagelser (${ledsagelser.length})</h5>
      ${tableFromRows(ledsagelser)}
    </div>

    <div class="sub-section">
      <h5>Kontakter i alt</h5>
      <div>${kontakter} telefon/sms/møde-kontakter registreret</div>
    </div>
  `;
}

$("#borger-search").addEventListener("input", renderBorgere);
$("#borger-status").addEventListener("change", renderBorgere);

// ── Tab: Ny registrering ──────────────────────────────────────────
function populateForm() {
  // Borger dropdown — kun dem med aktivt forløb
  const borgere = query(`
    SELECT DISTINCT b.borger_id, b.alder_kategori, b.postnr, b.saarbarhed_primaer
    FROM borger b
    JOIN forloeb f ON f.borger_id=b.borger_id AND f.status='aktiv'
    ORDER BY b.borger_id`);
  $("#ny-borger").innerHTML = '<option value="">— vælg borger —</option>' +
    borgere.map(b => `<option value="${b.borger_id}">#${b.borger_id} · ${b.alder_kategori} · ${b.postnr} · ${b.saarbarhed_primaer}</option>`).join("");

  // Aktørliste
  const aktorer = query("SELECT aktoer_id, type, navn FROM sundhedsaktoer ORDER BY navn");
  $("#ny-aktoer").innerHTML = '<option value="">— vælg sundhedsaktør —</option>' +
    aktorer.map(a => `<option value="${a.aktoer_id}">${a.navn} (${a.type})</option>`).join("");

  // Forløb opdateres når borger vælges
  $("#ny-borger").addEventListener("change", () => {
    const bid = $("#ny-borger").value;
    if (!bid) { $("#ny-forloeb").innerHTML = '<option value="">—</option>'; return; }
    const forloeb = query(
      "SELECT forloeb_id, start_dato, formaal FROM forloeb WHERE borger_id=? AND status='aktiv'",
      [Number(bid)]);
    $("#ny-forloeb").innerHTML = forloeb.map(f =>
      `<option value="${f.forloeb_id}">#${f.forloeb_id} (start ${f.start_dato}) — ${f.formaal}</option>`).join("");
  });

  // Datofelt default = i dag
  $("#ny-dato").value = new Date().toISOString().slice(0, 10);

  // Submit
  $("#ny-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      // næste id
      const nextId = query("SELECT COALESCE(MAX(ledsagelse_id),0)+1 AS n FROM ledsagelse")[0].n;
      exec(`INSERT INTO ledsagelse
            (ledsagelse_id, forloeb_id, aktoer_id, dato, type, varighed_min, transport)
            VALUES (?,?,?,?,?,?,?)`,
        [nextId,
         Number(fd.get("forloeb_id")),
         Number(fd.get("aktoer_id")),
         fd.get("dato"),
         fd.get("type"),
         Number(fd.get("varighed_min")),
         fd.get("transport")]);

      const aktorNavn = query("SELECT navn FROM sundhedsaktoer WHERE aktoer_id=?",
                              [Number(fd.get("aktoer_id"))])[0].navn;
      recentRegistrations.unshift({
        ts: new Date().toLocaleTimeString("da-DK"),
        borger: "#" + fd.get("borger_id"),
        aktor: aktorNavn,
        type: fd.get("type"),
        varighed: fd.get("varighed_min") + " min",
      });
      renderRecent();

      const fb = $("#ny-feedback");
      fb.textContent = `✓ Ledsagelse #${nextId} gemt`;
      fb.className = "feedback ok";
      setTimeout(() => { fb.textContent = ""; }, 3000);
      updateCounters();

      // ryd kun dato + type — behold borger valgt
      $("#ny-dato").value = new Date().toISOString().slice(0, 10);
    } catch (err) {
      const fb = $("#ny-feedback");
      fb.textContent = "Fejl: " + err.message;
      fb.className = "feedback error";
    }
  });
}

function renderRecent() {
  const tbody = $("#ny-recent tbody");
  if (!recentRegistrations.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="hint">Ingen registreringer endnu.</td></tr>';
    return;
  }
  tbody.innerHTML = recentRegistrations.map(r => `
    <tr>
      <td>${r.ts}</td><td>${r.borger}</td><td>${r.aktor}</td>
      <td>${r.type}</td><td>${r.varighed}</td>
    </tr>`).join("");
}

// ── Tab: Rapporter ────────────────────────────────────────────────
function renderReports() {
  // 1
  const r1 = query("SELECT COUNT(*) AS aktive_forloeb FROM forloeb WHERE status='aktiv'")[0];
  $("#rep-1").innerHTML = `<div class="big-number">${r1.aktive_forloeb}</div>`;

  // 2
  const r2 = query(`
    SELECT strftime('%Y-%m', dato) AS maaned, COUNT(*) AS antal_ledsagelser
    FROM ledsagelse
    WHERE dato >= date('2026-05-27','-12 months')
    GROUP BY maaned ORDER BY maaned`);
  $("#rep-2").innerHTML = tableFromRows(r2);

  // 3
  const r3 = query(`
    WITH foerste AS (
      SELECT f.borger_id, b.oprettet_dato, MIN(l.dato) AS foerste_ledsagelse
      FROM forloeb f
      JOIN borger b ON b.borger_id=f.borger_id
      JOIN ledsagelse l ON l.forloeb_id=f.forloeb_id
      GROUP BY f.borger_id),
    v AS (
      SELECT julianday(foerste_ledsagelse) - julianday(oprettet_dato) AS dage
      FROM foerste ORDER BY dage)
    SELECT
      ROUND(AVG(dage),1) AS gns_ventetid_dage,
      (SELECT dage FROM v LIMIT 1 OFFSET (SELECT COUNT(*)/2 FROM v)) AS median_dage,
      MIN(dage) AS min_dage, MAX(dage) AS max_dage, COUNT(*) AS n_borgere
    FROM v`);
  $("#rep-3").innerHTML = tableFromRows(r3);

  // 4
  const r4 = query(`
    SELECT s.navn AS sundhedsaktoer, s.type, COUNT(*) AS antal_ledsagelser
    FROM ledsagelse l JOIN sundhedsaktoer s ON s.aktoer_id=l.aktoer_id
    GROUP BY s.aktoer_id ORDER BY antal_ledsagelser DESC LIMIT 5`);
  $("#rep-4").innerHTML = tableFromRows(r4);

  // 5
  const r5 = query(`
    SELECT h.navn AS henvisende_instans, COUNT(*) AS n_forloeb,
      SUM(CASE WHEN f.status='afsluttet'
                AND julianday(f.slut_dato)-julianday(f.start_dato) <= 183
               THEN 1 ELSE 0 END) AS afsl_6mdr,
      ROUND(100.0*SUM(CASE WHEN f.status='afsluttet'
                AND julianday(f.slut_dato)-julianday(f.start_dato) <= 183
               THEN 1 ELSE 0 END)/COUNT(*),1) AS andel_pct
    FROM forloeb f JOIN henvisningskilde h ON h.kilde_id=f.kilde_id
    GROUP BY h.kilde_id ORDER BY andel_pct DESC`);
  $("#rep-5").innerHTML = tableFromRows(r5);
}

$("#refresh-reports").addEventListener("click", () => {
  renderReports();
  updateCounters();
});

// ── Live row counters (skala-banner) ──────────────────────────────
function updateCounters() {
  const fmt = (n) => n.toLocaleString("da-DK");
  $("#cnt-ledsagelser").textContent = fmt(query("SELECT COUNT(*) AS n FROM ledsagelse")[0].n);
  $("#cnt-forloeb").textContent     = fmt(query("SELECT COUNT(*) AS n FROM forloeb")[0].n);
  $("#cnt-borgere").textContent     = fmt(query("SELECT COUNT(*) AS n FROM borger")[0].n);
  $("#cnt-kontakter").textContent   = fmt(query("SELECT COUNT(*) AS n FROM kontakt")[0].n);
}

// ── Start ─────────────────────────────────────────────────────────
init();
