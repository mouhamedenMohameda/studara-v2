#!/usr/bin/env python3
"""
Bulk import via the production API endpoint (uses cheerio scraper under the hood)
Runs on the Mac, calls the live API.
"""
import urllib.request, urllib.parse, json, time, sys

API = "http://5.189.153.144/api/v1"
TOKEN = ""
TOKEN_CALLS = 0

def refresh_token():
    global TOKEN, TOKEN_CALLS
    body = json.dumps({"email": "admin@tawjeeh.mr", "password": "Admin@2025!"}).encode()
    req = urllib.request.Request(f"{API}/auth/login", data=body,
          headers={"Content-Type": "application/json"}, method="POST")
    r = urllib.request.urlopen(req, timeout=10)
    TOKEN = json.loads(r.read())["access"]
    TOKEN_CALLS = 0

def import_student(student_number):
    global TOKEN_CALLS
    if TOKEN_CALLS >= 40:
        refresh_token()
    body = json.dumps({"studentNumber": student_number}).encode()
    req = urllib.request.Request(
        f"{API}/admin/import/fst",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
        method="POST"
    )
    TOKEN_CALLS += 1
    try:
        r = urllib.request.urlopen(req, timeout=20)
        return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if e.code in (404, 400):
            return None
        if e.code == 401:
            refresh_token()
            return import_student(student_number)
        return None
    except Exception:
        return None

# Build list of student numbers to try
prefixes = [
    'C311', 'C321', 'C331', 'C341',
    'C312', 'C322', 'C332', 'C342',
    'C301', 'C302', 'C303', 'C304',
    'C313', 'C323', 'C333', 'C343',
]
numbers = []
for p in prefixes:
    for i in range(1, 200):
        numbers.append(f"{p}{i:02d}")

refresh_token()
print(f"✅ Logged in. {len(numbers)} student numbers to try\n")

found = 0
total_ins = 0
total_skip = 0

for i, snum in enumerate(numbers):
    result = import_student(snum)
    if result and result.get("student"):
        s = result["student"]
        t = result.get("totals", {})
        ins = t.get("inserted", 0)
        skp = t.get("skipped", 0)
        total_ins  += ins
        total_skip += skp
        found += 1
        print(f"✅ [{found:3d}] {snum} → {s['studentName'][:32]:32s} | +{ins} new, skip={skp}")
        sys.stdout.flush()

    # Progress every 50
    if (i + 1) % 50 == 0:
        print(f"   ... checked {i+1}/{len(numbers)}, found {found} students so far ...")
        sys.stdout.flush()

    time.sleep(0.4)

print(f"\n{'='*60}")
print(f"✅ Done! {found} students found")
print(f"   {total_ins} courses inserted | {total_skip} already existed")
