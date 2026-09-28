#!/bin/sh
cd /app
export GEMINI_KEYS="AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg,AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw,AQ.Ab8RN6JEM8h7qwvtLG9zIr4D8kAnLDPHCuLYPV490CG1zvJhmQ"
export GEMINI_API_KEY="AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg,AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw,AQ.Ab8RN6JEM8h7qwvtLG9zIr4D8kAnLDPHCuLYPV490CG1zvJhmQ"
export GEMINI_OCR_MODEL="gemini-3.6-flash"
export OCR_ENGINE="auto"
export OCR_DPI="150"
export OCR_MIN_CHARS="50"
export WORKERS="8"
nohup python /app/chunk_persistent.py > /app/final_chunk.log 2>&1 &
echo "chunk pid $!"