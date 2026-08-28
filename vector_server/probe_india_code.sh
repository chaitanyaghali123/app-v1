#!/bin/sh
ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
for u in \
 'https://www.indiacode.nic.in/bitstream/123456789/19150/1/constitution_of_india.pdf' \
 'https://indiacode.nic.in/bitstream/123456789/2065/1/aa2005.pdf' \
 'https://www.indiacode.nic.in/bitstream/123456789/15308/1/rti-act2005.pdf' \
 'https://www.indiacode.nic.in/bitstream/123456789/1558/1/A1988-49.pdf' \
 'https://www.indiacode.nic.in/bitstream/123456789/2122/1/201401.pdf' \
 'https://www.indiacode.nic.in/bitstream/123456789/15395/1/preventionofcorruptionact1988.pdf' \
 ; do
  code=$(curl -s -A "$ua" -o /dev/null -w '%{http_code} %{size_download}' "$u" --max-time 45)
  echo "$code  $u"
done