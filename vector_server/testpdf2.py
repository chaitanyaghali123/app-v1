import fitz
paths = [
 '/app/data/environment/NationalBiodiversityActionPlan_2008.pdf',
 '/app/data/optional/public-administration-optional/MPA-014_123456789-43820_Unit-23.pdf',
 '/app/data/optional/public-administration-optional/MPA-014_123456789-43822_Unit-24.pdf',
 '/app/data/optional/sociology-optional/MSOE-002_123456789-27466_Unit-7.pdf',
]
for p in paths:
    try:
        d = fitz.open(p)
        print(p.split('/')[-1], 'OK pages=', d.page_count, 'needs_pass=', d.needs_pass)
        print('   page0 text[:80]:', repr(d[0].get_text()[:80]))
        d.close()
    except Exception as e:
        print(p.split('/')[-1], 'FAIL', type(e).__name__, str(e)[:200])