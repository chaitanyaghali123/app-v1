#!/bin/sh
ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
probe() {
  name="$1"; url="$2"
  out="/tmp/probe_$(echo "$name" | tr -c 'A-Za-z0-9' '_').pdf"
  code=$(curl -sL -A "$ua" -o "$out" -w '%{http_code} %{size_download}' "$url" --max-time 90)
  sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
  sig=""
  if [ "$sz" -gt 4 ]; then
    sig=$(dd if="$out" bs=1 count=5 2>/dev/null | od -An -tx1 | tr -d ' \n')
  fi
  echo "$code SIG=$sig => $name :: $url"
  rm -f "$out"
}
probe RTI_dopt      "https://dopt.gov.in/sites/default/files/RTI%20Act%202005%20%28Updated%29.PDF"
probe RTI_cic        "https://cic.gov.in/sites/default/files/RTI_English.pdf"
probe RTI_wayback    "https://web.archive.org/web/2024/https://www.indiacode.nic.in/bitstream/123456789/2065/1/aa2005.pdf"
probe PCA_wayback    "https://web.archive.org/web/2024/https://www.indiacode.nic.in/bitstream/123456789/15302/1/pc_act%2C_1988.pdf"
probe PCA_waybackA   "https://web.archive.org/web/2024/https://www.indiacode.nic.in/bitstream/123456789/1558/1/A1988-49.pdf"
probe Lokpal_rs      "https://cms.rajyasabha.nic.in/UploadedFiles/ElectronicPublications/Lokpal_LokayuAct%202013.pdf"
probe Lokpal_wb      "https://home.wb.gov.in/public/assets/frontend/pdf/lokpal_lokayukt_act_2013.pdf"
probe Lokpal_wayback "https://web.archive.org/web/2024/https://www.indiacode.nic.in/bitstream/123456789/2122/1/201401.pdf"