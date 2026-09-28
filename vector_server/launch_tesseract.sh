#!/bin/sh
cd /app
export GEMINI_KEYS=""
export GEMINI_API_KEY=""
export GEMINI_OCR_MODEL="gemini-3.6-flash"
export OCR_ENGINE="tesseract"
export OCR_DPI="150"
export OCR_MIN_CHARS="50"
export WORKERS="4"
export SOURCE="any"
nohup python -u /app/chunk_persistent.py > /app/final_chunk2.log 2>&1 &
echo "chunk pid $!"