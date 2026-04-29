#!/usr/bin/env python3
"""
Import des archives Drive médecine (DCEM1/2/3) vers Studara.
Lit /tmp/drive_files.json (généré par gdown) et appelle l'API gdrive-batch.
"""
import json, re, time, urllib.request, urllib.error

API            = "http://5.189.153.144/api/v1"
ADMIN_EMAIL    = "admin@studara.app"
ADMIN_PASSWORD = "Admin2026SecureX8"
TOKEN          = ""

# ── Correspondance chemin → matière ─────────────────────────────────────────
SUBJECT_MAP = {
    "hemato":     "Hématologie",
    "hémato":     "Hématologie",
    "hematologie":"Hématologie",
    "immuno":     "Immunologie",
    "parasito":   "Parasitologie",
    "myco":       "Mycologie",
    "pharmaco":   "Pharmacologie",
    "semio":      "Sémiologie",
    "semiologie": "Sémiologie",
    "anatomo":    "Anatomie Pathologique",
    "anapath":    "Anatomie Pathologique",
    "cardio":     "Cardiologie",
    "pneumo":     "Pneumologie",
    "gastro":     "Gastroentérologie",
    "hepato":     "Hépatologie",
    "nephro":     "Néphrologie",
    "neuro":      "Neurologie",
    "endocrino":  "Endocrinologie",
    "diabete":    "Diabétologie",
    "diabète":    "Diabétologie",
    "rhumato":    "Rhumatologie",
    "dermat":     "Dermatologie",
    "gyneco":     "Gynécologie",
    "gynéco":     "Gynécologie",
    "obstet":     "Obstétrique",
    "pédiat":     "Pédiatrie",
    "pediat":     "Pédiatrie",
    "chirurgie":  "Chirurgie",
    "ophtalmo":   "Ophtalmologie",
    "orl":        "ORL",
    "urolog":     "Urologie",
    "infectio":   "Infectiologie",
    "bacterio":   "Bactériologie",
    "virolog":    "Virologie",
    "biochim":    "Biochimie",
    "physiolog":  "Physiologie",
    "anatomie":   "Anatomie",
    "histolog":   "Histologie",
    "embryolog":  "Embryologie",
    "genetique":  "Génétique",
    "génétique":  "Génétique",
    "medecine":   "Médecine Interne",
    "médecine":   "Médecine Interne",
    "sante":      "Santé Publique",
    "santé":      "Santé Publique",
    "epidemio":   "Épidémiologie",
    "réanimation":"Réanimation",
    "reanimation":"Réanimation",
    "urgences":   "Médecine d'Urgence",
    "radiol":     "Radiologie",
    "imagerie":   "Imagerie Médicale",
    "nutrition":  "Nutrition",
    "toxicolog":  "Toxicologie",
    "psychiatr":  "Psychiatrie",
    "stomatol":   "Stomatologie",
}

def extract_subject(path: str) -> str:
    """Extraire la matière depuis le chemin de fichier."""
    path_lower = path.lower()
    # D'abord chercher dans les segments de chemin
    for keyword, subject in SUBJECT_MAP.items():
        if keyword in path_lower:
            return subject
    # Fallback: 1er segment après le dossier racine
    parts = path.replace("\\", "/").split("/")
    # parts[0] = nom archive, parts[1] = S1/S2, parts[2] = matière
    if len(parts) >= 3:
        folder = parts[2] if len(parts) > 2 else parts[1]
        folder = re.sub(r"[\[\](){}0-9\-_]", " ", folder).strip()
        if folder:
            return folder.title()
    return "Médecine"

def extract_semester(path: str):
    """Extraire S1 ou S2 du chemin."""
    m = re.search(r'\bS([12])\b', path, re.IGNORECASE)
    return int(m.group(1)) if m else None

def guess_resource_type(path: str) -> str:
    p = path.lower()
    if any(k in p for k in ["exam", "évaluation", "evaluation", "ds ", "cc ", "qroc", "qcm", "isole", "isolé", "partiel", "controle", "contrôle", "correction", "corr "]):
        return "past_exam"
    if any(k in p for k in ["résumé", "resume", "résume", "synthèse", "fiche", "recap"]):
        return "summary"
    if any(k in p for k in ["tp ", "td ", "exercice", "pratique"]):
        return "exercise"
    if any(k in p for k in ["cours", "cm ", "polycopie", "polycope", "diapo", "slide", "poly "]):
        return "note"
    return "note"

def is_importable(path: str) -> bool:
    """Filtrer les fichiers non utiles."""
    p = path.lower()
    name = path.split("/")[-1].lower()
    # Ignorer images WhatsApp, notes de cours audio, fichiers systèmes
    if name.startswith("whatsapp image"):
        return False
    if name.startswith("."):
        return False
    ext = name.rsplit(".", 1)[-1] if "." in name else ""
    # Garder PDF, DOCX, PPTX, DOC, PPT
    return ext in {"pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls"}

def login():
    global TOKEN
    body = json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).encode()
    req  = urllib.request.Request(f"{API}/auth/login", data=body,
           headers={"Content-Type": "application/json"}, method="POST")
    r    = urllib.request.urlopen(req, timeout=10)
    TOKEN = json.loads(r.read())["access"]
    print("✅ Connecté à l'API Studara\n")

def import_batch(resources: list) -> tuple[int, int]:
    body = json.dumps({
        "faculty":    "medicine",
        "university": "una",
        "resources":  resources,
    }).encode()
    req = urllib.request.Request(
        f"{API}/admin/import/gdrive-batch",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
        method="POST",
    )
    try:
        r = urllib.request.urlopen(req, timeout=30)
        d = json.loads(r.read())
        return d.get("inserted", 0), d.get("skipped", 0)
    except urllib.error.HTTPError as e:
        print(f"    ⚠️  HTTP {e.code}: {e.read().decode()[:120]}")
        return 0, 0
    except Exception as ex:
        print(f"    ⚠️  Erreur: {ex}")
        return 0, 0

# ── Main ──────────────────────────────────────────────────────────────────────
login()

with open("/tmp/drive_files.json") as f:
    all_files = json.load(f)

print(f"📂 {len(all_files)} fichiers bruts à traiter\n")

# Construire les ressources
resources = []
skipped_count = 0
for item in all_files:
    path  = item["path"]
    fid   = item["id"]
    year  = item["year"]
    label = item["label"]

    if not is_importable(path):
        skipped_count += 1
        continue

    name     = path.split("/")[-1]
    stem     = name.rsplit(".", 1)[0] if "." in name else name
    subject  = extract_subject(path)
    semester = extract_semester(path)
    rtype    = guess_resource_type(path)
    file_url = f"https://drive.google.com/file/d/{fid}/view?usp=drive_link"

    resources.append({
        "title":         stem,
        "subject":       subject,
        "year":          year,
        "semester":      semester,
        "faculty":       "medicine",
        "university":    "una",
        "resource_type": rtype,
        "file_url":      file_url,
        "file_name":     name,
        "tags":          ["médecine", label.lower(), subject.lower()],
        "description":   f"Archive {label} — {subject}",
    })

print(f"✅ {len(resources)} fichiers à importer ({skipped_count} ignorés: images/WhatsApp etc.)\n")

# Grouper par matière pour affichage
subjects = {}
for r in resources:
    s = r["subject"]
    subjects[s] = subjects.get(s, 0) + 1
print("📚 Matières détectées:")
for s, n in sorted(subjects.items(), key=lambda x: -x[1]):
    print(f"   {n:4d}  {s}")
print()

# Importer par batches de 50
BATCH = 50
total_ins = total_skip = 0
for i in range(0, len(resources), BATCH):
    chunk = resources[i:i+BATCH]
    ins, skp = import_batch(chunk)
    total_ins  += ins
    total_skip += skp
    pct = int((i + len(chunk)) / len(resources) * 100)
    print(f"  [{pct:3d}%] Batch {i//BATCH+1}/{(len(resources)+BATCH-1)//BATCH} → +{ins} insérés, {skp} doublons", flush=True)
    time.sleep(0.3)

print(f"\n🎉 Terminé: {total_ins} ressources insérées, {total_skip} doublons ignorés")
