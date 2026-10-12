FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 app && useradd -m -u 10001 -g app app

WORKDIR /app

# CPU torch first (PyPI defaults are CUDA builds)
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && rm -rf /root/.cache

# NOTE: models/ deliberately NOT baked — pulled from Hugging Face at boot
# (MODEL_REPO_ID/MODEL_REVISION env, prefetched in CMD).
COPY backend/ backend/
COPY frontend/ frontend/
RUN mkdir -p /models && chown -R 10001:10001 /app /models

ENV HOST=0.0.0.0 \
    PORT=8000 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HUB_CACHE=/models

VOLUME ["/models"]
EXPOSE 8000
USER 10001

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" || exit 1

CMD ["sh", "-c", "python -c \"from backend.detector import prefetch_weights; print(prefetch_weights())\" && uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
