import uuid

import pytest
from fastapi.testclient import TestClient

from backend.auth import create_access_token
from backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def user_id():
    return str(uuid.uuid4())


@pytest.fixture
def auth_token(user_id):
    return create_access_token({"sub": "zoro", "uid": user_id})


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
def camera_id():
    return str(uuid.uuid4())


@pytest.fixture
def event_id():
    return str(uuid.uuid4())


@pytest.fixture
def site_id():
    return str(uuid.uuid4())


@pytest.fixture
def alert_id():
    return str(uuid.uuid4())
