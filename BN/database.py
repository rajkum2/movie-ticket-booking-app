"""Supabase client setup.

Reads credentials from environment variables so they can be configured
on Railway without touching the code:

  SUPABASE_URL  - your project URL  (https://xxxx.supabase.co)
  SUPABASE_KEY  - the service_role key (used server-side only)
"""
import os
from functools import lru_cache

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()


@lru_cache
def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_KEY must be set as environment variables."
        )
    return create_client(url, key)
