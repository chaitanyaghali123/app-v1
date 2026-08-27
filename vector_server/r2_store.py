"""
Cloudflare R2 object storage for UPSC notes.

R2 is S3-compatible, so we talk to it with boto3 using the
account-scoped endpoint. Bucket layout mirrors the local data dir:

    <subject_id>/<file.docx>          (or <prefix>/<subject_id>/<file>)

The sync layer pulls R2 objects into the local mirror dir before
ingestion so the path-based pipeline keeps working unchanged, and
tracks remote ETags in a manifest to avoid re-downloading unchanged
files.
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".txt", ".pdf", ".docx"}
MANIFEST_NAME = ".r2_manifest.json"

_client = None


def _settings():
    account_id = (os.getenv("R2_ACCOUNT_ID") or "").strip()
    endpoint = (os.getenv("R2_ENDPOINT_URL") or "").strip()
    if not endpoint and account_id:
        endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    return {
        "bucket": (os.getenv("R2_BUCKET") or "").strip(),
        "access_key": (os.getenv("R2_ACCESS_KEY_ID") or "").strip(),
        "secret_key": (os.getenv("R2_SECRET_ACCESS_KEY") or "").strip(),
        "prefix": (os.getenv("R2_PREFIX") or "").strip().strip("/"),
        "endpoint": endpoint,
    }


def r2_enabled():
    if os.getenv("SKIP_R2_SYNC", "").lower() in ("1", "true", "yes"):
        return False
    s = _settings()
    return bool(
        s["endpoint"] and s["bucket"] and s["access_key"] and s["secret_key"]
    )


def _get_client():
    global _client
    if _client is None:
        import boto3

        s = _settings()
        _client = boto3.client(
            "s3",
            endpoint_url=s["endpoint"],
            aws_access_key_id=s["access_key"],
            aws_secret_access_key=s["secret_key"],
            region_name="auto",
        )
    return _client


GS_SUBJECT_MAP = {
    "history": "gs1", "culture": "gs1", "heritage": "gs1", "art-culture": "gs1",
    "geography": "gs1", "society": "gs1", "indian-society": "gs1",
    "polity": "gs2", "governance": "gs2", "constitution": "gs2",
    "social-justice": "gs2", "international": "gs2", "international-relations": "gs2",
    "economy": "gs3", "environment": "gs3", "ecology": "gs3",
    "disaster": "gs3", "disaster-management": "gs3",
    "internal-security": "gs3", "security": "gs3",
    "science": "gs3", "technology": "gs3", "science-tech": "gs3", "agriculture": "gs3",
    "ethics": "gs4", "integrity": "gs4",
    "essay": "essay", "current-affairs": "essay", "optional": "optional",
}


def build_key(subject_id, filename):
    s = _settings()
    subject = (subject_id or "general").strip().lower() or "general"
    gs = GS_SUBJECT_MAP.get(subject, subject)
    name = Path(filename).name
    if s["prefix"]:
        return f"{s['prefix']}/{gs}/{subject}/{name}"
    return f"{gs}/{subject}/{name}"


def list_r2_objects():
    s = _settings()
    client = _get_client()
    prefix = f"{s['prefix']}/" if s["prefix"] else ""
    paginator = client.get_paginator("list_objects_v2")
    objects = {}
    for page in paginator.paginate(Bucket=s["bucket"], Prefix=prefix):
        for obj in page.get("Contents") or []:
            key = obj["Key"]
            rel = key[len(prefix):] if prefix else key
            parts = [p for p in rel.split("/") if p]
            if len(parts) == 3:
                rel = f"{parts[1]}/{parts[2]}"
            elif len(parts) == 2:
                rel = "/".join(parts)
            else:
                continue
            suffix = Path(rel).suffix.lower()
            if suffix not in ALLOWED_EXTENSIONS:
                continue
            objects[rel] = {
                "key": key,
                "etag": (obj.get("ETag") or "").strip('"'),
                "size": obj.get("Size", 0),
            }
    return objects


def download_r2_object(key, dest_path):
    s = _settings()
    dest = Path(dest_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    _get_client().download_file(s["bucket"], key, str(dest))


def upload_r2_object(key, src_path):
    s = _settings()
    _get_client().upload_file(str(src_path), s["bucket"], key)


def delete_r2_object(key):
    s = _settings()
    _get_client().delete_object(Bucket=s["bucket"], Key=key)


def _manifest_path(data_dir):
    return Path(data_dir) / MANIFEST_NAME


def _load_manifest(data_dir):
    try:
        return json.loads(_manifest_path(data_dir).read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_manifest(data_dir, manifest):
    try:
        _manifest_path(data_dir).write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )
    except Exception as exc:
        logger.warning(f"Could not persist R2 manifest: {exc}")


def sync_r2_to_local(data_dir):
    """Mirror R2 note objects into the local ingestion dir.

    Downloads new/changed files, deletes files removed from R2,
    leaves everything else untouched. Returns a stats dict.
    """
    data_dir = Path(data_dir)
    stats = {"downloaded": [], "removed": [], "unchanged": 0}

    remote = list_r2_objects()
    manifest = _load_manifest(data_dir)

    for rel, meta in remote.items():
        local = data_dir / rel
        if local.exists() and manifest.get(rel) == meta["etag"]:
            stats["unchanged"] += 1
            continue
        download_r2_object(meta["key"], local)
        manifest[rel] = meta["etag"]
        logger.info(f"☁️  R2 → local: {rel}")
        stats["downloaded"].append(rel)

    for rel in list(manifest.keys()):
        if rel not in remote:
            local = data_dir / rel
            if local.exists():
                local.unlink()
                logger.info(f"☁️  R2 removed, deleted local: {rel}")
                stats["removed"].append(rel)
            manifest.pop(rel, None)

    _save_manifest(data_dir, manifest)
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    target = os.getenv("R2_LOCAL_DIR", "/app/data")
    result = sync_r2_to_local(target)
    summary = {
        k: (len(v) if isinstance(v, list) else v) for k, v in result.items()
    }
    print(json.dumps(summary, indent=2))
