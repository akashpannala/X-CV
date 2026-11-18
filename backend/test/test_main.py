from backend.auth import hash_password
from backend.config import settings

BASE = f"{settings.supabase_url}/rest/v1"


class TestHealth:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestAuthMe:
    def test_auth_me(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/users?id=eq.{user_id}&limit=1",
            json=[{"id": user_id, "username": "zoro", "created_at": "2026-01-01T00:00:00Z"}],
        )
        resp = client.get("/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "zoro"
        assert data["id"] == user_id

    def test_auth_me_no_token(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401


class TestCameras:
    def test_list_cameras(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/cameras?user_id=eq.{user_id}&order=created_at.desc",
            json=[{"id": "c1", "name": "Laptop Camera", "site_id": None}],
        )
        resp = client.get("/cameras", headers=auth_headers)
        assert resp.status_code == 200

    def test_create_camera(self, client, auth_headers, httpx_mock):
        httpx_mock.add_response(
            method="POST",
            url=f"{BASE}/cameras",
            json=[{"id": "c1", "name": "Laptop", "url": "http://cam/video"}],
        )
        resp = client.post(
            "/cameras",
            headers=auth_headers,
            json={"name": "Laptop", "url": "http://cam/video"},
        )
        assert resp.status_code == 200
        assert resp.json()["url"] == "http://cam/video"

    def test_stop_camera_owned(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/cameras?id=eq.c1&user_id=eq.{user_id}",
            json=[{"id": "c1", "name": "Laptop", "url": "http://cam/video"}],
        )
        resp = client.post("/cameras/c1/stop", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_stop_camera_not_owned(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/cameras?id=eq.c1&user_id=eq.{user_id}",
            json=[],
        )
        resp = client.post("/cameras/c1/stop", headers=auth_headers)
        assert resp.status_code == 404

    def test_delete_camera(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/cameras?id=eq.c1&user_id=eq.{user_id}",
            json=[{"id": "c1", "name": "Laptop", "url": "http://cam/video"}],
        )
        httpx_mock.add_response(
            method="PATCH",
            url=f"{BASE}/detection_events?camera_id=eq.c1",
            status_code=204,
        )
        httpx_mock.add_response(
            method="DELETE",
            url=f"{BASE}/cameras?id=eq.c1",
            status_code=204,
        )
        resp = client.delete("/cameras/c1", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


class TestEvents:
    def test_create_event_no_detections(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/cameras?id=eq.c1&user_id=eq.{user_id}&limit=1",
            json=[{"id": "c1", "name": "Gate Camera", "url": "http://cam/video"}],
        )
        httpx_mock.add_response(
            method="POST",
            url=f"{BASE}/detection_events",
            json=[{"id": "ev1", "event_type": "violation", "camera_name": "Gate Camera"}],
        )
        httpx_mock.add_response(
            url=f"{BASE}/user_settings?user_id=eq.{user_id}&limit=1",
            json=[{"alert_on_violation": True, "alert_on_fall": True, "violation_class_ids": [0, 6, 7, 8, 9, 10]}],
        )
        httpx_mock.add_response(
            method="POST",
            url=f"{BASE}/alerts",
            json=[{"id": "al1"}],
        )
        resp = client.post(
            "/events",
            headers=auth_headers,
            json={"event_type": "violation", "camera_id": "c1", "detections": []},
        )
        assert resp.status_code == 200
        assert resp.json()["camera_name"] == "Gate Camera"

    def test_create_event_with_detections(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            method="POST",
            url=f"{BASE}/detection_events",
            json=[{"id": "ev1", "event_type": "violation"}],
        )
        httpx_mock.add_response(
            method="POST",
            url=f"{BASE}/detections",
            json=[{"id": "d1"}],
        )
        httpx_mock.add_response(
            url=f"{BASE}/user_settings?user_id=eq.{user_id}&limit=1",
            json=[{"alert_on_violation": True, "alert_on_fall": True}],
        )
        httpx_mock.add_response(
            method="POST",
            url=f"{BASE}/alerts",
            json=[{"id": "al1"}],
        )
        resp = client.post(
            "/events",
            headers=auth_headers,
            json={
                "event_type": "violation",
                "detections": [{
                    "class_id": 8,
                    "class_name": "NO-Hardhat",
                    "confidence": 0.9,
                    "bbox": [1, 2, 3, 4],
                    "is_violation": True,
                }],
            },
        )
        assert resp.status_code == 200

    def test_create_event_rejects_invalid_bbox(self, client, auth_headers):
        resp = client.post(
            "/events",
            headers=auth_headers,
            json={
                "event_type": "violation",
                "detections": [{
                    "class_id": 8,
                    "class_name": "NO-Hardhat",
                    "confidence": 0.9,
                    "bbox": [1, 2, 3],
                    "is_violation": True,
                }],
            },
        )
        assert resp.status_code == 422

    def test_create_event_rejects_unknown_camera(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/cameras?id=eq.c1&user_id=eq.{user_id}&limit=1",
            json=[],
        )
        resp = client.post(
            "/events",
            headers=auth_headers,
            json={"event_type": "violation", "camera_id": "c1", "detections": []},
        )
        assert resp.status_code == 400

    def test_create_event_rejects_invalid_type(self, client, auth_headers):
        resp = client.post(
            "/events",
            headers=auth_headers,
            json={"event_type": "bogus", "detections": []},
        )
        assert resp.status_code == 422

    def test_list_events(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/detection_events?user_id=eq.{user_id}&order=detected_at.desc&limit=100",
            json=[{"id": "ev1", "event_type": "violation"}],
        )
        httpx_mock.add_response(
            url=f"{BASE}/detections?event_id=in.%28ev1%29",
            json=[{"id": "d1", "event_id": "ev1", "class_name": "NO-Hardhat", "class_id": 8, "confidence": 0.9, "is_violation": True}],
        )
        resp = client.get("/events", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()[0]["label"] == "NO-Hardhat"

    def test_list_events_combines_date_range(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=(
                f"{BASE}/detection_events?user_id=eq.{user_id}"
                "&order=detected_at.desc&limit=100"
                "&and=%28detected_at.gte.2026-01-01%2Cdetected_at.lt.2026-01-03%29"
            ),
            json=[],
        )
        resp = client.get(
            "/events?date_start=2026-01-01&date_end=2026-01-02",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_event_with_detections(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/detection_events?id=eq.ev1&user_id=eq.{user_id}",
            json=[{"id": "ev1", "event_type": "violation"}],
        )
        httpx_mock.add_response(
            url=f"{BASE}/detections?event_id=eq.ev1",
            json=[{"id": "d1", "class_name": "NO-Hardhat"}],
        )
        resp = client.get("/events/ev1", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "ev1"
        assert len(data["detections"]) == 1


class TestAlerts:
    def test_list_alerts(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/alerts?user_id=eq.{user_id}&order=created_at.desc&limit=50",
            json=[{"id": "al1", "acknowledged": False}],
        )
        resp = client.get("/alerts", headers=auth_headers)
        assert resp.status_code == 200

    def test_ack_alert(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/alerts?id=eq.al1&user_id=eq.{user_id}",
            json=[{"id": "al1", "user_id": user_id, "acknowledged": False}],
        )
        httpx_mock.add_response(
            method="PATCH",
            url=f"{BASE}/alerts?id=eq.al1",
            json=[{"id": "al1", "acknowledged": True}],
        )
        resp = client.patch("/alerts/al1/ack", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["acknowledged"] is True

    def test_ack_alert_not_owned(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/alerts?id=eq.al1&user_id=eq.{user_id}",
            json=[],
        )
        resp = client.patch("/alerts/al1/ack", headers=auth_headers)
        assert resp.status_code == 404


class TestSettings:
    def test_get_settings_auto_creates(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/user_settings?user_id=eq.{user_id}&limit=1",
            json=[],
        )
        httpx_mock.add_response(
            method="POST",
            url=f"{BASE}/user_settings",
            json=[{"user_id": user_id, "violation_class_ids": [0, 6, 7, 8, 9, 10]}],
        )
        httpx_mock.add_response(
            url=f"{BASE}/user_settings?user_id=eq.{user_id}&limit=1",
            json=[{"user_id": user_id, "violation_class_ids": [0, 6, 7, 8, 9, 10], "alert_on_violation": True, "alert_on_fall": True}],
        )
        resp = client.get("/settings", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "violation_class_ids" in data

    def test_update_settings(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/user_settings?user_id=eq.{user_id}&limit=1",
            json=[{"user_id": user_id}],
        )
        httpx_mock.add_response(
            method="PATCH",
            url=f"{BASE}/user_settings?user_id=eq.{user_id}",
            json=[{"violation_class_ids": [0, 6]}],
        )
        resp = client.patch("/settings", headers=auth_headers, json={"violation_class_ids": [0, 6]})
        assert resp.status_code == 200


class TestStats:
    def test_stats(self, client, auth_headers, user_id, httpx_mock):
        httpx_mock.add_response(
            url=f"{BASE}/detection_events?user_id=eq.{user_id}&order=detected_at.desc&limit=1000",
            json=[
                {"event_type": "compliant", "detected_at": "2026-07-06T00:00:00Z"},
                {"event_type": "violation", "detected_at": "2026-07-06T01:00:00Z"},
                {"event_type": "fall", "detected_at": "2026-07-06T02:00:00Z"},
            ],
        )
        resp = client.get("/stats", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert data["compliant"] == 1
        assert data["violation"] == 1
        assert data["fall"] == 1
