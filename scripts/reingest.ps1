# Re-queues ingestion for all R2 content. Dedup skips already-indexed files,
# so this safely retries anything that previously failed (e.g. Gemini 429).
# Free-tier Gemini quota resets midnight Pacific (~12:30 PM IST).

docker exec aryabhata-ingestor python -c "
import json, urllib.request, os
req = urllib.request.Request('http://localhost:7860/ingest-hybrid',
    data=json.dumps({'folder': '/app/data'}).encode(),
    headers={'Content-Type':'application/json','x-api-key': os.getenv('API_KEY','')})
r = urllib.request.urlopen(req, timeout=30)
print(r.status, r.read().decode())
"

Write-Host ""
Write-Host "Queued. Monitor with:"
Write-Host "  docker logs aryabhata-celery --tail 50"
Write-Host '  docker exec aryabhata-db psql -U aryabhata_user -d aryabhata_db -c "SELECT status, count(*) FROM documents GROUP BY status;"'
