#!/bin/sh
cd /app
export GEMINI_KEYS="$GEMINI_API_KEY"
export GEMINI_OCR_MODEL="gemini-3.6-flash"
export OCR_ENGINE="auto"
export OCR_DPI="150"
export WORKERS="4"
nohup python /app/chunk_persistent.py > /app/gemini_chunk.log 2>&1 &
echo "launched pid $!"