#!/bin/sh
url="https://egyankosh.ac.in/bitstream/123456789/25253/1/Unit-21.pdf"
out="/app/data/gs2/ethics/IGNOU_MPA011_Unit21_Ethical_Concerns.pdf"
code=$(curl -sL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o "$out" -w "%{http_code}" "$url" --max-time 120 2>/dev/null)
echo "HTTP=$code"
sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
echo "SIZE=$sz"
file "$out"
head -c 200 "$out" | strings | head -3