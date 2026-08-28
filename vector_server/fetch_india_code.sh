#!/bin/sh
mkdir -p /app/data/gs2/ethics
ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
fetch() {
  name="$1"; url="$2"
  out="/app/data/gs2/ethics/${name}.pdf"
  code=$(curl -sL -A "$ua" -o "$out" -w "%{http_code}" "$url" --max-time 180 2>/dev/null)
  sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
  sig=""
  if [ "$sz" -gt 4 ]; then
    sig=$(dd if="$out" bs=1 count=4 2>/dev/null | od -An -tx1 | tr -d ' \n')
  fi
  echo "$name HTTP=$code SIZE=$sz SIG=$sig"
}
fetch "RTI_Act_2005" "https://www.indiacode.nic.in/bitstream/123456789/2065/1/aa2005.pdf"
fetch "Prevention_of_Corruption_Act_1988" "https://www.indiacode.nic.in/bitstream/123456789/15302/1/pc_act%2C_1988.pdf"
fetch "Lokpal_and_Lokayuktas_Act_2013" "https://www.indiacode.nic.in/bitstream/123456789/2122/1/201401.pdf"