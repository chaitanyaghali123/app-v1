import os, requests
key = "AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg"
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key={key}"
body = {"requests": [{"model": "models/gemini-embedding-2", "content": {"parts": [{"text": "test one"}]}}, {"model": "models/gemini-embedding-2", "content": {"parts": [{"text": "test two"}]}}], "outputDimensionality": 3072}
r = requests.post(url, json=body, timeout=30)
print(r.status_code)
print(r.text[:300])
