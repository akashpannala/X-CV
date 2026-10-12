#!/usr/bin/env bash
# PPE Sentry 1-click deploy: ./infra/deploy.sh up
# Subcommands: up (default) | status | stop | start
# Env required for `up`: SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY JWT_SECRET
# Optional: AWS_REGION (default ap-south-1), STACK (default ppe), MODEL_REPO_ID, MODEL_REVISION
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${AWS_REGION:-ap-south-1}"
STACK="${STACK:-ppe}"
export AWS_REGION="$REGION"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need aws; need curl

out() { aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

instance_id() { aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=ppe" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query "Reservations[0].Instances[0].InstanceId" --output text; }

cmd="${1:-up}"
case "$cmd" in
  up)
    aws sts get-caller-identity >/dev/null # fail fast on bad creds
    for v in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_KEY JWT_SECRET; do
      [ -n "${!v:-}" ] || { echo "set $v in env first" >&2; exit 1; }
    done
    : "${MODEL_REPO_ID:=akashpannala/ppe-compliance-yolov8}"
    : "${MODEL_REVISION:=1a978d5}"

    put() { aws ssm put-parameter --overwrite --type "$1" --name "/ppe/$2" --value "$3" >/dev/null; }
    put SecureString SUPABASE_URL "$SUPABASE_URL"
    put SecureString SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"
    put SecureString SUPABASE_SERVICE_KEY "$SUPABASE_SERVICE_KEY"
    put SecureString JWT_SECRET "$JWT_SECRET"
    put String MODEL_REPO_ID "$MODEL_REPO_ID"
    put String MODEL_REVISION "$MODEL_REVISION"
    echo "SSM /ppe/* stored."

    VPC="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
    SUBNET="$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" \
      --query 'Subnets[0].SubnetId' --output text)"
    aws cloudformation deploy --template-file infra/ppe.yaml --stack-name "$STACK" \
      --parameter-overrides "VpcId=$VPC" "SubnetId=$SUBNET" \
      --capabilities CAPABILITY_NAMED_IAM >/dev/null
    echo "Stack $STACK ready."

    AMI="$(aws ssm get-parameters --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
      --query 'Parameters[0].Value' --output text)"
    IID="$(instance_id)"
    if [ -z "$IID" ] || [ "$IID" = "None" ]; then
      IID="$(aws ec2 run-instances --image-id "$AMI" --instance-type t3.micro \
        --iam-instance-profile "Name=$(out InstanceProfileName)" \
        --security-group-ids "$(out SecurityGroupId)" --subnet-id "$(out SubnetId)" \
        --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' \
        --user-data "file://user-data.sh" \
        --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ppe}]' \
        --query 'Instances[0].InstanceId' --output text)"
      echo "Launched $IID (first boot ~5 min: torch + weights)."
    else
      echo "Reusing $IID."
    fi
    aws ec2 associate-address --instance-id "$IID" \
      --allocation-id "$(out ElasticIPAllocationId)" >/dev/null 2>&1 || true

    URL="$(out DashboardURL)"
    echo "Waiting for $URL ..."
    for _ in $(seq 1 60); do
      sleep 10
      if curl -fsS "${URL}health" >/dev/null 2>&1; then break; fi
    done
    curl -fsS "${URL}health" && echo && echo "LIVE: $URL"
    ;;
  status)
    echo "instance: $(instance_id)"
    echo "dashboard: $(out DashboardURL)"
    ;;
  stop)
    aws ec2 stop-instances --instance-ids "$(instance_id)" >/dev/null && echo stopped
    ;;
  start)
    aws ec2 start-instances --instance-ids "$(instance_id)" >/dev/null
    sleep 5
    aws ec2 associate-address --instance-id "$(instance_id)" \
      --allocation-id "$(out ElasticIPAllocationId)" >/dev/null
    echo started
    ;;
  *) echo "usage: $0 [up|status|stop|start]" >&2; exit 1 ;;
esac
