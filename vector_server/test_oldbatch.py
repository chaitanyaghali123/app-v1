import requests
key = "AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw"
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key={key}"
body = {"requests": [{"model": "models/gemini-embedding-2", "content": {"parts": [{"text": "t1"}]}, "outputDimensionality": 3072, "taskType": "RETRIEVAL_DOCUMENT"}, {"model": "models/gemini-embedding-2", "content": {"parts": [{"text": "t2"}]}, "outputDimensionality": 3072, "taskType": "RETRIEVAL_DOCUMENT"}]}
r = requests.post(url, json=body, timeout=30)
print(r.status_code, r.text[:200])
