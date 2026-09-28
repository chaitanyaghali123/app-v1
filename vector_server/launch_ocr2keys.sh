#!/bin/sh
cd /app
pkill -f chunk_persistent.py 2>/dev/null
pkill -f chunk_persistent_worker.py 2>/dev/null
pkill -f backfill_batch.py 2>/dev/null
sleep 2
export GEMINI_KEYS="AQ.Ab8RN6L-lD3k-b8_prFUkOCcMvVIGDgPTpoq81TU02iv5IVNTQ,AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw"
export GEMINI_API_KEY="$GEMINI_KEYS"
export GEMINI_OCR_MODEL="gemini-3.6-flash"
export OCR_ENGINE="auto"
export OCR_DPI="150"
export OCR_MIN_CHARS="50"
export WORKERS="2"
rm -f /app/gemini_ocr.log
nohup python -u /app/chunk_persistent.py > /app/gemini_ocr.log 2>&1 &
echo "OCR pid $!"