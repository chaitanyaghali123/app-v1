#!/bin/sh
exec >> /app/tomorrow.log 2>&1
cd /app
echo "== [$(date -u)] tomorrow_run: waiting until 07:00 UTC"
while [ "$(date -u +%H%M)" != "0700" ]; do
  sleep 60
done
echo "== [$(date -u)] PHASE 1: Gemini OCR"
pkill -f chunk_persistent_worker.py
pkill -f chunk_persistent.py
pkill -f backfill_batch.py
sleep 3
export GEMINI_KEYS="AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg,AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw,AQ.Ab8RN6JEM8h7qwvtLG9zIr4D8kAnLDPHCuLYPV490CG1zvJhmQ"
export GEMINI_API_KEY="$GEMINI_KEYS"
export GEMINI_OCR_MODEL="gemini-3.6-flash"
export OCR_ENGINE="auto"
export OCR_DPI="150"
export OCR_MIN_CHARS="50"
export WORKERS="4"
nohup python /app/chunk_persistent.py > /app/gemini_ocr.log 2>&1 &
OCR_PID=$!
echo "OCR pid $OCR_PID"
while kill -0 $OCR_PID 2>/dev/null; do
  sleep 60
done
echo "== [$(date -u)] PHASE 2: embedding"
export GEMINI_API_KEY="$GEMINI_KEYS"
export EMBED_BATCH="100"
export EMBED_PACE="1.5"
nohup python -u /app/backfill_batch.py > /app/embed_final.log 2>&1 &
echo "embed pid $!"
echo "== [$(date -u)] embedded drain started"