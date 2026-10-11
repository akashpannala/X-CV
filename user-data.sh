#!/usr/bin/env bash
# EC2 user-data (Amazon Linux 2023) — non-Docker path.
# Secrets come from SSM Parameter Store (/ppe/*), never baked in.
set -eux

dnf update -y
dnf install -y python3.13 python3.13-pip mesa-libGL glib2
python3.13 -m venv /opt/ppe/venv || python3 -m venv /opt/ppe/venv
source /opt/ppe/venv/bin/activate

# 2GB swap for t3.micro (torch+YOLO OOM without it)
if ! swapon --show | grep -q swapfile; then
  dd if=/dev/zero of=/swapfile bs=128M count=16
  chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

cd /opt/ppe/app  # repo cloned here before this runs (see README deploy notes)

pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
pip install -r requirements.txt

# Pull SSM secrets into EnvironmentFile
mkdir -p /etc/ppe
aws ssm get-parameters-by-path --path /ppe --with-decryption --query 'Parameters[*].[Name,Value]' --output text \
  | sed 's|/ppe/||' | awk '{print $1"="$2}' > /etc/ppe/env
chmod 600 /etc/ppe/env

# Boot prefetch: HF weights into cache BEFORE uvicorn (first /detect stays fast)
set -a; source /etc/ppe/env; set +a
python -c "from backend.detector import prefetch_weights; print(prefetch_weights())"

cat > /etc/systemd/system/ppe.service <<'UNIT'
[Unit]
Description=PPE Compliance API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ppe/app
EnvironmentFile=/etc/ppe/env
ExecStart=/opt/ppe/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now ppe.service
