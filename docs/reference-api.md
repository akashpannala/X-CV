# API and configuration reference

Austere technical description. No guidance, no opinion.

## Auth

All endpoints except `GET /health` and `POST /auth/login` require
`Authorization: Bearer <JWT>`. Tokens are HS256 JWTs (`sub`, `uid`, `exp`).

- `POST /auth/login` `{username, password}` → `{access_token, token_type, username}`
- `GET /auth/me` → `{id, username, created_at}`

## Endpoints

- `GET /health` → `{status: "ok"}`
- `POST /detect` — multipart `file` **or** `?camera_id=` (started server stream) → `{detections[], event_type, annotated_image? (base64), camera_id?, camera_name?}`
- `POST /events` `{event_type, snapshot?, camera_id?, camera_name?, detections[]}` → event row
- `GET /events?limit=&event_type=&date_start=&date_end=` → events with derived `label`, `confidence`
- `GET /events/{id}` → event + `detections[]`
- `GET /stats` → `{total, compliant, violation, fall, today, unresolved_today}`
- `GET /alerts?limit=` → alerts, newest first
- `PATCH /alerts/{id}/ack` → acknowledged alert
- `GET /cameras`, `POST /cameras` `{name, url}`, `PUT /cameras/{id}`, `DELETE /cameras/{id}`
- `POST /cameras/{id}/start`, `POST /cameras/{id}/stop`, `GET /cameras/active`
- `GET /settings`, `PATCH /settings` `{violation_class_ids?, alert_on_violation?, alert_on_fall?}`

## Detection classes

`0` Fall-Detected · `1` Gloves · `2` Goggles · `3` Hardhat · `4` Ladder ·
`5` Mask · `6` NO-Gloves · `7` NO-Goggles · `8` NO-Hardhat · `9` NO-Mask ·
`10` NO-Safety Vest · `11` Person · `12` Safety Cone · `13` Safety Vest.
Default violation IDs: `{6,7,8,9,10}`. Event priority: fall > violation >
compliant.

## Environment

Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`,
`JWT_SECRET`. Defaults: `JWT_ALGORITHM=HS256`, `JWT_EXPIRE_MINUTES=60`,
`MODEL_REPO_ID=akashpannala/ppe-compliance-yolov8`,
`MODEL_REVISION=1a978d5`, `HF_TOKEN=` (empty; public repo).
Template: `backend/.env.exp`. Runtime `backend/.env` is gitignored;
on AWS the same names live in SSM `/ppe/*`.

## Repository map

- `backend/` — `main.py` (routes), `auth.py` (JWT), `db.py` (pooled
  Supabase client), `detector.py` (YOLO + HF weights), `camera_manager.py`
  (threaded RTSP/file streams), `config.py` (settings), `test/` (pytest)
- `frontend/` — `index.html` (dashboard), `logs/history/reports/settings/
  login.html`, `js/` (`supabase-db.js` API layer, `dashboard.js` capture
  loops, `table.js` shared table helpers, `logs/history/reports/settings/
  auth-guard.js` pages)
- `infra/` — `ppe.yaml` (CloudFormation network), `deploy.sh`
  (`up|status|stop|start`), `ecr-push.sh` (optional image path)
- `models/` — local dev bake only, untracked (`*.pt` gitignored)
- `training/results_summary.md` — mAP50 0.784, per-class metrics
- Root — `Dockerfile` (prod image, uid 10001, no dev deps), `run.sh`
  (local dev), `user-data.sh` (EC2 bootstrap), `requirements.txt` (prod),
  `requirements-dev.txt` (pytest), `DBXSCHEMA.sql` (schema)
