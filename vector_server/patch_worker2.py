import re, ast

p = "/app/chunk_persistent.py"
src = open(p, encoding="utf-8").read()

old_block = (
    '        "gen=ih.read_pdf_pages(p) if suffix==\'.pdf\' else (ih.read_txt_blocks(p) if suffix==\'.txt\' else ih.read_docx_blocks(p)); "\n'
    '        "for rec in gen:\\n"\n'
    '        "    texts.append(rec[\'text\'] if isinstance(rec,dict) else rec.get(\'text\',\'\'))\\n"\n'
    '        "print(json.dumps({\'text\':\'\\\\n\\\\n\'.join(texts)}))"\n'
)
new_block = (
    '        "gen=ih.read_pdf_pages(p) if suffix==\'.pdf\' else (ih.read_txt_blocks(p) if suffix==\'.txt\' else ih.read_docx_blocks(p))\\n"\n'
    '        "for rec in gen:\\n"\n'
    '        "    texts.append(rec[\'text\'] if isinstance(rec,dict) else rec.get(\'text\',\'\'))\\n"\n'
    '        "print(json.dumps({\'text\':\'\\\\n\\\\n\'.join(texts)}))"\n'
)
n1 = src.count(old_block)
if n1 == 0:
    raise SystemExit("block not found")
src = src.replace(old_block, new_block)
open(p, "w", encoding="utf-8").write(src)
print("replaced:", n1)

m = re.search(r"WORKER_SRC = r\'\'\'(.*?)\'\'\'", src, re.S)
assert m, "WORKER_SRC not found"
worker_src = m.group(1)
open("/app/chunk_persistent_worker.py", "w", encoding="utf-8").write(worker_src)
ast.parse(worker_src); print("WORKER SYNTAX OK")
ast.parse(src); print("PARENT SYNTAX OK")