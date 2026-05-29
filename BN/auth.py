"""Authentication helpers: password hashing + FastAPI dependencies.

Auth model is intentionally lightweight:

* Passwords are stored as bcrypt hashes in `users.password_hash`.
* On login we generate a random `session_token` (UUID4) and store it on
  the user row. The frontend sends it back as `Authorization: Bearer <token>`.
* Logout clears the token. There is exactly one active session per user.
"""
from __future__ import annotations

import secrets
from typing import Optional

import bcrypt
from fastapi import Depends, Header, HTTPException, status

from database import get_supabase


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def _strip_bearer(value: str) -> str:
    parts = value.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return value.strip()


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """Resolve the calling user from the `Authorization: Bearer <token>` header."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    token = _strip_bearer(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    sb = get_supabase()
    res = sb.table("users").select("*").eq("session_token", token).limit(1).execute()
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )
    return res.data[0]


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user


def public_user(row: dict) -> dict:
    """Strip sensitive columns before returning a user to the client."""
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row.get("full_name"),
        "role": row.get("role", "user"),
        "created_at": row.get("created_at"),
    }
