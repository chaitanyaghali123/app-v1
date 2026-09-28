import requests, time, os, sys

model = sys.argv[1] if len(sys.argv) > 1 else "gemini-3.6-flash"
key = os.getenv("GEMINI_API_KEY", "")
url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key
s = requests.Session()
statuses = {}
for i in range(20):
    body = {"contents": [{"parts": [{"text": "say ok"}]}], "generationConfig": {"maxOutputTokens": 8}}
    try:
        r = s.post(url, json=body, timeout=60)
        statuses[r.status_code] = statuses.get(r.status_code, 0) + 1
        if r.status_code != 200:
            try:
                j = r.json()
                reason = (j.get("error", {}) or {}).get("status", "") or r.text[:120]
            except Exception:
                reason = r.text[:120]
            print(i, r.status_code, reason)
        else:
            print(i, 200)
    except Exception as e:
        print(i, "EXC", str(e)[:100])
    time.sleep(0.2)
print("SUMMARY", statuses)