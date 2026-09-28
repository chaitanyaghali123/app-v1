import requests
keys = {"new": "AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg", "old": "AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw"}
for name, key in keys.items():
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key={key}"
    r = requests.post(url, json={"requests": [{"model": "models/gemini-embedding-2", "content": {"parts": [{"text": "t"}]}}]}, timeout=30)
    print(name, r.status_code, r.text[:120].replace("\n", " "))
