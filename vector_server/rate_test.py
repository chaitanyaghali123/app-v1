import requests, time
keys = {"new": "AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg", "old": "AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw"}
for name, key in keys.items():
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key={key}"
    texts = [f"text {i} abcdefgh" for i in range(100)]
    body = {"requests": [{"model": "models/gemini-embedding-2", "content": {"parts": [{"text": t}]}} for t in texts]}
    ok = ra = 0
    start = time.time()
    while time.time() - start < 45:
        r = requests.post(url, json=body, timeout=30)
        if r.status_code == 200: ok += 1
        elif r.status_code == 429: ra += 1
        else: print(name, "other", r.status_code); break
        time.sleep(0.4)
    print(f"{name}: ok={ok} r429={ra} in 45s  (=>{ok*100} chunks/45s)")
