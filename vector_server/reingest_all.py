import requests, time, sys

API = "http://localhost:7860"
KEY = "CHANGE_THIS_TO_64_CHAR_SECRET"
HEADERS = {"x-api-key": KEY}

folders = [
    "constitution", "culture", "disaster", "disaster-management",
    "economy", "environment", "ethics", "geography", "governance",
    "heritage", "history", "internal-security", "international",
    "international-relations", "polity", "science", "science-tech",
    "society",
]

job_ids = []
for folder in folders:
    print(f"\n=== Submitting {folder} ===")
    try:
        r = requests.post(f"{API}/ingest-hybrid",
            json={"folder": f"/app/data/{folder}"},
            headers=HEADERS, timeout=60)
        if r.status_code == 200:
            data = r.json()
            jid = data.get("job_id") or data.get("id")
            print(f"  OK: job_id={jid} chunks={data.get('chunks', '?')}")
            if jid:
                job_ids.append((folder, jid))
        else:
            print(f"  HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"  Error: {e}")

print(f"\n\n=== {len(job_ids)} jobs submitted. Polling... ===\n")

for iteration in range(120):
    time.sleep(30)
    all_done = True
    for folder, jid in job_ids:
        try:
            r = requests.get(f"{API}/ingest-status/{jid}",
                headers=HEADERS, timeout=10)
            js = r.json()
            status = js.get("status", "?")
            if status not in ("completed", "failed"):
                all_done = False
                print(f"  [{iteration*30}s] {folder}: {status}")
        except:
            all_done = False
    if all_done:
        print(f"\nAll jobs finished after ~{iteration*30}s")
        break

print("\n=== Final status ===")
for folder, jid in job_ids:
    try:
        r = requests.get(f"{API}/ingest-status/{jid}",
            headers=HEADERS, timeout=10)
        js = r.json()
        print(f"  {folder}: {js.get('status')} chunks={js.get('chunks', '?')}")
    except Exception as e:
        print(f"  {folder}: error {e}")
