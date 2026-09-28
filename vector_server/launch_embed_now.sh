#!/bin/sh
cd /app
export GEMINI_API_KEY="AQ.Ab8RN6L-lD3k-b8_prFUkOCcMvVIGDgPTpoq81TU02iv5IVNTQ,AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw"
export EMBED_BATCH="50"
export EMBED_PACE="0.7"
rm -f /app/embed_run.log
nohup python -u /app/backfill_batch.py > /app/embed_run.log 2>&1 &
echo "embed pid $!"