import requests, time, os, sys

mode = sys.argv[1]           # "embed" or a text model id
interval = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
count = int(sys.argv[3]) if len(sys.argv) > 3 else 25
key = os.getenv("GEMINI_API_KEY", "")
s = requests.Session()

if mode == "embed":
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key={key}"
    body = {"model": "models/gemini-embedding-2",
            "content": {"parts": [{"text": "sustained pacing probe text"}]},
            "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": 3072}
    def item(): return url, body
else:
    model = mode
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    body = {"contents": [{"parts": [{"text": "hi"}]}], "generationConfig": {"maxOutputTokens": 4}}
    def item(): return url, body

ok = err = 0
first_429_at = None
for i in range(count):
    t0 = time.time()
    u, b = item()
    try:
        r = s.post(u, json=b, timeout=60)
    except Exception as e:
        err += 1
        print(f"{i}: EXC {str(e)[:80]}", flush=True)
        time.sleep(interval)
        continue
    dt = time.time() - t0
    if r.status_code == 200:
        ok += 1
    else:
        err += 1
        try:
            j = r.json().get("error", {}) or {}
            msg = j.get("message", "")[:150]
            st = j.get("status", "")
        except Exception:
            msg, st = r.text[:150], "raw"
        print(f"{i}: {r.status_code}/{st} {msg}", flush=True)
        if r.status_code == 429 and first_429_at is None:
            first_429_at = i
    if (i + 1) % 5 == 0:
        print(f"...{i+1}: ok={ok} err={err}", flush=True)
    time.sleep(max(0.0, interval - dt))
print(f"RESULT ok={ok} err={err} first_429_at={first_429_at}")