"""Cloudflare R2 storage helper.

R2 exposes an S3-compatible API, so we just talk to it with boto3.

Env vars (set in BN/.env locally and on Railway):
  R2_ACCOUNT_ID          – Cloudflare account id (visible on R2 overview page)
  R2_ACCESS_KEY_ID       – from an R2 API token (Object Read & Write)
  R2_SECRET_ACCESS_KEY   – ditto
  R2_BUCKET              – bucket name (e.g. cinebook-posters)
  R2_PUBLIC_BASE         – public base URL for the bucket
                           (R2.dev subdomain or your custom domain)
"""
from __future__ import annotations

import os
import uuid
from functools import lru_cache
from typing import Tuple

import boto3
from botocore.config import Config


ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

MAX_POSTER_BYTES = 5 * 1024 * 1024  # 5 MB


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            "See BN/storage.py for the full list."
        )
    return value


@lru_cache
def get_r2_client():
    account_id = _require_env("R2_ACCOUNT_ID")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=_require_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=_require_env("R2_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        region_name="auto",
    )


def upload_poster(data: bytes, content_type: str) -> Tuple[str, str]:
    """Upload poster bytes to R2 and return (public_url, object_key)."""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(f"Unsupported content type: {content_type}")

    bucket = _require_env("R2_BUCKET")
    public_base = _require_env("R2_PUBLIC_BASE").rstrip("/")
    ext = ALLOWED_CONTENT_TYPES[content_type]
    key = f"posters/{uuid.uuid4().hex}{ext}"

    get_r2_client().put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )
    return f"{public_base}/{key}", key
