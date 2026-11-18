#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
    if command -v python >/dev/null 2>&1; then
        python -m venv venv
    else
        py -m venv venv
    fi
fi

source venv/Scripts/activate

if [ ! -f "backend/.env" ]; then
    echo "Missing backend/.env. Copy .env.example to backend/.env and fill in your credentials."
    exit 1
fi

if [ -f "backend/requirements.txt" ]; then
    pip install -r backend/requirements.txt
elif [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
fi

set -a; source backend/.env; set +a

echo "Starting backend on :8000 ..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

trap "kill $BACKEND_PID 2>/dev/null; exit" INT TERM

echo ""
echo "  Backend:  http://localhost:8000"
echo "  Swagger:  http://localhost:8000/docs"
echo "  ⚠ Chromium: use http://localhost:8000 (IP address won't work for camera)"
echo ""

wait