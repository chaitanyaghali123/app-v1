import fitz, os
base = '/app/data/gs2'
for rel in ['disaster-management/NDMA_Drought.pdf',
            'disaster-management/NDMA_GLOF.pdf',
            'disaster-management/NDMA_Heat_Wave.pdf',
            'culture/NIOS223_Lesson12_English.pdf']:
    fp = os.path.join(base, rel)
    doc = fitz.open(fp)
    n = doc.page_count
    txt = sum(len(doc[i].get_text("text").strip()) for i in range(n))
    print(f"{rel}: pages={n} chars={txt} size={os.path.getsize(fp)}")
    doc.close()