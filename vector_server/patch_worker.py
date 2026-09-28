import ast

p = "/app/chunk_persistent.py"
src = open(p, encoding="utf-8").read()

old_block = (
    '        "for rec in gen: texts.append(rec[\'text\'] if isinstance(rec,dict) else rec.get(\'text\',\'\')); "\n'
)
new_block = (
    '        "for rec in gen:\\n"\n'
    '        "    texts.append(rec[\'text\'] if isinstance(rec,dict) else rec.get(\'text\',\'\'))\\n"\n'
)
n1 = src.count(old_block)
src = src.replace(old_block, new_block)
open(p, "w", encoding="utf-8").write(src)
print("replaced blocks:", n1)

# Regenerate the worker from WORKER_SRC and check it compiles
import re
m = re.search(r"WORKER_SRC = r\'\'\'(.*?)\'\'\'", src, re.S)
assert m, "WORKER_SRC not found"
worker_src = m.group(1)
open("/app/chunk_persistent_worker.py", "w", encoding="utf-8").write(worker_src)
try:
    ast.parse(worker_src)
    print("WORKER SYNTAX OK")
except SyntaxError as e:
    print("WORKER SYNTAX ERROR:", e)
ast.parse(src)
print("PARENT SYNTAX OK")