import requests
keys = {"k1new": "AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg", "k2old": "AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw", "k3": "AQ.Ab8RN6JEM8h7qwvtLG9zIr4D8kAnLDPHCuLYPV490CG1zvJhmQ"}
def status(k):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key={k}"
    t=[f"t{i}" for i in range(100)]
    r=requests.post(url,json={"requests":[{"model":"models/gemini-embedding-2","content":{"parts":[{"text":t}]}} for t in t]},timeout=30)
    return r.status_code
res={}
import concurrent.futures as cf
with cf.ThreadPoolExecutor(3) as ex:
    futs={ex.submit(status,k):n for n,k in keys.items()}
    for f in cf.as_completed(futs): res[futs[f]]=f.result()
print(res)
