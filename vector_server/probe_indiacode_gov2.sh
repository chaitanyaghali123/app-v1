#!/bin/sh
ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
curl -s -A "$ua" "https://indiacode.gov.in/handle/123456789/2065" --max-time 60 -o /tmp/h.html
echo "SIZE: $(wc -c < /tmp/h.html)"
echo "== title =="
grep -oiE '<title>[^<]*</title>' /tmp/h.html
echo "== links containing pdf/download/bitstream/api =="
grep -oiE '(href|src|data-[a-z]+)="[^"]*(pdf|download|bitstream|api|rest)[^"]*"' /tmp/h.html | sort -u | head -40