#!/usr/bin/env python3
"""
drive_import.py — Import automatique depuis Google Drive
Usage: python3 drive_import.py --url <drive_url> --faculty <faculty>
       --year <year> --university <uni> --api <api_base> --token <jwt>
"""
import argparse, json, re, sys, time, urllib.request, urllib.error

# ── Parse args ────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument('--url',        required=True)
parser.add_argument('--faculty',    required=True)
parser.add_argument('--year',       required=True, type=int)
parser.add_argument('--university', default='Université de Mauritanie')
parser.add_argument('--api',        required=True)
parser.add_argument('--token',      required=True)
args = parser.parse_args()

def log(msg):
    print(msg, flush=True)

def status(s):
    print(f'STATUS:{s}', flush=True)

# ── Extract folder ID ─────────────────────────────────────────────────────────
def extract_folder_id(url):
    m = re.search(r'/folders/([a-zA-Z0-9_-]+)', url)
    if m:
        return m.group(1)
    m = re.search(r'id=([a-zA-Z0-9_-]+)', url)
    if m:
        return m.group(1)
    return url.strip()

folder_id = extract_folder_id(args.url)
log(f'[INFO] Folder ID: {folder_id}')
log(f'[INFO] Filière: {args.faculty} | Année: {args.year} | Université: {args.university}')

# ── List files with gdown ─────────────────────────────────────────────────────
status('listing')
log('[INFO] Listing des fichiers Drive...')

try:
    import gdown
except ImportError:
    log('[ERROR] gdown non installé. Lancer: pip install gdown')
    sys.exit(1)

try:
    files_info = gdown.download_folder(
        id=folder_id,
        quiet=True,
        use_cookies=False,
        skip_download=True,
    )
    if files_info is None:
        files_info = []
except Exception as e:
    # Fallback: try listing only (gdown ≥ 5.0 style)
    try:
        from gdown.download_folder import _get_directory_structure
        files_info = _get_directory_structure(folder_id, use_cookies=False) or []
    except Exception as e2:
        log(f'[ERROR] Impossible de lister le dossier: {e} / {e2}')
        sys.exit(1)

log(f'[INFO] {len(files_info)} fichiers trouvés sur Drive')

# ── Detect resource type from filename ───────────────────────────────────────
def detect_type(name):
    n = name.lower()
    if any(x in n for x in ['examen', 'exam', 'annale', 'contrôle', 'ds ', 'qcm', 'rattrapage', 'epreuve']):
        return 'past_exam'
    if any(x in n for x in ['td ', 'tp ', 'exercice', 'travaux dirigés', 'série']):
        return 'exercise'
    if any(x in n for x in ['résumé', 'resume', 'fiche', 'synthèse', 'recap']):
        return 'summary'
    if any(x in n for x in ['présentation', 'presentation', 'slides', '.pptx']):
        return 'presentation'
    return 'note'

# ── Detect subject from path ──────────────────────────────────────────────────
def detect_subject(file_info):
    # gdown returns objects with 'title' and optionally 'parent' or path info
    if hasattr(file_info, 'parent_titles'):
        parents = file_info.parent_titles
        if parents:
            return parents[-1]
    # Try from path attribute
    path = getattr(file_info, 'path', '') or ''
    parts = [p for p in path.split('/') if p]
    if len(parts) >= 2:
        return parts[-2]
    return 'Divers'

# ── Build resources list ──────────────────────────────────────────────────────
status('importing')
log('[INFO] Préparation des ressources...')

resources = []
for f in files_info:
    try:
        # Handle both dict and gdown GoogleDriveFileToDownload object
        if isinstance(f, dict):
            gdrive_id = f.get('id', '')
            title = f.get('title', f.get('name', ''))
            path = f.get('path', '')
            mime = f.get('mimeType', '')
            if 'folder' in mime:
                continue
            subject = f.get('parent_name', 'Divers')
        else:
            # gdown returns GoogleDriveFileToDownload(id, path, local_path)
            gdrive_id = getattr(f, 'id', '')
            path = getattr(f, 'path', '') or ''
            # Extract title from path (last component)
            title = path.split('/')[-1] if path else ''
            # Extract subject from path (parent folder)
            parts = [p for p in path.split('/') if p]
            subject = parts[-2] if len(parts) >= 2 else 'Divers'

        if not gdrive_id or not title:
            continue

        # Skip non-document files by extension
        ext = title.lower().split('.')[-1] if '.' in title else ''
        if ext in ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'avi', 'ds_store', 'zip', 'rar', '']:
            continue

        resource_type = detect_type(title)
        gdrive_url = f'https://drive.google.com/file/d/{gdrive_id}/view'

        resources.append({
            'title': title,
            'subject': subject,
            'resource_type': resource_type,
            'gdrive_id': gdrive_id,
            'gdrive_url': gdrive_url,
        })
    except Exception:
        continue

log(f'[INFO] {len(resources)} ressources valides à importer (sur {len(files_info)} fichiers listés)')

# ── Send to API in batches of 200 ─────────────────────────────────────────────
BATCH_SIZE = 200
inserted = 0
duplicates = 0
errors = 0
subjects_count = {}
type_count = {}

def api_post(endpoint, data):
    body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        f'{args.api}{endpoint}',
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {args.token}',
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {'error': e.read().decode()[:200]}
    except Exception as e:
        return {'error': str(e)}

total_batches = (len(resources) + BATCH_SIZE - 1) // BATCH_SIZE
for i in range(0, len(resources), BATCH_SIZE):
    batch = resources[i:i+BATCH_SIZE]
    batch_num = i // BATCH_SIZE + 1
    log(f'[BATCH {batch_num}/{total_batches}] Envoi de {len(batch)} ressources...')

    payload = {
        'faculty': args.faculty,
        'year': args.year,
        'university': args.university,
        'resources': batch,
    }
    result = api_post('/admin/import/gdrive-batch', payload)

    if 'error' in result:
        log(f'[BATCH {batch_num}] ❌ Erreur: {result["error"]}')
        errors += len(batch)
    else:
        batch_inserted = result.get('inserted', 0)
        batch_skipped = result.get('skipped', 0)
        inserted += batch_inserted
        duplicates += batch_skipped
        log(f'[BATCH {batch_num}] ✅ +{batch_inserted} insérés, {batch_skipped} doublons')

    # Count stats
    for r in batch:
        s = r['subject']
        subjects_count[s] = subjects_count.get(s, 0) + 1
        t = r['resource_type']
        type_count[t] = type_count.get(t, 0) + 1

    time.sleep(0.3)  # Be nice to the API

# ── Final summary ─────────────────────────────────────────────────────────────
summary = {
    'listed': len(files_info),
    'inserted': inserted,
    'duplicates': duplicates,
    'errors': errors,
    'subjects': dict(sorted(subjects_count.items(), key=lambda x: -x[1])[:20]),
    'byType': type_count,
}

print(f'SUMMARY:{json.dumps(summary)}', flush=True)
log(f'[DONE] Import terminé: {inserted} insérés, {duplicates} doublons, {errors} erreurs')
sys.exit(0)
