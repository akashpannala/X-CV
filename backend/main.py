"""FastAPI backend — PPE Compliance API."""

import base64
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.auth import get_current_user, router as auth_router
from backend.db import insert, select, update, delete as db_delete
from backend.detector import annotate, detect
from backend.camera_manager import get_frame, start_camera, stop_camera, is_active, stop_all

app = FastAPI(title="PPE Compliance API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


class DetectionCreate(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: list[float]
    is_violation: bool


class EventCreate(BaseModel):
    event_type: str
    snapshot: str | None = None
    camera_id: str | None = None
    camera_name: str | None = None
    detections: list[DetectionCreate] = []


class CameraCreate(BaseModel):
    name: str
    url: str


class CameraUpdate(BaseModel):
    name: str | None = None
    url: str | None = None


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
    file: UploadFile = File(None),
    camera_id: str = Query(None),
    user=Depends(get_current_user),
):
    if file:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    elif camera_id:
        frame = get_frame(camera_id)
        if frame is None:
            raise HTTPException(400, "Camera not active or no frame available")
    else:
        raise HTTPException(400, "Provide either a file or camera_id")

    settings = _get_user_settings(user.id)
    vids = settings.get("violation_class_ids")
    violation_ids = set(vids) if vids else None

    result = detect(frame, violation_ids)
    annotated = annotate(frame, result["detections"])

    _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buffer).decode()

    resp = {**result, "annotated_image": annotated_b64}
    if camera_id:
        cam = select("cameras", {"id": f"eq.{camera_id}", "limit": "1"})
        resp["camera_id"] = camera_id
        resp["camera_name"] = cam[0]["name"] if cam else None
    return resp


@app.post("/events")
def create_event(body: EventCreate, user=Depends(get_current_user)):
    try:
        event_row = {
            "user_id": user.id,
            "event_type": body.event_type,
            "snapshot": body.snapshot,
            "camera_id": body.camera_id,
            "camera_name": body.camera_name,
        }
        ev = insert("detection_events", event_row)
        if not ev:
            raise HTTPException(500, "Failed to create event")
        event = ev[0]
        event_id = event["id"]

        for det in body.detections:
            x1, y1, x2, y2 = det.bbox
            insert("detections", {
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

        settings = _get_user_settings(user.id)
        alert_violation = settings.get("alert_on_violation", True)
        alert_fall = settings.get("alert_on_fall", True)

        if body.event_type == "fall" and alert_fall:
            insert("alerts", {
                "user_id": user.id,
                "event_id": event_id,
                "alert_type": "fall",
                "message": "Fall detected",
            })
        elif body.event_type == "violation" and alert_violation:
            insert("alerts", {
                "user_id": user.id,
                "event_id": event_id,
                "alert_type": "violation",
                "message": "PPE violation detected",
            })

        return event
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/events")
def list_events(
    limit: int = 100,
    event_type: str | None = None,
    date_start: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    date_end: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    user=Depends(get_current_user),
):
    params = {"user_id": f"eq.{user.id}", "order": "detected_at.desc", "limit": str(limit)}
    if event_type and event_type != "All":
        params["event_type"] = f"eq.{event_type}"
    if date_start:
        params["detected_at"] = f"gte.{date_start}"
    if date_end:
        end_dt = datetime.fromisoformat(date_end) + timedelta(days=1)
        params["detected_at"] = f"lt.{end_dt.date().isoformat()}"
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
                for d in event_dets:
                    conf = float(d.get("confidence", 0))
                    if conf > confidence:
                        confidence = conf
                    if d.get("is_violation", False):
                        label = d["class_name"]
                        break
                else:
                    for d in event_dets:
                        if d.get("class_id") == 0:
                            label = "Fall-Detected"
                            break
                    else:
                        label = event_dets[0]["class_name"]
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
def list_detections(limit: int = 50, user=Depends(get_current_user)):
    dets = select("detections", {"order": "id.desc", "limit": str(limit)}) or []
    event_ids = list({d["event_id"] for d in dets})
    if not event_ids:
        return []

    events = {}
    for eid in event_ids:
        ev = select("detection_events", {"id": f"eq.{eid}", "user_id": f"eq.{user.id}"})
        if ev:
            events[eid] = ev[0]

    result = []
    for d in dets:
        ev = events.get(d["event_id"])
        if ev:
            result.append({**d, "snapshot": ev.get("snapshot"), "event_type": ev["event_type"]})
    return result[:limit]


@app.get("/stats")
def get_stats(user=Depends(get_current_user)):
    events = select("detection_events", {"user_id": f"eq.{user.id}", "limit": "1000"}) or []
    total = len(events)
    counts = Counter(e["event_type"] for e in events)
    today = datetime.now().strftime("%Y-%m-%d")
    today_events = [e for e in events if e.get("detected_at", "").startswith(today)]
    today_counts = Counter(e["event_type"] for e in today_events)

    unresolved = 0
    for e in today_events:
        if e["event_type"] in ("violation", "fall"):
            alerts_data = select("alerts", {"event_id": f"eq.{e['id']}", "limit": "1"})
            if alerts_data and not alerts_data[0].get("acknowledged", False):
                unresolved += 1

    return {
        "total": total,
        "compliant": counts.get("compliant", 0),
        "violation": counts.get("violation", 0),
        "fall": counts.get("fall", 0),
        "today": len(today_events),
        "unresolved_today": unresolved,
    }


@app.get("/alerts")
def list_alerts(limit: int = 50, user=Depends(get_current_user)):
    return select("alerts", {"user_id": f"eq.{user.id}", "order": "created_at.desc", "limit": str(limit)}) or []


@app.patch("/alerts/{alert_id}/ack")
def ack_alert(alert_id: str, user=Depends(get_current_user)):
    try:
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


@app.on_event("shutdown")
def shutdown():
    stop_all()
