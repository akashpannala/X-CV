#  PPE Compliance Detection System

An AI-powered real-time PPE (Personal Protective Equipment) Compliance Detection System that monitors workers through live CCTV/video feeds using YOLOv8 object detection. The system identifies PPE compliance and violations, detects falls, stores detection events in a Supabase database, and provides a web dashboard for monitoring and reporting.

---

##  Features

- Real-time PPE detection from browser webcam or IP/RTSP camera streams
- Detects: Person, Hardhat, Safety Vest, Gloves, Goggles, Mask, Ladder, Safety Cone
- Flags violations: No Hardhat, No Safety Vest, No Gloves, No Goggles, No Mask
- Real-time fall detection with emergency alerts
- Snapshot capture and event logging on every incident
- Dashboard notifications with alarm sound and alert acknowledgement
- Searchable historical logs by camera, date, and violation type
- Exportable reports (charts and CSV)
- JWT authentication for all API endpoints
- Camera management (add, edit, start/stop, delete)
- Multi-camera support and scalable architecture

---

##  Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Python 3.12+, FastAPI |
| AI/ML | YOLOv8, PyTorch, OpenCV |
| Database | Supabase (PostgreSQL) |
| Reporting | Chart.js, CSV export |
| Deployment | Docker, Docker Compose, Caddy, DuckDNS |
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
- Encrypted passwords and JWT-secured API access
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
- Multi-instance / auto-scaling deployment (camera state is currently in-memory)

---

##  Project Structure

```
X-CV/
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
│       ├── test_camera_manager.py
│       ├── test_config.py
│       ├── test_db.py
│       ├── test_detector.py
│       └── test_main.py
├── deploy/
│   ├── .env.example      # Caddy/DuckDNS variables
│   └── Caddyfile
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
│   ├── best.pt       # Tracked in git; can be replaced via scp
│   ├── last.pt       # Tracked fallback weights
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
├── .dockerignore
├── .env.example
├── .gitignore
├── DBXSCHEMA.sql
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── run.sh        # Linux/macOS
├── runx.sh       # Windows
├── LICENSE
└── README.md
```

---

## Getting Started

### 1. Clone the repository
```bash
git clone <repository-url>
cd X-CV
```

### 2. Configure environment variables
Copy `.env.example` to `backend/.env` and fill in your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
JWT_SECRET=change-me-to-a-random-secret-key-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
```

The service-role key is used server-side only; never expose it to the browser.
A user row must be seeded in the `users` table (with a bcrypt password hash)
before logging in, because the API does not expose a registration endpoint.

Model weights (`best.pt`, `last.pt`) are tracked in this repository and will be
present after cloning. You can replace them via `scp` or set `MODEL_PATH` to use
different weights. Keep the application on a single uvicorn worker in
production, since camera stream state is held in memory.

### 3. Run the application

**Linux / macOS:**
```bash
./run.sh
```

**Windows:**
```bash
./runx.sh
```

Or manually:
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Open the application

Dashboard: `http://localhost:8000`

API docs (Swagger UI): `http://localhost:8000/docs`

### 5. Run tests

```bash
./venv/bin/python -m pytest backend/test -q
```

---

## Deployment (EC2, Docker, Caddy, DuckDNS)

This setup runs one EC2 instance with Docker Compose (`app` + Caddy), HTTPS via Caddy automatic certificates, and a DuckDNS subdomain. Keep a single uvicorn worker and a single instance because camera stream state is in-memory.

### Prerequisites

- Ubuntu 24.04 EC2 instance in a VPC (recommended: `t3.large`, 30 GB gp3, Elastic IP)
- Security group: `22` from your IP, `80` and `443` from anywhere, **do not expose 8000**
- DuckDNS subdomain pointing its A record to the Elastic IP
- Supabase tables created and at least one user row seeded
- `backend/.env` values ready (Supabase URL/keys, JWT secret)

### 1. Install Docker on EC2

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Clone and configure

```bash
git clone https://github.com/akashpannala/X-CV.git
cd X-CV
```

Copy or create `backend/.env` (server-side secrets, never commit):

```bash
scp -i /path/to/key.pem backend/.env ubuntu@<elastic-ip>:~/X-CV/backend/.env
chmod 600 backend/.env
```

Model weights are tracked in git and cloned automatically. To replace them:

```bash
scp -i /path/to/key.pem models/best.pt ubuntu@<elastic-ip>:~/X-CV/models/best.pt
```

Configure Caddy/DuckDNS:

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
chmod 600 deploy/.env
```

Set:

```env
DOMAIN=your-subdomain.duckdns.org
ACME_EMAIL=you@example.com
```

Ensure DuckDNS resolves to the Elastic IP and remove any stale AAAA record before starting Caddy.

### 3. Start

```bash
docker compose --env-file deploy/.env up -d --build
docker compose --env-file deploy/.env ps
docker compose --env-file deploy/.env logs -f caddy
```

Verify:

```bash
curl -I https://your-subdomain.duckdns.org
curl https://your-subdomain.duckdns.org/health
```

Then open `https://your-subdomain.duckdns.org` in a browser. HTTPS is required for browser webcam access; IP/RTSP cameras work once reachable from the instance.

### 4. Updates

```bash
git pull
docker compose --env-file deploy/.env up -d --build
```

If you update weights, copy them into `models/` and restart the app container.

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| SUPABASE_URL | Supabase project URL | Yes |
| SUPABASE_SERVICE_KEY | Service role key (bypasses RLS, server-side only) | Yes |
| SUPABASE_ANON_KEY | Anonymous/public key | Yes |
| JWT_SECRET | Secret for signing JWT tokens (32+ chars) | Yes |
| JWT_ALGORITHM | JWT algorithm (default: `HS256`) | No |
| JWT_EXPIRE_MINUTES | Access token expiry, in minutes (default: `60`) | No |
| MODEL_PATH | Path to YOLO model (default: `models/best.pt`, falls back to `models/last.pt`) | No |

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

Deleting a camera sets `detection_events.camera_id` to `NULL` first, so historical events are preserved with their stored `camera_name`.
