#!/bin/sh
cd /app
pkill -9 -f backfill_batch.py 2>/dev/null
sleep 2
export GEMINI_API_KEY="AQ.Ab8RN6LoOSPwRlbcVeFuvRGNkJUQUd84fZCM3Qj8AhILIHlBxg,AQ.Ab8RN6IxDmHUAUdyYYgqh_gYbqDSXYIYjddT7zpcMutZq3b1Bw,AQ.Ab8RN6JEM8h7qwvtLG9zIr4D8kAnLDPHCuLYPV490CG1zvJhmQ,AQ.Ab8RN6L-lD3k-b8_prFUkOCcMvVIGDgPTpoq81TU02iv5IVNTQ,AQ.Ab8RN6JEFqbl4fKHSyrp8XTZlUARDlv2Iq_ZPnQ5iSMc0e4udQ,AQ.Ab8RN6L5Yto3Xm1a2GGqCq5h3Ir36hRYLDmICcUQAiH8JzsOkA,AQ.Ab8RN6KV-JSEKbPuny2hhXobcQGJeyu_AaVQOCT96tm8rrUiuA,AQ.Ab8RN6LZI_RpV5NkMfFF42TAWVXeQfEmvnGlVTHmmIi8JeZQ7w"
export EMBED_BATCH="10"
export EMBED_PACE="0.2"
rm -f /app/embed_run10.log
nohup python -u /app/backfill_batch.py > /app/embed_run10.log 2>&1 &
echo "embed pid $!"