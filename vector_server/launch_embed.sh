#!/bin/sh
cd /app
export GEMINI_API_KEY="AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg,AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw,AQ.Ab8RN6JEM8h7qwvtLG9zIr4D8kAnLDPHCuLYPV490CG1zvJhmQ"
export EMBED_BATCH="100"
export EMBED_PACE="0.5"
nohup python /app/backfill_batch.py > /app/embed_batch.log 2>&1 &
echo "embed backend pid $!"