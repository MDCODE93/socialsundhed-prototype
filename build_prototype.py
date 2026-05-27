"""
Social Sundhed Aarhus — database-prototype
Bygger en SQLite-database med datamodellen fra er_model.md
og fylder den med ~realistiske, syntetiske data.

Kør:  python3 build_prototype.py
Output: prototype.db
"""

import sqlite3
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

DB_PATH = Path(__file__).parent / "prototype.db"
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# ── 1. SCHEMA ─────────────────────────────────────────────────────────────────
SCHEMA = """
DROP TABLE IF EXISTS kontakt;
DROP TABLE IF EXISTS ledsagelse;
DROP TABLE IF EXISTS forloeb;
DROP TABLE IF EXISTS sundhedsaktoer;
DROP TABLE IF EXISTS henvisningskilde;
DROP TABLE IF EXISTS brobygger;
DROP TABLE IF EXISTS borger;

CREATE TABLE borger (
    borger_id           INTEGER PRIMARY KEY,
    alder_kategori      TEXT,
    koen                TEXT,
    postnr              TEXT,
    oprettet_dato       DATE NOT NULL,
    lukket_dato         DATE,
    saarbarhed_primaer  TEXT
);

CREATE TABLE brobygger (
    brobygger_id        INTEGER PRIMARY KEY,
    navn                TEXT NOT NULL,
    status              TEXT NOT NULL,
    start_dato          DATE NOT NULL,
    sprog               TEXT
);

CREATE TABLE henvisningskilde (
    kilde_id            INTEGER PRIMARY KEY,
    navn                TEXT NOT NULL,
    type                TEXT
);

CREATE TABLE forloeb (
    forloeb_id          INTEGER PRIMARY KEY,
    borger_id           INTEGER NOT NULL REFERENCES borger(borger_id) ON DELETE CASCADE,
    brobygger_id        INTEGER REFERENCES brobygger(brobygger_id),
    kilde_id            INTEGER REFERENCES henvisningskilde(kilde_id),
    start_dato          DATE NOT NULL,
    slut_dato           DATE,
    status              TEXT NOT NULL,
    formaal             TEXT
);
CREATE INDEX idx_forloeb_borger    ON forloeb(borger_id);
CREATE INDEX idx_forloeb_brobygger ON forloeb(brobygger_id);
CREATE INDEX idx_forloeb_status    ON forloeb(status);

CREATE TABLE sundhedsaktoer (
    aktoer_id           INTEGER PRIMARY KEY,
    type                TEXT,
    navn                TEXT NOT NULL,
    region              TEXT
);

CREATE TABLE ledsagelse (
    ledsagelse_id       INTEGER PRIMARY KEY,
    forloeb_id          INTEGER NOT NULL REFERENCES forloeb(forloeb_id) ON DELETE CASCADE,
    aktoer_id           INTEGER REFERENCES sundhedsaktoer(aktoer_id),
    dato                DATE NOT NULL,
    type                TEXT,
    varighed_min        INTEGER,
    transport           TEXT
);
CREATE INDEX idx_ledsagelse_forloeb ON ledsagelse(forloeb_id);
CREATE INDEX idx_ledsagelse_dato    ON ledsagelse(dato);

CREATE TABLE kontakt (
    kontakt_id          INTEGER PRIMARY KEY,
    forloeb_id          INTEGER NOT NULL REFERENCES forloeb(forloeb_id) ON DELETE CASCADE,
    dato                DATE NOT NULL,
    kanal               TEXT,
    note                TEXT
);
CREATE INDEX idx_kontakt_forloeb ON kontakt(forloeb_id);
"""

# ── 2. SYNTETISK DATA ─────────────────────────────────────────────────────────
ALDER = ["18-29", "30-44", "45-59", "60-74", "75+"]
ALDER_VAEGTE = [10, 20, 30, 25, 15]
KOEN = ["K", "M", "Andet"]
KOEN_VAEGTE = [55, 43, 2]
POSTNR_AARHUS = ["8000", "8200", "8210", "8220", "8230", "8240", "8250", "8260", "8270"]
SAARBARHED = [
    "psykisk sårbarhed", "misbrug", "hjemløshed", "sprogbarriere",
    "kognitiv funktionsnedsættelse", "social isolation", "kronisk sygdom", "økonomisk udsathed",
]

BROBYGGER_NAVNE = [
    "Anne H.", "Peter J.", "Mette K.", "Jakob L.", "Sara M.", "Karen N.", "Mads O.",
    "Line P.", "Henrik R.", "Sofia T.", "Ditte V.", "Frederik B.", "Maja C.",
    "Thomas D.", "Camilla E.", "Lars F.", "Pia G.", "Rasmus I.", "Helene J.", "Niels K.",
]
SPROG = ["dansk", "dansk, engelsk", "dansk, arabisk", "dansk, somalisk", "dansk, tyrkisk", "dansk, polsk"]

HENVISNING = [
    ("Aarhus Kommune Socialforvaltning", "kommune"),
    ("Aarhus Kommune Sundhed & Omsorg",  "kommune"),
    ("Aarhus Universitetshospital",      "hospital"),
    ("Almen praksis (diverse)",          "almen praksis"),
    ("Kirkens Korshær",                  "NGO"),
    ("Røde Kors",                        "NGO"),
    ("Egen henvendelse",                 "egen henvendelse"),
    ("Psykiatrien Region Midt",          "hospital"),
]

AKTOERER = [
    ("alm. praksis",     "Lægehuset Trøjborg",          "Midt"),
    ("alm. praksis",     "Lægerne Bruunsgade",          "Midt"),
    ("alm. praksis",     "Lægehuset Viby",              "Midt"),
    ("speciallæge",      "Øjenklinikken Aarhus C",      "Midt"),
    ("speciallæge",      "Hudklinikken Risskov",        "Midt"),
    ("hospital",         "Aarhus Universitetshospital", "Midt"),
    ("hospital",         "Regionshospitalet Randers",   "Midt"),
    ("kommunal sundhed", "Aarhus Sundhedshus",          "Midt"),
    ("kommunal sundhed", "Tandplejen Aarhus",           "Midt"),
    ("psykiatri",        "Psykiatrisk Center Risskov",  "Midt"),
    ("tandlæge",         "Tandlægerne Mejlgade",        "Midt"),
    ("andet",            "Apoteket Storcenter Nord",    "Midt"),
]

LEDSAGELSE_TYPE = ["konsultation", "ambulant behandling", "indlæggelse", "scanning/prøve", "psykolog/samtale", "tandlæge"]
TRANSPORT = ["til fods", "bus", "letbane", "bil m. brobygger", "Flextrafik", "egen cykel"]
KONTAKT_KANAL = ["telefon", "sms", "møde", "email"]

FORMAAL = [
    "støtte til komplekst behandlingsforløb",
    "afklaring af diagnose",
    "opfølgning efter indlæggelse",
    "støtte til psykiatrisk udredning",
    "støtte til tandbehandling",
    "støtte til kronisk sygdom",
    "støtte til kirurgisk indgreb",
]

def rdate(start: date, end: date) -> date:
    delta = (end - start).days
    if delta <= 0:
        return end
    return start + timedelta(days=random.randint(0, delta))

def insert_borgere(cur, n=5500):
    today = date(2026, 5, 27)
    for i in range(1, n + 1):
        oprettet = rdate(date(2023, 1, 1), today)
        # ~25% er lukket, dvs. har slut_dato på borger-niveau
        lukket = None
        if random.random() < 0.20:
            lukket = rdate(oprettet + timedelta(days=60), today)
        cur.execute(
            "INSERT INTO borger VALUES (?,?,?,?,?,?,?)",
            (i,
             random.choices(ALDER, ALDER_VAEGTE)[0],
             random.choices(KOEN, KOEN_VAEGTE)[0],
             random.choice(POSTNR_AARHUS),
             oprettet.isoformat(),
             lukket.isoformat() if lukket else None,
             random.choice(SAARBARHED)),
        )

def insert_brobyggere(cur):
    today = date(2026, 5, 27)
    for i, navn in enumerate(BROBYGGER_NAVNE, start=1):
        start = rdate(date(2022, 1, 1), date(2025, 12, 31))
        status = random.choices(["aktiv", "pauseret", "afsluttet"], [80, 10, 10])[0]
        cur.execute(
            "INSERT INTO brobygger VALUES (?,?,?,?,?)",
            (i, navn, status, start.isoformat(), random.choice(SPROG)),
        )

def insert_henvisning(cur):
    for i, (navn, typ) in enumerate(HENVISNING, start=1):
        cur.execute("INSERT INTO henvisningskilde VALUES (?,?,?)", (i, navn, typ))

def insert_aktoerer(cur):
    for i, (typ, navn, reg) in enumerate(AKTOERER, start=1):
        cur.execute("INSERT INTO sundhedsaktoer VALUES (?,?,?,?)", (i, typ, navn, reg))

def insert_forloeb(cur, n_borgere=5500):
    today = date(2026, 5, 27)
    forloeb_id = 0
    # Hver borger har 1-3 forløb
    for borger_id in range(1, n_borgere + 1):
        cur.execute("SELECT oprettet_dato, lukket_dato FROM borger WHERE borger_id=?", (borger_id,))
        opr, luk = cur.fetchone()
        opr = date.fromisoformat(opr)
        luk = date.fromisoformat(luk) if luk else today
        n_forloeb = random.choices([1, 2, 3], [70, 25, 5])[0]
        cursor_date = opr
        for _ in range(n_forloeb):
            if cursor_date >= luk:
                break
            forloeb_id += 1
            # ventetid fra borger oprettet til forløb start: 0-40 dage
            start = cursor_date + timedelta(days=random.randint(0, 40))
            if start > luk:
                start = luk
            varighed = random.randint(30, 365)
            slut_kandidat = start + timedelta(days=varighed)
            slut = None
            if slut_kandidat < today and random.random() < 0.70:
                slut = slut_kandidat
                status = random.choices(["afsluttet", "afbrudt"], [85, 15])[0]
            else:
                status = random.choices(["aktiv", "pauseret"], [90, 10])[0]
            cur.execute(
                "INSERT INTO forloeb VALUES (?,?,?,?,?,?,?,?)",
                (forloeb_id, borger_id,
                 random.randint(1, len(BROBYGGER_NAVNE)),
                 random.randint(1, len(HENVISNING)),
                 start.isoformat(),
                 slut.isoformat() if slut else None,
                 status,
                 random.choice(FORMAAL)),
            )
            cursor_date = slut if slut else today
    return forloeb_id

def insert_ledsagelser_og_kontakter(cur, n_forloeb):
    today = date(2026, 5, 27)
    ledsagelse_id = 0
    kontakt_id = 0
    for f_id in range(1, n_forloeb + 1):
        cur.execute("SELECT start_dato, slut_dato FROM forloeb WHERE forloeb_id=?", (f_id,))
        start, slut = cur.fetchone()
        start = date.fromisoformat(start)
        slut = date.fromisoformat(slut) if slut else today
        if slut <= start:
            continue
        # 1-6 ledsagelser pr. forløb -- skalerer over SharePoint-grænsen (5.000)
        n_l = random.randint(1, 6)
        for _ in range(n_l):
            ledsagelse_id += 1
            cur.execute(
                "INSERT INTO ledsagelse VALUES (?,?,?,?,?,?,?)",
                (ledsagelse_id, f_id,
                 random.randint(1, len(AKTOERER)),
                 rdate(start, slut).isoformat(),
                 random.choice(LEDSAGELSE_TYPE),
                 random.choice([30, 45, 60, 90, 120, 180]),
                 random.choice(TRANSPORT)),
            )
        # 2-10 kontakter pr. forløb
        n_k = random.randint(2, 10)
        for _ in range(n_k):
            kontakt_id += 1
            cur.execute(
                "INSERT INTO kontakt VALUES (?,?,?,?,?)",
                (kontakt_id, f_id,
                 rdate(start, slut).isoformat(),
                 random.choices(KONTAKT_KANAL, [50, 30, 15, 5])[0],
                 ""),
            )
    return ledsagelse_id, kontakt_id

def main():
    if DB_PATH.exists():
        DB_PATH.unlink()
    # exFAT-volume: undgå WAL/SHM-filer som ikke kan oprettes pålideligt
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=MEMORY")
    conn.execute("PRAGMA locking_mode=EXCLUSIVE")
    conn.executescript(SCHEMA)
    cur = conn.cursor()
    insert_henvisning(cur)
    insert_aktoerer(cur)
    insert_brobyggere(cur)
    insert_borgere(cur, n=5500)
    n_f = insert_forloeb(cur, n_borgere=5500)
    n_l, n_k = insert_ledsagelser_og_kontakter(cur, n_f)
    conn.commit()

    # Skriv også schema separat
    SCHEMA_PATH.write_text(SCHEMA.strip() + "\n")

    print(f"Database bygget: {DB_PATH}")
    print(f"  borgere:          {cur.execute('SELECT COUNT(*) FROM borger').fetchone()[0]}")
    print(f"  brobyggere:       {cur.execute('SELECT COUNT(*) FROM brobygger').fetchone()[0]}")
    print(f"  henvisningskilder:{cur.execute('SELECT COUNT(*) FROM henvisningskilde').fetchone()[0]}")
    print(f"  sundhedsaktører:  {cur.execute('SELECT COUNT(*) FROM sundhedsaktoer').fetchone()[0]}")
    print(f"  forløb:           {n_f}")
    print(f"  ledsagelser:      {n_l}")
    print(f"  kontakter:        {n_k}")
    conn.close()

if __name__ == "__main__":
    main()
