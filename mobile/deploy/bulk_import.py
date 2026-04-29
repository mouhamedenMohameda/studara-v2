"""
Bulk scraper + importer for Tawjeeh.
1. Logs into production API as admin
2. Scrapes resultats.una.mr/FST for a range of student numbers
3. POSTs each to /api/v1/admin/import/fst
4. Prints a summary
"""
import urllib.request, urllib.parse, json, time, re

API = "http://5.189.153.144/api/v1"

# ── Step 1: admin login ──────────────────────────────────────────────────────
def login():
    body = json.dumps({"email": "admin@tawjeeh.mr", "password": "Admin@2025!"}).encode()
    req = urllib.request.Request(f"{API}/auth/login", data=body,
          headers={"Content-Type": "application/json"}, method="POST")
    r = urllib.request.urlopen(req)
    return json.loads(r.read())["access"]

TOKEN = login()
print(f"✅ Logged in")

# ── Step 2: Fetch UGEM Supabase to get existing resources ───────────────────
SUPA_URL  = "https://wgezqmflmceibgtyvddp.supabase.co"
# We'll try to discover the anon key from the JS bundle
try:
    js = urllib.request.urlopen("https://ugem-fst.vercel.app").read().decode()
    # look for supabase key in the HTML
    m = re.search(r'eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+', js)
    if m:
        ANON_KEY = m.group(0)
        print(f"✅ Found Supabase anon key: {ANON_KEY[:30]}...")
    else:
        print("⚠️  No key in HTML, will try JS bundle")
        ANON_KEY = None
except Exception as e:
    print(f"⚠️  UGEM fetch error: {e}")
    ANON_KEY = None

# ── Step 3: Scrape FST for a batch of student numbers ───────────────────────
# Format: C{year prefix}{number}  e.g. C311xx, C321xx, C331xx, C341xx
# We know C31109 works → try C311xx range + a few other years
def make_student_numbers():
    nums = []
    for prefix in ["C311", "C321", "C331", "C341", "C312", "C322", "C301", "C302"]:
        for i in range(1, 120):   # 01 → 119
            nums.append(f"{prefix}{i:02d}")
    return nums

def import_student(student_number, token):
    body = json.dumps({"studentNumber": student_number}).encode()
    req = urllib.request.Request(
        f"{API}/admin/import/fst",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        },
        method="POST"
    )
    try:
        r = urllib.request.urlopen(req, timeout=15)
        data = json.loads(r.read())
        return data
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if e.code == 404:
            return None  # student not found
        print(f"  HTTP {e.code} for {student_number}: {body[:80]}")
        return None
    except Exception as ex:
        print(f"  Error for {student_number}: {ex}")
        return None

print("\n🔄 Starting bulk FST import...\n")
total_inserted = 0
total_skipped  = 0
students_found = 0
students_nums  = make_student_numbers()
print(f"Will try {len(students_nums)} student numbers\n")

for i, snum in enumerate(students_nums):
    result = import_student(snum, TOKEN)
    if result and result.get("student"):
        s = result["student"]
        t = result.get("totals", {})
        ins = t.get("inserted", 0)
        skp = t.get("skipped", 0)
        total_inserted += ins
        total_skipped  += skp
        students_found += 1
        print(f"✅ [{students_found:3d}] {snum} → {s['studentName'][:30]:30s} | {ins} new, {skp} skip")

        # Re-auth every 50 students (token expires in 15min)
        if students_found % 50 == 0:
            TOKEN = login()
            print("  🔑 Token refreshed")

    # Small delay to avoid hammering resultats.una.mr
    time.sleep(0.5)

print(f"\n{'='*60}")
print(f"✅ Done! {students_found} students found")
print(f"   {total_inserted} courses inserted | {total_skipped} already existed")
