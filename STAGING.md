# Staging environment

A staging clone lets you test deploys before they hit production. Because it
needs a subdomain (DNS) and a bit of RAM, activation has **one manual step you
control** (the DNS record); everything else is scripted.

## Option A — Staging on the SAME VPS (cheapest, recommended to start)

Runs an isolated second stack (own DB/redis/minio/containers) under the compose
project `ota-staging`, on different host ports, behind `staging.miruum.id`.

**1. Add the DNS record (only step you must do):**
```
A   staging.miruum.id   →   76.13.197.249
```

**2. On the VPS, create the staging stack:**
```bash
mkdir -p /root/ota-staging && cp -r /root/ota/{backend,web,deploy} /root/ota-staging/
cd /root/ota-staging/deploy
# generate a separate .env (own DB password / secrets)
# then bring it up on staging ports (project name isolates volumes/containers):
docker compose -p ota-staging up -d --build
```
Use distinct host ports in the staging compose (e.g. web→8201, backend→5119) so
they don't clash with production (web→8101, backend→5019).

**3. nginx for `staging.miruum.id`** — copy `api.miruum.id.conf`, swap the
`server_name` and the proxy ports to the staging ones, then:
```bash
certbot --nginx -d staging.miruum.id && nginx -s reload
```

**4. Deploy to staging** with the pipeline:
```bash
MIRUUM_REMOTE=/root/ota-staging MIRUUM_HEALTH=https://staging.miruum.id/api/health \
  ./scripts/deploy.sh all
```

Promotion flow: `deploy.sh` to **staging** → smoke-test → `deploy.sh` to
**production**.

## Option B — Separate VPS
Provision a second VPS, point `MIRUUM_VPS`/`MIRUUM_KEY`/`MIRUUM_HEALTH` at it, and
run the same `scripts/deploy.sh`. Stronger isolation; extra cost.

## CI gate before deploy
`.github/workflows/ci.yml` already runs backend tests + build, web syntax, and
`flutter analyze` on every push — wire a deploy step after `ci` passes (call
`scripts/deploy.sh`) once you add the VPS SSH key as a repository secret.
