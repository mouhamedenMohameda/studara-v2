#!/usr/bin/env python3
"""
Bulk FST importer — runs on the server, calls localhost:3000 API
"""
import urllib.request, json, time, sys

API = "http://localhost:3000/api/v1"
TOKEN = ""
TOKEN_CALLS = 0

def refresh_token():
    global TOKEN, TOKEN_CALLS
    body = json.dumps({"email":"admin@tawjeeh.mr","password":"Admin@2025!"}).encode()
    req = urllib.request.Request(f"{API}/auth/login", data=body,
          headers={"Content-Type":"application/json"}, method="POST")
    r = urllib.request.urlopen(req, timeout=10)
    TOKEN = json.loads(r.read())["access"]
    TOKEN_CALLS = 0

def import_student(snum):
    global TOKEN_CALLS
    if TOKEN_CALLS >= 40:
        refresh_token()
    body = json.dumps({"studentNumber": snum}).encode()
    req = urllib.request.Request(f"{API}/admin/import/fst", data=body,
          headers={"Content-Type":"application/json","Authorization":f"Bearer {TOKEN}"},
          method="POST")
    TOKEN_CALLS += 1
    try:
        r = urllib.request.urlopen(req, timeout=25)
        return json.loads(r.read())
    except urllib.error.HTTPError as e:
        e.read()
        if e.code == 401:
            refresh_token()
            return import_student(snum)
        if e.code == 429:
            print(f"    429 rate-limit, sleeping 30s...", flush=True)
            time.sleep(30)
            return import_student(snum)
        return None
    except Exception:
        return None

prefixes = [
    'C311','C321','C331','C341',
    'C312','C322','C332','C342',
    'C301','C302','C303','C304',
    'C313','C323','C333','C343',
    'C314','C324','C334','C344',
]
numbers = []
for p in prefixes:
    for i in range(1, 200):
        numbers.append(f"{p}{i:02d}")

# Skip already-imported C311xx (01-183 done)
done_prefixes_full = set()
# We know C311 01-183 were done, skip them
numbers = [n for n in numbers if not (n.startswith('C311') and int(n[4:]) <= 183)]

refresh_token()
print(f"Logged in. {len(numbers)} numbers to try", flush=True)

found = total_ins = total_skip = 0
for i, snum in enumerate(numbers):
    r = import_student(snum)
    if r and r.get("student"):
        s = r["student"]
        t = r.get("totals",{})
        ins  = t.get("inserted",0)
        skp  = t.get("skipped",0)
        total_ins  += ins
        total_skip += skp
        found += 1
        print(f"[{found:3d}] {snum} {s['studentName'][:30]} | +{ins}", flush=True)
    if (i+1) % 100 == 0:
        print(f"--- progress: {i+1}/{len(numbers)}, found={found}, ins={total_ins} ---", flush=True)
    time.sleep(2.0)  # 2s delay to avoid 429

print(f"\nDONE: {found} students, {total_ins} inserted, {total_skip} skipped", flush=True)
