"""FastAPI backend — PPE Compliance API."""

import base64
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.auth import get_current_user, router as auth_router
from backend.db import insert, select, update, delete as db_delete
from backend.detector import annotate, detect
from backend.camera_manager import get_frame, start_camera, stop_camera, is_active, stop_all


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    stop_all()


app = FastAPI(title="PPE Compliance API", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


class DetectionCreate(BaseModel):
    class_id: int = Field(ge=0)
    class_name: str
    confidence: float = Field(ge=0, le=1)
    bbox: list[float] = Field(min_length=4, max_length=4)
    is_violation: bool


class EventCreate(BaseModel):
    event_type: Literal["compliant", "violation", "fall"]
    snapshot: str | None = None
    camera_id: str | None = None
    camera_name: str | None = None
    detections: list[DetectionCreate] = []


class CameraCreate(BaseModel):
    name: str = Field(min_length=1)
    url: str = Field(min_length=1)


class CameraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    url: str | None = Field(default=None, min_length=1)


class SettingsUpdate(BaseModel):
    violation_class_ids: list[int] | None = None
    alert_on_violation: bool | None = None
    alert_on_fall: bool | None = None


def _get_user_settings(user_id: str) -> dict:
    rows = select("user_settings", {"user_id": f"eq.{user_id}", "limit": "1"})
    return rows[0] if rows else {}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/auth/me")
def auth_me(user=Depends(get_current_user)):
    rows = select("users", {"id": f"eq.{user.id}", "limit": "1"})
    if not rows:
        raise HTTPException(404, "User not found")
    u = rows[0]
    return {"id": u["id"], "username": u["username"], "created_at": u["created_at"]}


@app.post("/detect")
async def detect_endpoint(
    file: UploadFile | None = File(None),
    camera_id: str | None = Query(None),
    user=Depends(get_current_user),
):
    camera_name = None
    if file:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(400, "Invalid image file")
    elif camera_id:
        cam = select("cameras", {"id": f"eq.{camera_id}", "user_id": f"eq.{user.id}", "limit": "1"})
        if not cam:
            raise HTTPException(404, "Camera not found")
        camera_name = cam[0]["name"]
        frame = get_frame(camera_id)
        if frame is None:
            raise HTTPException(400, "Camera not active or no frame available")
    else:
        raise HTTPException(400, "Provide either a file or camera_id")

    settings = _get_user_settings(user.id)
    vids = settings.get("violation_class_ids")
    violation_ids = set(vids) if vids else None

    result = await run_in_threadpool(detect, frame, violation_ids)
    annotated = await run_in_threadpool(annotate, frame, result["detections"])

    _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buffer).decode()

    resp = {**result, "annotated_image": annotated_b64}
    if camera_id:
        resp["camera_id"] = camera_id
        resp["camera_name"] = camera_name
    return resp


@app.post("/events")
def create_event(body: EventCreate, user=Depends(get_current_user)):
    try:
        camera_name = body.camera_name
        if body.camera_id:
            cam = select("cameras", {"id": f"eq.{body.camera_id}", "user_id": f"eq.{user.id}", "limit": "1"})
            if not cam:
                raise HTTPException(400, "Camera not found")
            camera_name = cam[0]["name"]

        event_row = {
            "user_id": user.id,
            "event_type": body.event_type,
            "snapshot": body.snapshot,
            "camera_id": body.camera_id,
            "camera_name": camera_name,
        }
        ev = insert("detection_events", event_row)
        if not ev:
            raise HTTPException(500, "Failed to create event")
        event = ev[0]
        event_id = event["id"]

        if body.detections:
            detection_rows = []
            for det in body.detections:
                x1, y1, x2, y2 = det.bbox
                detection_rows.append({
                    "event_id": event_id,
                    "class_id": det.class_id,
                    "class_name": det.class_name,
                    "confidence": det.confidence,
                    "bbox_x1": x1,
                    "bbox_y1": y1,
                    "bbox_x2": x2,
                    "bbox_y2": y2,
                    "is_violation": det.is_violation,
                })
            insert("detections", detection_rows, returning=False)

        settings = _get_user_settings(user.id)
        alert_violation = settings.get("alert_on_violation", True)
        alert_fall = settings.get("alert_on_fall", True)

        if body.event_type == "fall" and alert_fall:
            insert("alerts", {
                "user_id": user.id,
                "event_id": event_id,
                "alert_type": "fall",
                "message": "Fall detected",
            }, returning=False)
        elif body.event_type == "violation" and alert_violation:
            insert("alerts", {
                "user_id": user.id,
                "event_id": event_id,
                "alert_type": "violation",
                "message": "PPE violation detected",
            }, returning=False)

        return event
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/events")
def list_events(
    limit: int = Query(100, ge=1, le=1000),
    event_type: Literal["compliant", "violation", "fall"] | None = None,
    date_start: date | None = Query(None, description="ISO date YYYY-MM-DD"),
    date_end: date | None = Query(None, description="ISO date YYYY-MM-DD"),
    user=Depends(get_current_user),
):
    params = {"user_id": f"eq.{user.id}", "order": "detected_at.desc", "limit": str(limit)}
    if event_type:
        params["event_type"] = f"eq.{event_type}"

    date_filters = []
    if date_start:
        date_filters.append(f"detected_at.gte.{date_start.isoformat()}")
    if date_end:
        date_filters.append(f"detected_at.lt.{(date_end + timedelta(days=1)).isoformat()}")
    if date_filters:
        params["and"] = f"({','.join(date_filters)})"

    events = select("detection_events", params) or []
    if events:
        event_ids = [e["id"] for e in events]
        ids_param = ",".join(event_ids)
        all_dets = select("detections", {"event_id": f"in.({ids_param})"}) or []
        for e in events:
            eid = e["id"]
            event_dets = [d for d in all_dets if d["event_id"] == eid]
            label = e["event_type"]
            confidence = 0.0
            if event_dets:
                confidence = max(float(d.get("confidence", 0)) for d in event_dets)
                violation = next((d for d in event_dets if d.get("is_violation", False)), None)
                if violation:
                    label = violation["class_name"]
                else:
                    fall = next((d for d in event_dets if d.get("class_id") == 0), None)
                    label = fall["class_name"] if fall else event_dets[0]["class_name"]
            e["label"] = label
            e["confidence"] = round(confidence, 3)
    return events


@app.get("/events/{event_id}")
def get_event(event_id: str, user=Depends(get_current_user)):
    r = select("detection_events", {"id": f"eq.{event_id}", "user_id": f"eq.{user.id}"})
    if not r:
        raise HTTPException(404, "Event not found")
    event = r[0]
    event["detections"] = select("detections", {"event_id": f"eq.{event_id}"}) or []
    return event


@app.get("/detections")
def list_detections(limit: int = Query(50, ge=1, le=1000), user=Depends(get_current_user)):
    dets = select("detections", {"order": "id.desc", "limit": str(limit)}) or []
    event_ids = list({d["event_id"] for d in dets})
    if not event_ids:
        return []

    events_rows = select("detection_events", {
        "id": f"in.({','.join(event_ids)})",
        "user_id": f"eq.{user.id}",
    }) or []
    events = {ev["id"]: ev for ev in events_rows}

    result = []
    for d in dets:
        ev = events.get(d["event_id"])
        if ev:
            result.append({**d, "snapshot": ev.get("snapshot"), "event_type": ev["event_type"]})
    return result[:limit]


@app.get("/stats")
def get_stats(user=Depends(get_current_user)):
    events = select(
        "detection_events",
        {"user_id": f"eq.{user.id}", "order": "detected_at.desc", "limit": "1000"},
    ) or []
    total = len(events)
    counts = Counter(e["event_type"] for e in events)
    today = datetime.now().strftime("%Y-%m-%d")
    today_events = [e for e in events if e.get("detected_at", "").startswith(today)]
    today_incident_ids = {
        e["id"] for e in today_events if e["event_type"] in ("violation", "fall")
    }

    unresolved = 0
    if today_incident_ids:
        alerts = select("alerts", {
            "user_id": f"eq.{user.id}",
            "acknowledged": "eq.false",
            "limit": "1000",
        }) or []
        unresolved = len({a["event_id"] for a in alerts if a.get("event_id") in today_incident_ids})

    return {
        "total": total,
        "compliant": counts.get("compliant", 0),
        "violation": counts.get("violation", 0),
        "fall": counts.get("fall", 0),
        "today": len(today_events),
        "unresolved_today": unresolved,
    }


@app.get("/alerts")
def list_alerts(
    limit: int = Query(50, ge=1, le=1000),
    event_id: str | None = None,
    user=Depends(get_current_user),
):
    params = {"user_id": f"eq.{user.id}", "order": "created_at.desc", "limit": str(limit)}
    if event_id:
        params["event_id"] = f"eq.{event_id}"
    return select("alerts", params) or []


@app.patch("/alerts/{alert_id}/ack")
def ack_alert(alert_id: str, user=Depends(get_current_user)):
    try:
        existing = select("alerts", {"id": f"eq.{alert_id}", "user_id": f"eq.{user.id}"})
        if not existing:
            raise HTTPException(404, "Alert not found")
        r = update("alerts", {"acknowledged": True}, "id", alert_id)
        if not r:
            raise HTTPException(404, "Alert not found")
        return r[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/cameras")
def list_cameras(user=Depends(get_current_user)):
    return select("cameras", {"user_id": f"eq.{user.id}", "order": "created_at.desc"}) or []


@app.post("/cameras")
def create_camera(body: CameraCreate, user=Depends(get_current_user)):
    row = {"user_id": user.id, "name": body.name, "url": body.url}
    r = insert("cameras", row)
    if not r:
        raise HTTPException(500, "Failed to create camera")
    return r[0]


@app.put("/cameras/{camera_id}")
def update_camera(camera_id: str, body: CameraUpdate, user=Depends(get_current_user)):
    existing = select("cameras", {"id": f"eq.{camera_id}", "user_id": f"eq.{user.id}"})
    if not existing:
        raise HTTPException(404, "Camera not found")
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "No fields to update")
    stop_camera(camera_id)
    r = update("cameras", data, "id", camera_id)
    return r[0] if r else None


@app.delete("/cameras/{camera_id}")
def delete_camera(camera_id: str, user=Depends(get_current_user)):
    existing = select("cameras", {"id": f"eq.{camera_id}", "user_id": f"eq.{user.id}"})
    if not existing:
        raise HTTPException(404, "Camera not found")
    stop_camera(camera_id)
    update("detection_events", {"camera_id": None}, "camera_id", camera_id, returning=False)
    db_delete("cameras", "id", camera_id)
    return {"ok": True}


@app.post("/cameras/{camera_id}/start")
def start_camera_stream(camera_id: str, user=Depends(get_current_user)):
    cam = select("cameras", {"id": f"eq.{camera_id}", "user_id": f"eq.{user.id}"})
    if not cam:
        raise HTTPException(404, "Camera not found")
    try:
        start_camera(camera_id, cam[0]["url"])
        return {"ok": True, "camera_id": camera_id}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cameras/{camera_id}/stop")
def stop_camera_stream(camera_id: str, user=Depends(get_current_user)):
    cam = select("cameras", {"id": f"eq.{camera_id}", "user_id": f"eq.{user.id}"})
    if not cam:
        raise HTTPException(404, "Camera not found")
    stop_camera(camera_id)
    return {"ok": True}


@app.get("/cameras/active")
def active_cameras(user=Depends(get_current_user)):
    all_cams = select("cameras", {"user_id": f"eq.{user.id}"}) or []
    return [{"id": c["id"], "name": c["name"], "url": c["url"], "active": is_active(c["id"])} for c in all_cams]


@app.get("/settings")
def get_settings(user=Depends(get_current_user)):
    s = _get_user_settings(user.id)
    if not s:
        insert("user_settings", {"user_id": user.id})
        s = _get_user_settings(user.id)
    return {
        "violation_class_ids": s.get("violation_class_ids", [6, 7, 8, 9, 10]),
        "alert_on_violation": s.get("alert_on_violation", True),
        "alert_on_fall": s.get("alert_on_fall", True),
    }


@app.patch("/settings")
def update_settings(body: SettingsUpdate, user=Depends(get_current_user)):
    existing = _get_user_settings(user.id)
    if not existing:
        insert("user_settings", {"user_id": user.id})

    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "No fields to update")
    try:
        r = update("user_settings", data, "user_id", user.id)
        return r[0] if r else None
    except Exception as e:
        raise HTTPException(400, str(e))


FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
