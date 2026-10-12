# About the X-CV architecture

An explanation of how the PPE Compliance Detection System fits together and
*why* it is shaped this way. This document develops understanding; for
instructions see the tutorials and how-to guides, for facts see the reference
(`DBXSCHEMA.sql`, Swagger UI at `/docs`, the env table in `README.md`).

## About the detection pipeline

A frame enters through one of four camera paths, is POSTed to
`POST /detect`, and returns with an `event_type` plus an annotated JPEG.
The browser then stores the event with `POST /events`, which writes one
`detection_events` row, N `detections` rows, and — for violations and falls —
one `alerts` row. The dashboard reads everything back through `GET /events`,
`/stats`, and `/alerts`.

Event priority is deliberately total-ordered in `detect()`: any `Fall-Detected`
(class 0) beats any violation (classes 6–10), which beats everything else.
A mixed frame — say, a helmet (compliant) plus a missing vest (violation) —
is therefore always a `violation`, never ambiguous. Which class IDs count as
violations is per-user configuration (`user_settings.violation_class_ids`,
default `{6,7,8,9,10}`), not hardcoded dogma.

Snapshots are stored as base64 JPEG inside `detection_events.snapshot`.
This is a conscious MVP trade: zero extra infrastructure (no object store,
no signed URLs, no lifecycle rules) at ~100–200KB per row. Its ceiling is
equally conscious — at high camera counts the reporting queries that pull
hundreds of snapshots get heavy, and that is the day to migrate snapshots
to S3. At the current scale (about a request a day) the column is the
right call.

## About the four camera paths

The paths exist because the server and the browser each see a different
network:

- **Browser webcam** (`getUserMedia`) and **screen share**
  (`getDisplayMedia`) never leave the browser as streams — frames are
  uploaded with `POST /detect`. They work from anywhere, including behind
  NAT, and need only HTTPS (browsers gate camera APIs on secure contexts).
- **Settings cameras** are dialled *by the server* (`cv2.VideoCapture` in
  `camera_manager.py`). This is the only path that can play RTSP, and it
  works for anything the server can route to: public URLs from anywhere,
  LAN URLs only when the server shares the LAN.
- **Relay** is the browser dialling a LAN URL the server cannot reach
  (typically `http://192.168.x:8080/video` while the backend runs on AWS).
  It reuses the file-upload path, so the server never dials anything.

Two platform facts shape the relay: an `https://` dashboard fetching an
`http://` camera is mixed content (needs a one-time *Insecure content →
Allow*), and a canvas drawn from a cross-origin image without CORS headers
is tainted and unreadable — which is why a screen share is kept as the
universal fallback. RTSP can never run in a browser, so it stays
server-side by necessity, not preference.

## About server-first with relay fallback

The dashboard does not ask the user to pick a network topology. Every
settings camera connects server-first; only start-failure (or three
consecutive detect failures, covering mid-session drops) on an `http(s)`
URL engages the browser relay, with events labelled `Name (relay)`.

Failure signals were chosen over a dedicated probe endpoint because the
signals already existed — a failed `POST /cameras/:id/start` and failing
`/detect?camera_id=` polls are the ground truth, and a probe would be a
second thing to keep consistent. Events keep the real `camera_id` under
fallback (the UUID foreign key stays valid) while `camera_name` carries
the suffix, so the Violation Log stays honest about which path served
each event. An earlier bug that sent virtual source IDs (`__relay`) into
the UUID column — silently dropped rows, invisible because the response
status went unchecked — is why `storeDetectionEvent` now nulls virtual
IDs and logs non-OK responses.

## About model hosting

The YOLOv8s weights (`best.pt` 65MB, fallback `last.pt` 22MB) live on
Hugging Face (`akashpannala/ppe-compliance-yolov8`, pinned revision),
not in git. Binary weights in git history had already cost ~83MB of
`.git` for zero benefit — every clone paid for bytes only production
needs. The loader prefers a local `models/` bake (offline dev keeps
working), else pulls from the Hub; EC2 prefetches at boot so the first
`/detect` pays no download cost. `last.pt` is a genuine fallback, not
dead weight: if the primary download fails, the detector still starts.

## About the polling design

Frames go up every 1.5s, events are stored under a 30s per-type cooldown,
alerts re-poll every 10s, and ack state syncs across tabs via
`BroadcastChannel` (with a `localStorage` fallback). There are no
websockets anywhere. At this scale that is not a missing feature:
polling is simpler to operate, trivially cacheable, stateless across
restarts, and the latencies (detection <5s requirement) are met with
room to spare. Sockets become interesting around continuous multi-camera
rooms, not before.

State that must survive restarts lives in Supabase; state that must not
(`camera_manager` streams, cooldowns, shown-alert sets) lives in process
memory. That split is why deployment is a single box: in-memory camera
streams cannot span replicas without sticky sessions or a stream registry,
and one box is all this load needs.

## Known limits

- **NO-Safety Vest** underperforms (recall 0.307, mAP50 0.238) from only
  361 training instances — a data-availability issue documented in
  `training/results_summary.md`, not a pipeline defect.
- Small and distant figures are frequently missed (mAP50-95 0.513, model
  trained mostly on close-ups). Wide panoramas soak-test the pipeline;
  they do not prove violation detection.
- HLS and YouTube sources are unsupported (no direct stream for
  `cv2` to open); snapshot JPEG URLs are the workable subset.
- Snapshots-in-DB, single-box operation, and polling all have documented
  ceilings above; each has a named successor (S3, stream registry,
  sockets) for when — not if — load demands it.

## Where to go next

- *Tutorial: your first detection* — clone to first recorded violation
  (to be written).
- *How-to: deploy on AWS free tier* — EC2 + CloudFront + SSM + HF
  (to be written).
- *How-to: cameras* — adding LAN/RTSP/public/file sources, relay
  fallback, extracting stream URLs (to be written).
- Reference: `DBXSCHEMA.sql`, Swagger UI at `/docs`, env table in
  `README.md`, class list in `backend/detector.py`.
