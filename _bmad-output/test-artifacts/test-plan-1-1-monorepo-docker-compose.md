# 🧪 Test Plan — Story 1.1: Monorepo Structure & Docker Compose Stack

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 1.1 — Monorepo Structure & Docker Compose Stack
**Date:** 2026-08-05
**Risk Level:** 🔴 HIGH — This is the infrastructure foundation. Failures here block all subsequent stories.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Service startup order race condition | HIGH | CRITICAL | Health checks + depends_on with condition: service_healthy |
| Piper Wyoming protocol misunderstanding | HIGH | MEDIUM | Document Wyoming vs HTTP; integration test deferred to Story 2.3 |
| Keycloak DB init conflict | MEDIUM | HIGH | Separate Keycloak DB init; test idempotent re-runs |
| Ollama container starts but model not pulled | HIGH | LOW | Health check only checks /api/tags (200 OK); model pull is documented step |
| MinIO bucket missing post-startup | MEDIUM | MEDIUM | Manual init documented; automated in Story 6.1 |
| Next.js build fails due to TS config | LOW | MEDIUM | Verify tsconfig.json at project init |
| Docker layer cache invalidation causing slow CI | LOW | LOW | Document cache strategy |

---

## Test Strategy for Story 1.1

### Scope

This story is **infrastructure-only** — no application code. Tests are:
- **Smoke tests**: Can services start and respond?
- **Config validation**: Are env vars and files correct?
- **Structure tests**: Does the directory and file skeleton match spec?

### Out of Scope for this Story

- Application logic (tested in Stories 1.2–1.7)
- Auth flows (Story 1.5)
- API endpoint responses (Stories 1.3+)
- n8n workflow execution (Story 1.7)

---

## Test Cases

### TC-1.1-01: All Docker Services Start Healthy

**Type:** Smoke / Integration
**Tool:** Shell script (`tests/smoke/docker-health.sh`) or Makefile target
**Priority:** P0 — CRITICAL (blocks all other development)

**Setup:**
```bash
cp .env.example .env.local
# Fill in minimum required values for docker-only (no real API keys needed)
docker compose -f docker/docker-compose.yml up -d
```

**Steps:**
1. Wait 60 seconds for all services to stabilize
2. Run `docker compose -f docker/docker-compose.yml ps`

**Expected Result:**
```
NAME          STATUS          PORTS
web           Up (healthy)    0.0.0.0:3000->3000/tcp
postgres      Up (healthy)    0.0.0.0:5432->5432/tcp
keycloak      Up (healthy)    0.0.0.0:8080->8080/tcp
n8n           Up              0.0.0.0:5678->5678/tcp
ollama        Up (healthy)    0.0.0.0:11434->11434/tcp
piper         Up              0.0.0.0:5500->10200/tcp
minio         Up              0.0.0.0:9000->9000/tcp, 0.0.0.0:9001->9001/tcp
disease-api   Up (healthy)    0.0.0.0:8000->8000/tcp
```

**Pass Criteria:** All 8 services show `Up` (healthy preferred, but `Up` acceptable for services without healthcheck)
**Fail Criteria:** Any service shows `Exit`, `Restarting`, or `Created` (stuck)

---

### TC-1.1-02: Service Health Endpoint Verification

**Type:** Smoke / HTTP
**Tool:** `curl` or `scripts/smoke-test.sh`
**Priority:** P0

**Test Steps (run each independently):**

```bash
# PostgreSQL (via pg_isready — already in compose healthcheck)
docker exec postgres pg_isready -U agrimarket

# Keycloak admin console reachable
curl -f http://localhost:8080/health/ready
# Expected: {"status":"UP"}

# Next.js web app
curl -f http://localhost:3000
# Expected: HTTP 200 (login redirect or placeholder page)

# n8n API
curl -f http://localhost:5678/healthz
# Expected: {"status":"ok"}

# Ollama (model list — empty is OK, service must respond)
curl -f http://localhost:11434/api/tags
# Expected: {"models":[]} or populated if model pulled

# MinIO
curl -f http://localhost:9000/minio/health/live
# Expected: HTTP 200

# Disease API
curl -f http://localhost:8000/health
# Expected: {"status":"ok","model_loaded":false}  ← model_loaded:false is OK at this stage

# Piper (Wyoming protocol — cannot curl directly; verify container is up)
docker inspect agrimarket-piper-1 --format '{{.State.Status}}'
# Expected: running
```

**Pass Criteria:** All endpoints respond with expected HTTP 200 within 5 seconds
**Fail Criteria:** Any endpoint returns non-2xx or connection refused

---

### TC-1.1-03: Service Startup Order (Dependency Chain)

**Type:** Functional / Behavioral
**Tool:** Shell script + `docker compose logs`
**Priority:** P1

**Test Steps:**
1. `docker compose down -v` (clean state)
2. `docker compose up -d --no-recreate`
3. `docker compose logs postgres | grep "database system is ready"`
4. `docker compose logs keycloak | grep "Keycloak"` — must appear AFTER postgres ready
5. `docker compose logs web | grep "ready"` — must appear AFTER postgres + keycloak

**Pass Criteria:** Log timestamps confirm postgres started before keycloak, keycloak before web
**Fail Criteria:** web starts before keycloak (Keycloak OIDC config would fail)

---

### TC-1.1-04: Environment Variables Coverage

**Type:** Config / Static Analysis
**Tool:** Shell `diff` + custom script
**Priority:** P1

**Test Script (`scripts/validate-env.sh`):**
```bash
#!/bin/bash
REQUIRED_KEYS=(
  "OLLAMA_MODEL"
  "DATABASE_URL"
  "NEXTAUTH_SECRET"
  "KEYCLOAK_CLIENT_ID"
  "KEYCLOAK_CLIENT_SECRET"
  "KEYCLOAK_ISSUER"
  "MINIO_ENDPOINT"
  "MINIO_ACCESS_KEY"
  "MINIO_SECRET_KEY"
  "DISEASE_API_URL"
  "PIPER_URL"
  "N8N_ENCRYPTION_KEY"
  "MINIO_BUCKET_NAME"
)

MISSING=0
for key in "${REQUIRED_KEYS[@]}"; do
  if ! grep -q "^${key}=" .env.example; then
    echo "❌ MISSING in .env.example: $key"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -eq 0 ]; then
  echo "✅ All required env vars present in .env.example"
  exit 0
else
  echo "❌ $MISSING keys missing"
  exit 1
fi
```

**Pass Criteria:** Script exits 0; all 13 keys found
**Fail Criteria:** Any key missing

---

### TC-1.1-05: Directory Structure Validation

**Type:** Structural / Static
**Tool:** Shell script
**Priority:** P1

**Test Script (`scripts/validate-structure.sh`):**
```bash
#!/bin/bash
REQUIRED_DIRS=(
  "apps/web"
  "apps/disease-api"
  "docker"
  "workflows"
  "docs"
  "ai-models"
  "apps/web/src/app"
  "apps/web/src/styles"
)

REQUIRED_FILES=(
  "docker/docker-compose.yml"
  ".env.example"
  ".gitignore"
  "apps/web/tsconfig.json"
  "apps/web/next.config.js"
  "apps/web/src/styles/globals.css"
  "apps/disease-api/app/main.py"
  "apps/disease-api/requirements.txt"
  "apps/disease-api/Dockerfile"
)

FAIL=0
for dir in "${REQUIRED_DIRS[@]}"; do
  [ -d "$dir" ] || { echo "❌ Missing dir: $dir"; FAIL=1; }
done

for file in "${REQUIRED_FILES[@]}"; do
  [ -f "$file" ] || { echo "❌ Missing file: $file"; FAIL=1; }
done

[ $FAIL -eq 0 ] && echo "✅ Structure OK" || exit 1
```

**Pass Criteria:** Script exits 0
**Fail Criteria:** Any missing dir or file

---

### TC-1.1-06: GitIgnore Coverage

**Type:** Config / Static
**Tool:** `git check-ignore`
**Priority:** P2

**Steps:**
```bash
# Create fake secret files to test gitignore
echo "secret" > .env.local
echo "secret" > .env.production
mkdir -p apps/web/node_modules && touch apps/web/node_modules/fake.js

git check-ignore -v .env.local
# Expected: .gitignore:N:.env.local   .env.local

git check-ignore -v .env.production
# Expected: .gitignore:N:.env.production  .env.production

git check-ignore -v apps/web/node_modules/fake.js
# Expected: .gitignore:N:node_modules/   apps/web/node_modules/fake.js

git check-ignore -v .env.example
# Expected: (empty — .env.example should NOT be ignored)
```

**Pass Criteria:** `.env.local`, `.env.production`, `node_modules/` are gitignored; `.env.example` is NOT ignored
**Fail Criteria:** `.env.example` is ignored OR real secrets are not ignored

---

### TC-1.1-07: Next.js TypeScript Config Validation

**Type:** Build / Compilation
**Tool:** `npx tsc --noEmit` inside `apps/web` container
**Priority:** P1

**Steps:**
```bash
docker exec agrimarket-web-1 sh -c "cd /app && npx tsc --noEmit"
```

**Pass Criteria:** Command exits 0 with no TypeScript errors
**Fail Criteria:** Any `TS` error in output

---

### TC-1.1-08: Idempotent Restart

**Type:** Reliability
**Tool:** Shell
**Priority:** P1

**Steps:**
1. `docker compose down` (keep volumes)
2. `docker compose up -d`
3. Repeat TC-1.1-02

**Pass Criteria:** All services come back up healthy; no data corruption warnings in postgres logs
**Fail Criteria:** Any service fails to restart after clean shutdown

---

### TC-1.1-09: Fresh Clone Reproducibility

**Type:** Integration / Developer Experience
**Tool:** Manual (or CI pipeline)
**Priority:** P0 — Required for team onboarding

**Steps:**
1. Clone repo to a different directory (simulate fresh machine)
2. Copy `.env.example` → `.env.local` and fill minimum values
3. Run `docker compose up -d`
4. Execute TC-1.1-01

**Pass Criteria:** Fresh clone + `up` works without any other manual steps (except documented model pull)
**Fail Criteria:** Requires undocumented manual steps

---

## Test Execution Plan

### Running Order (by priority)

```
P0 First:
  TC-1.1-09 → TC-1.1-01 → TC-1.1-02

P1 After P0 pass:
  TC-1.1-03 → TC-1.1-04 → TC-1.1-05 → TC-1.1-06 → TC-1.1-07 → TC-1.1-08

P2 Final polish:
  TC-1.1-06 (gitignore audit)
```

### Automation Target

Create `scripts/smoke-test.sh` that runs TC-1.1-01 + TC-1.1-02 + TC-1.1-04 + TC-1.1-05 automatically. This script will be reused in future stories to confirm infrastructure is still healthy before implementing features.

```bash
#!/bin/bash
# scripts/smoke-test.sh — run after docker compose up
set -e
echo "=== DX-AgriMarket Smoke Test ==="
bash scripts/validate-env.sh
bash scripts/validate-structure.sh
echo "--- Checking service health ---"
curl -sf http://localhost:3000 > /dev/null && echo "✅ web" || echo "❌ web"
curl -sf http://localhost:8080/health/ready > /dev/null && echo "✅ keycloak" || echo "❌ keycloak"
curl -sf http://localhost:11434/api/tags > /dev/null && echo "✅ ollama" || echo "❌ ollama"
curl -sf http://localhost:9000/minio/health/live > /dev/null && echo "✅ minio" || echo "❌ minio"
curl -sf http://localhost:8000/health > /dev/null && echo "✅ disease-api" || echo "❌ disease-api"
echo "=== Smoke test complete ==="
```

---

## Definition of Done for Story 1.1

- [ ] `TC-1.1-01` PASS: all 8 services start healthy
- [ ] `TC-1.1-02` PASS: all HTTP health endpoints respond 200
- [ ] `TC-1.1-03` PASS: startup order confirmed correct
- [ ] `TC-1.1-04` PASS: all 13 env keys present in `.env.example`
- [ ] `TC-1.1-05` PASS: all required dirs and files exist
- [ ] `TC-1.1-06` PASS: gitignore covers all secrets
- [ ] `TC-1.1-07` PASS: TypeScript compiles with no errors
- [ ] `TC-1.1-08` PASS: idempotent restart works
- [ ] `TC-1.1-09` PASS: fresh clone reproducible
- [ ] `scripts/smoke-test.sh` created and committed
- [ ] `docs/dev-setup.md` written with manual steps (model pull, MinIO bucket init)
- [ ] Committed with message: `chore: initialize monorepo structure and docker compose stack`

---

## Murat's Notes

> **Piper TTS is the highest-risk item in this story.** Wyoming protocol is not HTTP — a developer unfamiliar with it will instinctively try `curl http://piper:5500/tts` and get nothing. I strongly recommend the story file document this explicitly (it does — good) and a smoke test confirms the container is at least running. Actual TTS integration testing defers to Story 2.3.
>
> **Ollama model pull is a manual step** — don't try to automate this in Docker Compose (downloading Mistral 7B is 4GB+, not suitable for startup). CI should either use a pre-seeded volume or test with phi3:mini (1.8GB).
>
> **Keycloak + Postgres two-database setup is subtle** — Keycloak needs its own `keycloak` database, while the app uses `agrimarket`. Make sure the postgres init script creates both, or use two separate `postgres` services.

---

*Test plan authored for Story 1.1 as part of DX-AgriMarket test infrastructure. This smoke-test pattern will be inherited by all subsequent stories.*
