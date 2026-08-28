#!/bin/sh
set -e
mkdir -p /app/data/gs2/ethics
for spec in \
  "IGNOU_MPA011_Unit21_Ethical_Concerns|https://egyankosh.ac.in/bitstream/123456789/25253/1/Unit-21.pdf" \
  "IGNOU_MAPY002_Ethics_Block1_Intro|https://egyankosh.ac.in/bitstream/123456789/34877/1/Block-1.pdf" \
  ; do
  name="${spec%%|*}"
  url="${spec#*|}"
  echo "=== downloading $name ==="
  curl -sL -o "/app/data/gs2/ethics/${name}.pdf" "$url" --max-time 120
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "FAILED rc=$rc $name"
  else
    sz=$(stat -c%s "/app/data/gs2/ethics/${name}.pdf" 2>/dev/null || echo 0)
    echo "OK $name size=$sz"
  fi
done
echo "=== list ==="
ls -la /app/data/gs2/ethics/