#!/bin/sh
ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
echo "== redirect target for non-www RTI =="
curl -s -A "$ua" -I 'https://indiacode.nic.in/bitstream/123456789/2065/1/aa2005.pdf' --max-time 45 | grep -i 'location'
echo "== handle pages =="
for h in \
 'https://www.indiacode.nic.in/handle/123456789/2065' \
 'https://www.indiacode.nic.in/handle/123456789/1558' \
 'https://www.indiacode.nic.in/handle/123456789/2122' \
 ; do
  code=$(curl -s -A "$ua" -o /tmp/handle.html -w '%{http_code} %{size_download}' "$h" --max-time 60)
  echo "$code  $h"
  grep -oiE 'bitstream/[0-9/]+[a-z_.-]+\.pdf' /tmp/handle.html | sort -u | head -8
 done
echo "== indiacode.gov.in probe =="
curl -s -A "$ua" -o /dev/null -w '%{http_code} %{url_effective}\n' -L 'https://indiacode.gov.in/handle/123456789/2065' --max-time 60