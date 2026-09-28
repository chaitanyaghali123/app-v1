#!/usr/bin/env python
"""Count R2 objects under the prelims/ prefix (raw, no normalization)."""
import os, boto3
from collections import Counter

s = os.environ
endpoint = (s.get("R2_ENDPOINT_URL") or "").strip()
if not endpoint and s.get("R2_ACCOUNT_ID"):
    endpoint = f"https://{s['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
cli = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=s["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=s["R2_SECRET_ACCESS_KEY"],
)
b = s["R2_BUCKET"]
keys = []
paginator = cli.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket=b, Prefix="prelims/"):
    for o in page.get("Contents") or []:
        keys.append((o["Key"], o["Size"]))
print("total prelims objects:", len(keys))
c = Counter(k.split("/")[1] for k, _ in keys if "/" in k)
for folder, n in sorted(c.items()):
    print(folder, n)
for k, sz in sorted(keys)[:8]:
    print("smp", k, sz)