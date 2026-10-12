import httpx
from backend.config import settings

BASE_URL = f"{settings.supabase_url.rstrip('/')}/rest/v1"

HEADERS = {
    "apikey": settings.supabase_service_key,
    "Authorization": f"Bearer {settings.supabase_service_key}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

# ponytail: one pooled client — per-call httpx.get/post opens a fresh connection
# (TLS handshake + socket churn per Supabase round-trip on cloud).
_client = httpx.Client(
    headers=HEADERS,
    timeout=15,
    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
)


def _handle_response(response: httpx.Response):
    if response.status_code >= 400:
        raise Exception(f"Supabase Error [{response.status_code}]: {response.text}")
    if response.text:
        return response.json()
    return []


def select(table: str, params: dict | None = None):
    return _handle_response(_client.get(f"{BASE_URL}/{table}", params=params or {}))


def insert(table: str, data: dict):
    return _handle_response(_client.post(
        f"{BASE_URL}/{table}",
        headers={"Prefer": "return=representation"},
        json=data,
    ))


def update(table: str, data: dict, field: str, value):
    return _handle_response(_client.patch(
        f"{BASE_URL}/{table}",
        headers={"Prefer": "return=representation"},
        params={field: f"eq.{value}"},
        json=data,
    ))


def delete(table: str, field: str, value):
    return _handle_response(_client.delete(
        f"{BASE_URL}/{table}",
        params={field: f"eq.{value}"},
    ))
