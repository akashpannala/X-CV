#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Windows Git-Bash uses Scripts/, POSIX uses bin/
if [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate
else
    source venv/bin/activate
fi

pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
pip install -r requirements.txt
pip install -r requirements-dev.txt

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
