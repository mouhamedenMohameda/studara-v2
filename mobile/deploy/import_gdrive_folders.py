#!/usr/bin/env python3
"""
Import Google Drive public folders into Studara resources.
Scrapes public Drive folder pages to extract file IDs & names,
then calls the production API gdrive-batch endpoint.

Usage:
  python3 import_gdrive_folders.py

Requires: pip3 install requests
"""
import re, json, time
import urllib.request, urllib.parse

# ── Configuration ─────────────────────────────────────────────────────────────
API = "http://5.189.153.144/api/v1"
ADMIN_EMAIL    = "admin@tawjeeh.mr"
ADMIN_PASSWORD = "Admin@2025!"

# ── Dossiers Drive à importer ──────────────────────────────────────────────────
# Remplissez les métadonnées pour chaque dossier
FOLDERS = [
    {
        "folder_id": "1OgS_ufx7CK0sMddTCAw97n0iYHI7IA6Z",
        "subject":   "À définir",       # ← ex: "Anatomie", "Physiologie"...
        "year":      1,                  # ← année (1-7)
        "faculty":   "medicine",
        "university":"una",
        "resource_type": "note",         # note / summary / past_exam / exercise
        "tags":      ["médecine"],
    },
    {
        "folder_id": "12xxIiHeOQFEZ3HtdoHWfK2epjliMhW22",
        "subject":   "À définir",
        "year":      1,
        "faculty":   "medicine",
        "university":"una",
        "resource_type": "note",
        "tags":      ["médecine"],
    },
    {
        "folder_id": "1EWIWOgH-tEbdOo0Khr7fIRS45GFITDXM",
        "subject":   "À définir",
        "year":      1,
        "faculty":   "medicine",
        "university":"una",
        "resource_type": "note",
        "tags":      ["médecine"],
    },
]
# ─────────────────────────────────────────────────────────────────────────────

TOKEN = ""

def login():
    global TOKEN
    body = json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).encode()
    req  = urllib.request.Request(f"{API}/auth/login", data=body,
           headers={"Content-Type": "application/json"}, method="POST")
    r    = urllib.request.urlopen(req, timeout=10)
    TOKEN = json.loads(r.read())["access"]
    print("✅ Connecté à l'API")


def list_drive_folder(folder_id: str) -> list[dict]:
    """
    Scrape a public Google Drive folder and return a list of
    { name, file_id, mime } for each file found.
    """
    url = f"https://drive.google.com/drive/folders/{folder_id}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "fr-FR,fr;q=0.9",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=20)
        html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"  ⚠️  Impossible de lire le dossier {folder_id}: {e}")
        return []

    # Drive embeds file data as JSON in the page
    # Pattern: ["filename","","file_id","","mime_type",...]
    files = []

    # Try to find the data array in the page source
    # Drive stores file list as a JSON array in window['_DRIVE_ivd']
    # or similar; we look for file IDs next to names
    pattern = r'\["([^"]{3,200}\.(?:pdf|pptx?|docx?|xlsx?|jpg|png|mp4|mp3|zip|rar))","[^"]*","([A-Za-z0-9_\-]{25,})"'
    matches = re.findall(pattern, html, re.IGNORECASE)

    seen = set()
    for name, fid in matches:
        if fid not in seen:
            seen.add(fid)
            files.append({"name": name, "file_id": fid})

    # Fallback: look for /file/d/{id} patterns with names nearby
    if not files:
        ids = re.findall(r'/file/d/([A-Za-z0-9_\-]{25,})', html)
        for fid in set(ids):
            if fid not in seen:
                seen.add(fid)
                files.append({"name": f"fichier_{fid[:8]}", "file_id": fid})

    return files


def file_url(file_id: str) -> str:
    return f"https://drive.google.com/file/d/{file_id}/view?usp=drive_link"


def guess_resource_type(filename: str, default: str) -> str:
    name = filename.lower()
    if any(k in name for k in ["exam", "ds ", "td ", "cc ", "contrôle", "partiel", "qcm"]):
        return "past_exam"
    if any(k in name for k in ["résumé", "resume", "synthèse", "fiche"]):
        return "summary"
    if any(k in name for k in ["cours", "cm ", "polycopié", "poly "]):
        return "note"
    if any(k in name for k in ["tp ", "td", "exercice", "correction"]):
        return "exercise"
    return default


def import_batch(resources: list[dict], folder_cfg: dict) -> dict:
    body = json.dumps({
        "faculty":    folder_cfg["faculty"],
        "university": folder_cfg["university"],
        "resources":  resources,
    }).encode()
    req = urllib.request.Request(
        f"{API}/admin/import/gdrive-batch",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}",
        },
        method="POST",
    )
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return json.loads(r.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"    HTTP {e.code}: {err[:200]}")
        return {}
    except Exception as ex:
        print(f"    Erreur: {ex}")
        return {}


# ── Main ──────────────────────────────────────────────────────────────────────
login()
print()

total_inserted = 0
total_skipped  = 0

for cfg in FOLDERS:
    fid = cfg["folder_id"]
    print(f"📁 Dossier: {fid}")
    print(f"   Matière: {cfg['subject']} | Année {cfg['year']} | {cfg['faculty']}")

    files = list_drive_folder(fid)
    if not files:
        print(f"   ⚠️  Aucun fichier trouvé (dossier peut-être privé ou vide)\n")
        continue

    print(f"   🔍 {len(files)} fichier(s) trouvé(s)")

    resources = []
    for f in files:
        name      = f["name"]
        stem      = name.rsplit(".", 1)[0] if "." in name else name
        rtype     = guess_resource_type(name, cfg["resource_type"])
        resources.append({
            "title":         stem,
            "subject":       cfg["subject"],
            "year":          cfg["year"],
            "faculty":       cfg["faculty"],
            "university":    cfg["university"],
            "resource_type": rtype,
            "file_url":      file_url(f["file_id"]),
            "file_name":     name,
            "tags":          cfg["tags"],
        })
        print(f"   • [{rtype:10s}] {name[:60]}")

    # Send in batches of 50
    BATCH = 50
    for i in range(0, len(resources), BATCH):
        chunk = resources[i:i+BATCH]
        result = import_batch(chunk, cfg)
        ins = result.get("inserted", 0)
        skp = result.get("skipped",  0)
        total_inserted += ins
        total_skipped  += skp
        print(f"   ✅ Batch {i//BATCH+1}: +{ins} insérés, {skp} déjà existants")

    time.sleep(1)
    print()

print(f"🎉 Terminé: {total_inserted} insérés, {total_skipped} ignorés (doublons)")
