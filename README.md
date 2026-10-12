#  PPE Compliance Detection System

An AI-powered real-time PPE (Personal Protective Equipment) Compliance Detection System that monitors workers through live CCTV/video feeds using YOLOv8 object detection. The system identifies PPE compliance and violations, detects falls, stores detection events in a Supabase database, and provides a web dashboard for monitoring and reporting.

---

##  Features

- Real-time PPE detection from live CCTV/RTSP streams
- Detects: Person, Hardhat, Safety Vest, Gloves, Goggles, Mask, Ladder, Safety Cone
- Flags violations: No Hardhat, No Safety Vest, No Gloves, No Goggles, No Mask
- Real-time fall detection with emergency alerts
- Snapshot capture and event logging on every incident
- Dashboard notifications with optional email/SMS alerts
- Searchable historical logs by site, camera, date, violation type, and area
- Exportable reports (by type, site, camera, daily/weekly)
- Role-Based Access Control (RBAC)
- Multi-camera support and scalable architecture

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Python 3.13, FastAPI |
| AI/ML | YOLOv8, PyTorch, OpenCV |
| Database | Supabase (PostgreSQL) |
| Reporting | Plotly |
| Version Control | Git, GitHub |

---

##  Workflow

Live CCTV Feed → Frame Capture → YOLOv8 Detection → PPE/Fall Analysis → Violation Check → Snapshot & Logging (Supabase) → Alert Generation → Dashboard Display & Reporting

---

##  Problem & Solution

Manual PPE checks are slow, inconsistent, and can't cover every worker or camera at once. This system automates detection using YOLOv8 on live feeds, instantly alerting personnel to violations and falls while logging every event for reporting and audit.

---

##  Key Requirements

- Alert latency under 5 seconds; support for multiple concurrent streams
- Target uptime of 99%+
- Scalable to new cameras, users, and sites without redesign
- Encrypted passwords and RBAC-secured access
- Responsive dashboard (desktop, tablet, mobile)

---

##  Assumptions & Out of Scope

**Assumptions:** CCTV cameras pre-installed, stable network, YOLOv8 trained on provided PPE dataset, Supabase project configured.

**Out of Scope:** Face recognition, worker identity tracking, camera installation, PPE quality assessment.

---

##  Future Enhancements

- Multi-site centralised dashboard
- Predictive risk analytics
- Mobile alerting app
- Access control / turnstile integration
- Cloud deployment option

---

##  Project Structure

```
bootcamp-ace-26-team-6/
├── backend/
│   ├── auth.py
│   ├── camera_manager.py
│   ├── config.py
│   ├── db.py
│   ├── detector.py
│   ├── __init__.py
│   ├── main.py
│   ├── .env          # Not tracked in git
│   └── test/
│       ├── conftest.py
│       ├── __init__.py
│       ├── test_auth.py
│       ├── test_config.py
│       ├── test_db.py
│       ├── test_detector.py
│       └── test_main.py
├── frontend/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── auth-guard.js
│   │   ├── dashboard.js
│   │   ├── history.js
│   │   ├── logs.js
│   │   ├── reports.js
│   │   ├── settings.js
│   │   └── supabase-db.js
│   ├── index.html
│   ├── login.html
│   ├── history.html
│   ├── logs.html
│   ├── reports.html
│   └── settings.html
├── models/
│   ├── best.pt
│   ├── last.pt
│   └── modeltesting.ipynb
├── training/
│   ├── ppe-compliance-model-train.ipynb
│   └── results_summary.md
├── docs/
│   ├── devmvp.txt
│   ├── MVP plan Team leader.pdf
│   ├── PPE_Compliance_BRD.pdf
│   ├── PPE Compliance Final Report.pdf
│   ├── SPRINT_RECORD.md
│   └── Team 2 BRD.pdf
├── DBXSCHEMA.sql
├── .env.example
├── .gitignore
├── requirements.txt
├── run.sh        # Linux/macOS/Windows Git-Bash
├── LICENSE
├── SECURITY_NOTICE.md
└── README.md
```

---

## Documentation

| You want to… | Read |
|---|---|
| Run your first detection (15-min lesson) | `docs/tutorial-first-detection.md` |
| Deploy on AWS in one command | `docs/how-to-deploy-aws.md` |
| Connect LAN / RTSP / public / file cameras | `docs/how-to-cameras.md` |
| Look up endpoints, env vars, class IDs | `docs/reference-api.md` |
| Understand why it is built this way | `docs/explanation-architecture.md` |

---

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/akashpannala/X-CV && cd X-CV
```

### 2. Configure environment variables
Create `backend/.env` from `backend/.env.exp` (weights come from
Hugging Face — no model files needed):

```env
SUPABASE_URL=https://x.supabase.co
SUPABASE_ANON_KEY=sb_publishable
SUPABASE_SERVICE_KEY=sb_secret
JWT_SECRET=change-me-to-a-random-secret-key-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
MODEL_REPO_ID=akashpannala/ppe-compliance-yolov8
MODEL_REVISION=1a978d5
```

### 3. Run the application

```bash
./run.sh
```

Or manually:
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Open the application

Dashboard: `http://localhost:8000`

API docs (Swagger UI): `http://localhost:8000/docs`

### 5. Deploy (optional)

```bash
export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... JWT_SECRET=...
./infra/deploy.sh up   # EC2 + CloudFront HTTPS, ~$0 at low use; see How-to: deploy
```

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| SUPABASE_URL | Supabase project URL | Yes |
| SUPABASE_SERVICE_KEY | Service role key (bypasses RLS) | Yes |
| SUPABASE_ANON_KEY | Anonymous/public key | Yes |
| JWT_SECRET | Secret for signing JWT tokens (32+ chars) | Yes |
| JWT_ALGORITHM | JWT algorithm | No |
| JWT_EXPIRE_MINUTES | Access token expiry, in minutes | No |
| MODEL_REPO_ID | Hugging Face weights repo | No |
| MODEL_REVISION | Pinned weights commit | No |

---

## Database Schema

Defined in `DBXSCHEMA.sql`. Tables:

- **`users`** — `id`, `username` (unique), `password_hash`, `full_name`, `created_at`
- **`cameras`** — `id`, `user_id` → `users`, `name`, `url`, `created_at`
- **`detection_events`** — `id`, `user_id` → `users`, `camera_id` → `cameras`, `camera_name`, `event_type` (`compliant` / `violation` / `fall`), `snapshot`, `detected_at`
- **`detections`** — `id`, `event_id` → `detection_events`, `class_id`, `class_name`, `confidence`, `bbox_x1/y1/x2/y2`, `is_violation`
- **`alerts`** — `id`, `user_id` → `users`, `event_id` → `detection_events`, `alert_type` (`violation` / `fall`), `message`, `acknowledged`, `created_at`
- **`user_settings`** — `id`, `user_id` → `users` (unique), `violation_class_ids` (default `{6,7,8,9,10}`), `alert_on_violation`, `alert_on_fall`, `created_at`, `updated_at`

Foreign keys: `detection_events.user_id → users.id`, `detection_events.camera_id → cameras.id`, `detections.event_id → detection_events.id`, `alerts.user_id → users.id`, `alerts.event_id → detection_events.id`, `cameras.user_id → users.id`, `user_settings.user_id → users.id`.
