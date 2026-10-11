FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU torch first (PyPI defaults are CUDA builds)
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# NOTE: models/ deliberately NOT baked — pulled from Hugging Face at boot
# (MODEL_REPO_ID/MODEL_REVISION env, see user-data.sh prefetch).
COPY backend/ backend/
COPY frontend/ frontend/

ENV HOST=0.0.0.0 \
    PORT=8000 \
    PYTHONUNBUFFERED=1 \
    HF_HUB_CACHE=/models

RUN mkdir -p /models
VOLUME ["/models"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" || exit 1

CMD ["sh", "-c", "python -c \"from backend.detector import prefetch_weights; print(prefetch_weights())\" && uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
