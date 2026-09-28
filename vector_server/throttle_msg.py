import requests, json
key = "AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg"
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key={key}"
texts = [f"text {i} abcdefgh" for i in range(100)]
body = {"requests": [{"model": "models/gemini-embedding-2", "content": {"parts": [{"text": t}]}} for t in texts]}
r = requests.post(url, json=body, timeout=30)
print("status", r.status_code)
print(r.text[:400])
for i in range(3):
    r = requests.post(url, json=body, timeout=30)
    print("then", r.status_code, r.text[:120].replace("\n"," "))
