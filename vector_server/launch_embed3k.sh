#!/bin/sh
cd /app
pkill -9 -f backfill_batch.py 2>/dev/null
sleep 2
export GEMINI_API_KEY="AQ.Ab8RN6L-lD3k-b8_prFUkOCcMvVIGDgPTpoq81TU02iv5IVNTQ,AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw,AQ.Ab8RN6JEFqbl4fKHSyrp8XTZlUARDlv2Iq_ZPnQ5iSMc0e4udQ"
export EMBED_BATCH="50"
export EMBED_PACE="0.7"
rm -f /app/embed_run3.log
nohup python -u /app/backfill_batch.py > /app/embed_run3.log 2>&1 &
echo "embed pid $!"