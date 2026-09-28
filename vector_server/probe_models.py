import requests, time, os

key = os.getenv("GEMINI_API_KEY", "")
s = requests.Session()
models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-3.1-flash"]
for m in models:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key=" + key
    body = {"contents": [{"parts": [{"text": "hi"}]}], "generationConfig": {"maxOutputTokens": 4}}
    try:
        r = s.post(url, json=body, timeout=60)
        if r.status_code == 200:
            print(m, "OK")
        else:
            try:
                j = r.json()
                print(m, r.status_code, (j.get("error", {}) or {}).get("status", ""), "::", (j.get("error", {}) or {}).get("message", "")[:220])
            except Exception:
                print(m, r.status_code, r.text[:220])
    except Exception as e:
        print(m, "EXC", str(e)[:120])
    time.sleep(1.0)