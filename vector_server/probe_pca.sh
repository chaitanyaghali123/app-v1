#!/bin/sh
ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
probe() {
  name="$1"; url="$2"
  out="/tmp/probe_${name}.pdf"
  code=$(curl -sL -A "$ua" -o "$out" -w '%{http_code} %{size_download}' "$url" --max-time 120)
  sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
  sig=""
  if [ "$sz" -gt 4 ]; then
    sig=$(dd if="$out" bs=1 count=5 2>/dev/null | od -An -tx1 | tr -d ' \n')
  fi
  echo "$code SIG=$sig SIZE=$sz => $name"
  [ "$code" != "200 0" ] && [ "$(echo "$code" | cut -d' ' -f1)" = "200" ] && echo "  SAVED to /tmp/probe_${name}.pdf"
}
probe PCA_legislative "https://legislative.gov.in/sites/default/files/A1988-49.pdf"
probe PCA_s3waas      "https://cdnbbsr.s3waas.gov.in/s3a03fa30821986dff10fc66647c84c9c3/uploads/2021/01/2021011416.pdf"
probe PCA_thc         "https://thc.nic.in/Central%20Governmental%20Acts/Prevention%20of%20Corruption%20Act%2C%201988..pdf"