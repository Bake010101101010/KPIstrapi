
import secrets
from typing import Optional, Dict
from kpi_storage import load_users

SESSIONS: Dict[str, dict] = {}


def authenticate(login: str, password: str) -> Optional[dict]:
    users = load_users()
    for u in users:
        if u["login"] == login and u["password"] == password:
            return {"login": u["login"], "role": u["role"]}
    return None


def create_session(user: dict) -> str:
    token = secrets.token_hex(16)
    SESSIONS[token] = user
    return token


def get_user_by_token(token: str) -> Optional[dict]:
    return SESSIONS.get(token)


def require_auth_from_request(req):
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:].strip()
    if not token:
        return None
    return get_user_by_token(token)
