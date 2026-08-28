#!/bin/sh
ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
for h in \
 '2065' '1558' '2122' \
 ; do
  echo "==== handle 123456789/$h ===="
  curl -s -A "$ua" "https://indiacode.gov.in/handle/123456789/$h" --max-time 60 -o /tmp/h.html
  grep -oiE '"(https?:)?//[^"]*\.pdf' /tmp/h.html | sed 's/^"//' | sort -u
  grep -oiE '[a-z0-9_%.-]+\.pdf' /tmp/h.html | sort -u | head -5
 done