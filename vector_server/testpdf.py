import pypdf, sys
paths = [
 '/app/data/environment/NationalBiodiversityActionPlan_2008.pdf',
 '/app/data/optional/public-administration-optional/MPA-014_123456789-43820_Unit-23.pdf',
 '/app/data/optional/public-administration-optional/MPA-014_123456789-43822_Unit-24.pdf',
 '/app/data/optional/sociology-optional/MSOE-002_123456789-27466_Unit-7.pdf',
]
for p in paths:
    try:
        r = pypdf.PdfReader(p)
        print(p.split('/')[-1], 'OK pages=', len(r.pages), 'encrypted=', r.is_encrypted)
        t = r.pages[0].extract_text() or ''
        print('   page0 text[:80]:', repr(t[:80]))
    except Exception as e:
        print(p.split('/')[-1], 'FAIL', type(e).__name__, str(e)[:200])