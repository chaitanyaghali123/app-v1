import os, time, requests
print("GEMINI_API_KEY set:", bool(os.getenv("GEMINI_API_KEY", "")))
KEY = os.getenv("GEMINI_API_KEY", "")
for model in ["models/gemini-3.6-flash", "models/gemini-3.5-flash", "models/gemini-3-flash-preview"]:
    url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent?key={KEY}"
    payload = {"contents": [{"parts": [{"text": "Say hello in one word."}]}]}
    try:
        t = time.time()
        r = requests.post(url, json=payload, timeout=90)
        print(f"{model}: HTTP {r.status_code} in {round(time.time()-t,1)}s")
        if r.status_code == 200:
            data = r.json()
            print("   text:", (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [{}])[0].get("text"))
        else:
            print("   body:", r.text[:400])
    except Exception as e:
        print(f"{model}: EXC {type(e).__name__} {e}")
