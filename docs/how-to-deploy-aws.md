# How to deploy on AWS in one command

Deploy (and stop/start) the full stack on the free tier. Assumes competence:
AWS CLI configured, one Supabase project with `DBXSCHEMA.sql` applied.

## How to launch

If you want a fresh deploy, export the four secrets and run one command:

```bash
export SUPABASE_URL=https://xyz.supabase.co
export SUPABASE_ANON_KEY=sb_publishable_...
export SUPABASE_SERVICE_KEY=sb_secret_...
export JWT_SECRET=$(openssl rand -hex 32)
./infra/deploy.sh up
```

The script stores secrets in SSM `/ppe/*`, deploys `infra/ppe.yaml`
(security group, Elastic IP, CloudFront HTTPS), launches a `t3.micro`
with `user-data.sh` (venv, swap, HF weights, systemd service), waits for
`/health`, and prints the dashboard URL. First boot takes ~5 minutes.

If you want Docker instead of EC2 user-data, build and push the
production image (same code, non-root, no dev deps, no baked weights):

```bash
./infra/ecr-push.sh v1
```

## How to live at 1 request a day for ~$0

If you want to pay nothing, stop the instance between uses — the EIP,
CloudFront, and SSM cost nothing while it is stopped:

```bash
./infra/deploy.sh stop    # after testing
./infra/deploy.sh start   # before a session (re-associates the EIP)
./infra/deploy.sh status  # instance id + dashboard URL
```

If you want to tear everything down, terminate the instance and delete
the `ppe` CloudFormation stack (releases the EIP; unattached EIPs bill).

## How to rotate keys

If you want new Supabase keys or a new JWT secret, update SSM and restart:

```bash
aws ssm put-parameter --overwrite --type SecureString \
  --name /ppe/SUPABASE_SERVICE_KEY --value 'sb_secret_...'
aws ssm send-command --instance-ids <iid> --document-name AWS-RunShellScript \
  --parameters 'commands=["systemctl restart ppe"]'
```

Never commit `backend/.env` (gitignored) and never paste secrets in chat.

## How to debug a bad deploy

If `/health` never turns green, in order: EC2 system log (user-data
output) → `systemctl status ppe` via Session Manager (no SSH keys needed:
the instance role carries `AmazonSSMManagedInstanceCore`) → SSM `/ppe/*`
present and decrypted → Supabase reachable on 443 → CloudFront origin is
the EIP's public DNS. See About the architecture for why each piece exists.
