import os, ssl, urllib.request, warnings, sys
from pathlib import Path
warnings.filterwarnings("ignore")

OUT = Path("/app/tmp_sources"); OUT.mkdir(exist_ok=True, parents=True)

ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))

CANDIDATES = {
 "NCERT-class11-physgeog-full.zip": "https://ncert.nic.in/textbook/pdf/kegy2dd.zip",
 "NCERT-c11-l234.pdf": "https://ncert.nic.in/textbook/pdf/kegy204.pdf",
 "NCERT-c11-landform.pdf": "https://ncert.nic.in/textbook/pdf/kegy207.pdf",
 "NCERT-c11-atm-circ.pdf": "https://ncert.nic.in/textbook/pdf/kegy210.pdf",
 "NCERT-c12-minerals.pdf": "https://ncert.nic.in/textbook/pdf/lepy205.pdf",
 "NCERT-c12-agri-land.pdf": "https://ncert.nic.in/textbook/pdf/lepy203.pdf",
 "NCERT-c12-industry.pdf": "https://ncert.nic.in/textbook/pdf/lepy208.pdf",
 "NCERT-archive-kegy2.pdf": "https://archive.org/download/ncert-kegy2/kegy2.pdf",
 "NCERT-archive-kegy2.jpg": "https://archive.org/download/ncert-kegy2/ncert-kegy2.pdf",
 "NITI-MPI-2023.pdf": "https://niti.gov.in/sites/default/files/2023-08/India-National-Multidimentional-Poverty-Index-2023.pdf",
 "UNDP-MPI-2023.pdf": "https://www.undp.org/sites/g/files/zskgke326/files/2023-08/india-national-multidimentional-poverty-index-2023_16_aug.pdf",
 "WIPO-IP-Handbook.pdf": "https://tind.wipo.int/nanna/record/28661/files/wipo_pub_489.pdf",
 "WIPO-IP-Handbook-v2.pdf": "https://tind.wipo.int/record/28661/files/wipo_pub_489.pdf",
 "NIP-Vol1-PIB.pdf": "https://static.pib.gov.in/WriteReadData/userfiles/DEA%20IPF%20NIP%20Report%20Vol%201.pdf",
 "NIP-Vol1-PPIAF.pdf": "https://www.ppiaf.org/sites/default/files/documents/2020-01/DEA_IPF_NIP_Report_Vol_1_0.pdf",
 "Gita-2388.txt": "https://www.gutenberg.org/ebooks/2388.txt.utf-8",
 "Gita-2388-alternate.txt": "https://www.gutenberg.org/cache/epub/2388/pg2388.txt",
}

results = {}
for name, url in CANDIDATES.items():
    dest = OUT / name
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with opener.open(req, timeout=40) as r:
            data = r.read()
        data = data if data else b""
        dest.write_bytes(data)
        head = data[:16]
        size = len(data)
        if size > 2000:
            results[name] = str(dest)
            print(f"OK   {name:28} {size:>9} {r.status} {head!r}")
        else:
            print(f"SMALL {name:26} {size:>9} {r.status} {head!r}")
    except Exception as e:
        print(f"FAIL {name:28} {repr(e)[:70]}")

print("\nok list:")
for k, v in results.items():
    print(" ", k, "->", v)