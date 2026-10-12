#!/usr/bin/env bash
# Push the hardened image to ECR (optional path — EC2 deploy.sh needs no image).
# Usage: AWS_REGION=ap-south-1 ./infra/ecr-push.sh [tag]
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${AWS_REGION:-ap-south-1}"
TAG="${1:-latest}"
export AWS_REGION="$REGION"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REPO="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/ppe-sentry"

aws ecr describe-repositories --repository-names ppe-sentry >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name ppe-sentry >/dev/null
aws ecr get-login-password | docker login --username AWS --password-stdin "$REPO"
docker build -t "$REPO:$TAG" .
docker push "$REPO:$TAG"
echo "pushed: $REPO:$TAG"
