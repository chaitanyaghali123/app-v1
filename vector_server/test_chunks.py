import requests, json

r = requests.post('http://localhost:7860/chunks',
    json={'query': 'nitrogen cycle', 'subject_ids': ['geography'], 'top_k': 10},
    headers={'x-api-key': 'CHANGE_THIS_TO_64_CHAR_SECRET'}, timeout=120)
data = r.json()
print(f"Chunks: {data['count']}, Latency: {data['latency_seconds']}s")
for c in data['chunks']:
    m = c['metadata']
    print(f"  page={m['page_number']} score={c['vector_score']} file={m['source_file'][-50:]}")
    print(f"    text: {c['text'][:150]}...")
