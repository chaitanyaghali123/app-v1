import requests
key = "AQ.Ab8RN6JEM8h7qwvtLG9zIr4D8kAnLDPHCuLYPV490CG1zvJhmQ"
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key={key}"
texts = [f"text {i} abcdefgh" for i in range(100)]
body = {"requests": [{"model": "models/gemini-embedding-2", "content": {"parts": [{"text": t}]}} for t in texts]}
r = requests.post(url, json=body, timeout=30)
print("status", r.status_code)
print(r.text[:200].replace("\n"," "))
