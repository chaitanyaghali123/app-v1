#!/usr/bin/env python
"""List all prelims/ R2 object names grouped by folder (names only, +sizes)."""
import os, boto3
from pathlib import Path

s = os.environ
endpoint = (s.get("R2_ENDPOINT_URL") or "").strip()
if not endpoint and s.get("R2_ACCOUNT_ID"):
    endpoint = f"https://{s['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
cli = boto3.client(
    "s3", endpoint_url=endpoint,
    aws_access_key_id=s["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=s["R2_SECRET_ACCESS_KEY"],
)
pages = cli.get_paginator("list_objects_v2").paginate(Bucket=s["R2_BUCKET"], Prefix="prelims/")
items = []
for page in pages:
    for o in page.get("Contents") or []:
        items.append((o["Key"], o["Size"]))
items.sort()
from collections import defaultdict
groups = defaultdict(list)
for k, sz in items:
    p = k.split("/")
    folder = p[1] if len(p) > 2 else "ROOT"
    groups[folder].append((k, sz))
for folder in sorted(groups):
    print(f"### {folder} ({len(groups[folder])})")
    for k, sz in groups[folder]:
        print(f"  {sz:>9}  {k}")