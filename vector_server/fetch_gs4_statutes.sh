#!/bin/sh
set -e
ua="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
mkdir -p /app/data/gs2/ethics
fetch() {
  name="$1"; url="$2"
  out="/app/data/gs2/ethics/${name}.pdf"
  code=$(curl -sL -A "$ua" -o "$out" -w '%{http_code} %{size_download}' "$url" --max-time 180)
  sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
  sig=$(dd if="$out" bs=1 count=5 2>/dev/null | od -An -tx1 | tr -d ' \n')
  echo "$code SIZE=$sz SIG=$sig => $out"
}
fetch "Right_to_Information_Act_2005"     "https://dopt.gov.in/sites/default/files/RTI%20Act%202005%20%28Updated%29.PDF"
fetch "Prevention_of_Corruption_Act_1988" "https://cdnbbsr.s3waas.gov.in/s3a03fa30821986dff10fc66647c84c9c3/uploads/2021/01/2021011416.pdf"
fetch "Lokpal_and_Lokayuktas_Act_2013"    "https://cms.rajyasabha.nic.in/UploadedFiles/ElectronicPublications/Lokpal_LokayuAct%202013.pdf"