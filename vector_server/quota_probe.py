import os, time, requests
KEY = os.getenv("GEMINI_API_KEY", "")
model = "models/gemini-3.6-flash"
url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent?key={KEY}"
payload = {"contents": [{"parts": [{"text": "Reply with the single word: ok"}]}]}
for i in range(5):
    t = time.time()
    r = requests.post(url, json=payload, timeout=60)
    body = r.text[:500]
    if r.status_code != 200:
        print(f"[{i}] HTTP {r.status_code} in {round(time.time()-t,1)}s :: {body}")
    else:
        print(f"[{i}] HTTP 200 in {round(time.time()-t,1)}s")
    if i < 4:
        time.sleep(2)

print("\\n=== EMBED PROBE ===")
EMBED = os.getenv("EMBED_MODEL", "gemini-embedding-2")
emb_url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED}:embedContent?key={KEY}"
emb_body = {"model": f"models/{EMBED}", "content": {"parts": [{"text": "test"}]},
            "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": 3072}
for i in range(5):
    t = time.time()
    r = requests.post(emb_url, json=emb_body, timeout=60)
    if r.status_code != 200:
        print(f"emb[{i}] HTTP {r.status_code} in {round(time.time()-t,1)}s :: {r.text[:300]}")
    else:
        print(f"emb[{i}] HTTP 200 in {round(time.time()-t,1)}s")
    if i < 4:
        time.sleep(2)
