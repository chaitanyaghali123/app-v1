import fitz, os
for f, label in [('/tmp/probe_PCA_thc.pdf', 'THC'), ('/tmp/probe_PCA_s3waas.pdf', 'S3WAAS')]:
    if not os.path.exists(f):
        print(label, 'MISSING')
        continue
    d = fitz.open(f)
    chars = sum(len(d[i].get_text().strip()) for i in range(min(d.page_count, 10)))
    p0 = d[0].get_text().strip()[:140]
    print(label, 'pages=', d.page_count, 'first10pages_chars=', chars)
    print('  first_line=', repr(p0))
    d.close()