import pytest
from unittest.mock import patch, MagicMock

from backend.db import (
    select,
    insert,
    update,
    delete,
)


# -----------------------------------------
# SELECT
# -----------------------------------------
@patch("backend.db._client")
def test_select_success(mock_client):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '[{"id":1,"name":"Camera 1"}]'
    mock_response.json.return_value = [
        {
            "id": 1,
            "name": "Camera 1"
        }
    ]

    mock_client.get.return_value = mock_response

    result = select("cameras")

    assert result[0]["id"] == 1
    assert result[0]["name"] == "Camera 1"


# -----------------------------------------
# INSERT
# -----------------------------------------
@patch("backend.db._client")
def test_insert_success(mock_client):
    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.text = '[{"id":1}]'
    mock_response.json.return_value = [
        {
            "id": 1
        }
    ]

    mock_client.post.return_value = mock_response

    result = insert(
        "cameras",
        {
            "name": "Gate Camera"
        }
    )

    assert result[0]["id"] == 1


# -----------------------------------------
# UPDATE
# -----------------------------------------
@patch("backend.db._client")
def test_update_success(mock_client):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '[{"name":"Updated Camera"}]'
    mock_response.json.return_value = [
        {
            "name": "Updated Camera"
        }
    ]

    mock_client.patch.return_value = mock_response

    result = update(
        "cameras",
        {
            "name": "Updated Camera"
        },
        "id",
        1
    )

    assert result[0]["name"] == "Updated Camera"


# -----------------------------------------
# DELETE
# -----------------------------------------
@patch("backend.db._client")
def test_delete_success(mock_client):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "[]"
    mock_response.json.return_value = []

    mock_client.delete.return_value = mock_response

    result = delete(
        "cameras",
        "id",
        1
    )

    assert result == []


# -----------------------------------------
# ERROR HANDLING
# -----------------------------------------
@patch("backend.db._client")
def test_select_failure(mock_client):
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"

    mock_client.get.return_value = mock_response

    with pytest.raises(Exception):
        select("cameras")


@patch("backend.db._client")
def test_insert_failure(mock_client):
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.text = "Bad Request"

    mock_client.post.return_value = mock_response

    with pytest.raises(Exception):
        insert("cameras", {})


@patch("backend.db._client")
def test_update_failure(mock_client):
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_response.text = "Not Found"

    mock_client.patch.return_value = mock_response

    with pytest.raises(Exception):
        update("cameras", {}, "id", 1)


@patch("backend.db._client")
def test_delete_failure(mock_client):
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Delete Failed"

    mock_client.delete.return_value = mock_response

    with pytest.raises(Exception):
        delete("cameras", "id", 1)