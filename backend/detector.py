import os

import cv2
import numpy as np
from ultralytics import YOLO

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "best.pt")

CLASS_NAMES = {
    0: "Fall-Detected",
    1: "Gloves",
    2: "Goggles",
    3: "Hardhat",
    4: "Ladder",
    5: "Mask",
    6: "NO-Gloves",
    7: "NO-Goggles",
    8: "NO-Hardhat",
    9: "NO-Mask",
    10: "NO-Safety Vest",
    11: "Person",
    12: "Safety Cone",
    13: "Safety Vest",
}

VIOLATION_IDS = {6, 7, 8, 9, 10}

_model = None


def _get_model():
    global _model
    if _model is None:
        if os.path.exists(MODEL_PATH):
            _model = YOLO(MODEL_PATH)
        else:
            fallback_path = os.path.join(os.path.dirname(__file__), "..", "models", "last.pt")
            _model = YOLO(fallback_path)
    return _model


def detect(frame: np.ndarray, violation_ids: set | None = None) -> dict:
    model = _get_model()
    violation_ids = violation_ids or VIOLATION_IDS
    results = model(frame, verbose=False)[0]
    detections = []
    has_fall = False
    has_violation = False

    for box in results.boxes:
        cls_id = int(box.cls[0])
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        conf = float(box.conf[0])
        is_violation = cls_id in violation_ids

        if cls_id == 0:
            has_fall = True
        elif is_violation:
            has_violation = True

        detections.append({
            "class_id": cls_id,
            "class_name": CLASS_NAMES.get(cls_id, "Unknown"),
            "confidence": round(conf, 3),
            "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
            "is_violation": is_violation,
        })

    if has_fall:
        event_type = "fall"
    elif has_violation:
        event_type = "violation"
    else:
        event_type = "compliant"

    return {"detections": detections, "event_type": event_type}


def annotate(frame: np.ndarray, detections: list) -> np.ndarray:
    annotated = frame.copy()
    for d in detections:
        x1, y1, x2, y2 = map(int, d["bbox"])
        is_violation = d.get("is_violation", False)
        color = (0, 0, 255) if is_violation else (0, 255, 0)
        label = f"{d['class_name']} {d['confidence']:.2f}"
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(annotated, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        cv2.putText(
            annotated, label, (x1 + 2, y1 - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1,
        )
    return annotated
