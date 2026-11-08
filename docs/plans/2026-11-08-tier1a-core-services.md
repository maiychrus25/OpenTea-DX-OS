# Tier 1a — Mandatory Core Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing services into a headless DX-OS Open-Core Tier 1 that provides the four mandatory services (SSO + MFA, API Gateway, structured + unstructured data, Workflow), proven by an automated smoke test in CI.

**Architecture:** APISIX (standalone, declarative YAML) is the single entry point at `:9080` and validates Keycloak JWTs before forwarding to Hasura (read-only GraphQL with row-level permissions keyed on the `htx_code` claim), n8n webhooks, the disease API and SeaweedFS (S3 on `:9000`, network alias `minio`). PostgreSQL gains PostGIS and pgvector. The Next.js app (`apps/web`) is not modified.

**Tech Stack:** Docker Compose, Apache APISIX 3.19.0, Hasura GraphQL Engine v2.51.4 CE, Keycloak 24, PostgreSQL 16 + PostGIS 3.5 + pgvector, SeaweedFS 4.50, n8n 2.47.2, Bash + curl + jq, Python 3 `unittest`, Node (for the S3 compatibility probe).

**Spec:** `docs/specs/2026-11-08-tier1-core-platform-design.md`

## Global Constraints

- Do not modify anything under `apps/web/` (Tier 2 is out of scope).
- Every new file starts with `SPDX-License-Identifier: MIT` and `SPDX-FileCopyrightText: 2026 OpenTea Developers` in the file's comment syntax (JSON files excepted).
- Code identifiers, file names, commit messages: English. Commits: Conventional Commits, authored `maiychrus25 <ninhkhuongpl7@gmail.com>`, no `Co-Authored-By` trailer. Never push without the owner's approval.
- Pinned images (exact tags): `apache/apisix:3.19.0-debian`, `hasura/graphql-engine:v2.51.4.cli-migrations-v3`, `postgis/postgis:16-3.5` (base of `platform/postgres`), `chrislusf/seaweedfs:4.50`, `n8nio/n8n:2.47.2`, `rhasspy/wyoming-piper:2.5.2`, `mattermost/mattermost-team-edition:12.1.0`. No `latest` tag may remain in `docker/docker-compose.yml`.
- Keycloak realm `agrimarket`; audience `dx-os-core`; organization claim `htx_code`; seed users `manager1`, `officer1` get `htx_code=MD2` (current seed HTX).
- Hasura is read-only: no `insert`/`update`/`delete` permission for any role; console disabled; `HASURA_GRAPHQL_UNAUTHORIZED_ROLE` unset.
- Prisma owns the schema. Prisma `@default(cuid())` and `@updatedAt` are client-side: SQL fixtures must supply `id` and `updated_at`.
- The 8 existing CI jobs must stay unchanged and green.

## Review Focus

- **Existing dev volumes:** `platform-init` must be idempotent so `make platform-up` works on a volume that already has data — test: run `platform-init` twice, both exit 0 (Task 1).
- **Keycloak discovery returns `localhost` JWKS URI unreachable from APISIX:** a valid token must pass the gateway, not just invalid ones fail — test: valid manager token on `/api/data/graphql` is not `401` (Task 4).
- **Tampered or foreign tokens:** a token with a modified signature must be rejected — test: flip the last signature character → `401` (Task 4).
- **Browser preflight:** CORS `OPTIONS` without a token must not be blocked by auth — test: `OPTIONS` with `Origin: http://localhost:3000` → `200`/`204` with `Access-Control-Allow-Origin` (Task 4).
- **Schema leakage via introspection:** a farmer must not discover unexposed tables — test: farmer `__schema` query contains no `partners` type (Task 5).

---

### Task 1: PostgreSQL with PostGIS + pgvector, Makefile and smoke harness

**Files:**
- Create: `platform/postgres/Dockerfile`, `platform/postgres/init/01-extensions.sql`
- Create: `platform/tests/lib.sh` (assert helpers), `platform/tests/smoke-platform.sh`
- Create: `Makefile`
- Modify: `docker/docker-compose.yml` (service `postgres`: `build: ../platform/postgres` instead of `image: postgres:16-alpine`; mount `../platform/postgres/init/01-extensions.sql` into `/docker-entrypoint-initdb.d/` next to the existing `init.sql`; new one-shot service `platform-init`)

**Interfaces:**
- Produces: `platform/tests/lib.sh` functions `pass <msg>`, `fail <msg>` (exit 1), `assert_eq <actual> <expected> <msg>`, `assert_http <expected_codes> <msg> -- <curl args...>` (`expected_codes` is a space-separated list, e.g. `"200 204"`); env `GATEWAY=http://localhost:9080`.
- Produces: Make targets `platform-up`, `platform-smoke`, `platform-down`, `up`, `down`, `build`, `test`, `lint`.
- Produces: `psql_app <sql>` helper in `lib.sh` = `docker compose -f docker/docker-compose.yml exec -T postgres psql -U agrimarket -d agrimarket -tAc "<sql>"`.

- [ ] **Step 1: Write the failing smoke check**

In `smoke-platform.sh` section `[postgres]`:
```bash
assert_eq "$(psql_app "select string_agg(extname, ',' order by extname) from pg_extension where extname in ('postgis','vector')")" "postgis,vector" "postgis and vector extensions installed"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `make platform-up && make platform-smoke`
Expected: FAIL `postgis and vector extensions installed` (actual empty).

- [ ] **Step 3: Implement the image and init**

`Dockerfile`: `FROM postgis/postgis:16-3.5`, install `postgresql-16-pgvector` via apt (no recommends, clean lists). `01-extensions.sql`: `CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS vector;`. Service `platform-init`: same built image, `depends_on: postgres: service_healthy`, `restart: "no"`, runs `psql` with that SQL file against `agrimarket` using `PGPASSWORD=${POSTGRES_PASSWORD}`. Makefile: `platform-up` = `docker compose -f docker/docker-compose.yml up -d --build --wait postgres keycloak seaweedfs n8n hasura apisix && docker compose -f docker/docker-compose.yml run --rm platform-init` (each later task appends its new service to this list; in Task 1 the list is `postgres keycloak`); `test` = `cd apps/web && npm test -- --ci`; `lint` = `cd apps/web && npm run lint` + `actionlint`; `build` = `docker compose -f docker/docker-compose.yml build`.

- [ ] **Step 4: Verify it passes and is idempotent**

Run: `make platform-smoke && docker compose -f docker/docker-compose.yml run --rm platform-init && docker compose -f docker/docker-compose.yml run --rm platform-init`
Expected: PASS line for extensions; both `platform-init` runs exit 0.

- [ ] **Step 5: Commit**

`git commit -m "feat(platform): add PostGIS/pgvector database image, Makefile and smoke harness"`

---

### Task 2: SeaweedFS replaces MinIO

**Files:**
- Create: `platform/seaweedfs/entrypoint.sh` (writes `/etc/seaweedfs/s3.json` from `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`, then `exec weed server -dir=/data -s3 -s3.port=9000 -s3.config=/etc/seaweedfs/s3.json`)
- Create: `platform/tests/s3-compat.cjs`
- Modify: `docker/docker-compose.yml` (remove service `minio` and volume `minio_data`; add service `seaweedfs`: image `chrislusf/seaweedfs:4.50`, `networks: agrimarket-net: aliases: [minio]`, ports `9000:9000`, volume `seaweedfs_data:/data`, healthcheck on S3 port)
- Modify: `scripts/smoke-test.sh` (health line for SeaweedFS instead of `/minio/health/live`)
- Modify: `platform/tests/smoke-platform.sh` (section `[storage]`)

**Interfaces:**
- Consumes: `lib.sh` from Task 1.
- Produces: S3 endpoint `minio:9000` inside the network, `localhost:9000` from the host; credentials = `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`.

- [ ] **Step 1: Write the failing S3 compatibility probe**

`s3-compat.cjs` (CommonJS, because ESM ignores `NODE_PATH`) requires the `minio` package resolved from `apps/web/node_modules` via `NODE_PATH=apps/web/node_modules`, endpoint `localhost:9000`, and in order: `makeBucket('dxos-smoke','us-east-1')` if `!bucketExists`; `presignedPutObject` then `fetch(PUT)` body `"hello-dxos"`; `presignedGetObject` then `fetch(GET)`; exits 0 only if the body equals `"hello-dxos"`, else prints the failing step and exits 1. Smoke section `[storage]` runs it and asserts exit 0.

- [ ] **Step 2: Run to verify it fails**

Run: `make platform-up && make platform-smoke`
Expected: FAIL in `[storage]` (MinIO image cannot be pulled, or no S3 on `:9000`).

- [ ] **Step 3: Implement the `seaweedfs` service and entrypoint**

`s3.json` shape: `{"identities":[{"name":"dxos","credentials":[{"accessKey":"$MINIO_ACCESS_KEY","secretKey":"$MINIO_SECRET_KEY"}],"actions":["Admin","Read","Write","List","Tagging"]}]}`. Add `seaweedfs` to `make platform-up`.

- [ ] **Step 4: Verify**

Run: `make platform-smoke && bash scripts/smoke-test.sh`
Expected: `[storage]` PASS; `smoke-test.sh` prints `OK seaweedfs`.

- [ ] **Step 5: Commit**

`git commit -m "feat(platform): replace removed MinIO image with SeaweedFS S3 on port 9000"`

---

### Task 3: Keycloak identity policy (MFA, audience, `htx_code`, no password grant)

**Files:**
- Modify: `docker/keycloak/realm-agrimarket.json`
- Create: `platform/tests/test_realm_policy.py`

**Interfaces:**
- Produces: client scope `dx-os-core` containing mapper `audience-dx-os-core` (`oidc-audience-mapper`, `included.custom.audience=dx-os-core`, access token only) and mapper `htx-code` (`oidc-usermodel-attribute-mapper`, `user.attribute=htx_code`, `claim.name=htx_code`, `jsonType.label=String`, access token only). Later tasks request tokens through any client that has this default scope.

- [ ] **Step 1: Write the failing policy test**

`test_realm_policy.py` (`unittest`, loads the realm JSON) with tests:
- `test_password_grant_disabled_for_web_client`: client `nextjs-web` has `directAccessGrantsEnabled == False`.
- `test_core_scope_has_audience_and_htx_code_mappers`: scope `dx-os-core` exists with the two mappers above.
- `test_web_client_uses_core_scope`: `"dx-os-core" in nextjs-web.defaultClientScopes`.
- `test_staff_require_totp`: users `manager1`, `officer1` have `"CONFIGURE_TOTP" in requiredActions` and `attributes.htx_code == ["MD2"]`; `farmer1` has no `CONFIGURE_TOTP`.
- `test_otp_policy`: `otpPolicyType == "totp"`, `otpPolicyDigits == 6`, `otpPolicyPeriod == 30`.

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest platform/tests/test_realm_policy.py -v`
Expected: 5 failures.

- [ ] **Step 3: Edit the realm JSON**

Make the five assertions true. Do not touch other clients or roles.

- [ ] **Step 4: Verify**

Run: `python3 -m unittest platform/tests/test_realm_policy.py -v && python3 -c "import json;json.load(open('docker/keycloak/realm-agrimarket.json'))"`
Expected: 5 passed; JSON valid. Then recreate the dev realm (`docker compose ... down -v keycloak`-equivalent documented in Task 7) and confirm `manager1` login now asks to configure OTP.

- [ ] **Step 5: Commit**

`git commit -m "feat(platform): enforce TOTP for staff, add dx-os-core audience and htx_code claim"`

---

### Task 4: APISIX gateway with JWT enforcement

**Files:**
- Create: `platform/gateway/config.yaml` (`deployment.role: data_plane`, `role_data_plane.config_provider: yaml`, `apisix.node_listen: 9080`, admin API disabled)
- Create: `platform/gateway/apisix.yaml` (ends with `#END`)
- Create: `platform/tests/tokens.sh` (Keycloak admin helpers)
- Modify: `docker/docker-compose.yml` (service `apisix`: image `apache/apisix:3.19.0-debian`, mounts both files read-only, ports `9080:9080`, `depends_on` keycloak/hasura)
- Modify: `platform/tests/smoke-platform.sh` (section `[gateway]`)

**Interfaces:**
- Consumes: realm policy from Task 3; `lib.sh`.
- Produces in `tokens.sh`: `kc_admin_token` (master `admin-cli` password grant with `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD`), `ensure_client <client_id> <default_scopes_csv>` (creates a public client with `directAccessGrantsEnabled: true` — created at test time, never in the realm file; the smoke run uses `dxos-smoke` with `dx-os-core,roles,profile` and, in Task 5, `dxos-noaud` with `roles,profile`), `user_token <username> [client_id]` (default client `dxos-smoke`), `ensure_user <username> <role> [htx_code]` (password `Smoke-Pass-1`, no required actions), `user_id <username>`.
- Produces routes: `/api/data/graphql` → `hasura:8080/v1/graphql`; `/api/workflow/*` → `n8n:5678/webhook/*`; `/api/ai/disease/*` → `disease-api:8000/*`; `/storage/*` → `minio:9000/*` (no auth plugin, S3 signs).
- Global plugins: `request-id`, `cors` (allow origin from env `DXOS_CORS_ORIGIN`, default `http://localhost:3000`), `limit-count` (`count: 300`, `time_window: 60`, key `remote_addr`). Protected routes: `openid-connect` with `bearer_only: true`, `use_jwks: true`, `discovery: http://keycloak:8080/realms/agrimarket/.well-known/openid-configuration`, `client_id: dxos-gateway`, `client_secret` from env (dummy accepted for bearer-only).

- [ ] **Step 1: Write the failing gateway checks**

```bash
for p in /api/data/graphql /api/workflow/ping /api/ai/disease/health; do
  assert_http 401 "no token -> 401 on $p" -- -X POST "$GATEWAY$p"
done
T=$(user_token manager_tc)
assert_http 401 "tampered token -> 401" -- -X POST -H "Authorization: Bearer ${T%?}x" "$GATEWAY/api/data/graphql"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"query":"{__typename}"}' "$GATEWAY/api/data/graphql")
[ "$code" != 401 ] && pass "valid token passes gateway ($code)" || fail "valid token rejected"
assert_http "200 204" "CORS preflight without token" -- -X OPTIONS -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: POST' "$GATEWAY/api/data/graphql"
```
(`ensure_user manager_tc manager TC` runs in the smoke setup section before these checks.)

- [ ] **Step 2: Run to verify it fails**

Run: `make platform-up && make platform-smoke`
Expected: FAIL `[gateway]` (connection refused on `:9080`).

- [ ] **Step 3: Implement config and routes**

If the valid-token check fails because the discovery document's `jwks_uri` uses `http://localhost:8080`, set `KC_HOSTNAME_STRICT_BACKCHANNEL: "false"` on Keycloak and re-test. If it still fails, stop and report to the owner with the discovery document and APISIX error log — do not switch to static keys or another auth plugin without approval.

- [ ] **Step 4: Verify**

Run: `make platform-smoke`
Expected: all `[gateway]` lines PASS; every response carries `X-Request-Id`.

- [ ] **Step 5: Commit**

`git commit -m "feat(platform): add APISIX gateway enforcing Keycloak JWT on core routes"`

---

### Task 5: Hasura read-only data API with row-level permissions

**Files:**
- Create: `platform/hasura/metadata/version.yaml` (`version: 3`), `databases/databases.yaml` (source `default`, URL from env `HASURA_GRAPHQL_DATABASE_URL`), `databases/default/tables/tables.yaml` and one `public_<table>.yaml` per exposed table
- Create: `platform/tests/fixtures/two-htx.sql`
- Modify: `docker/docker-compose.yml` (service `hasura`), `docker/.env.local.example` and `.env.example` (add `HASURA_GRAPHQL_ADMIN_SECRET=change_me_hasura_admin_secret`)
- Modify: `platform/tests/smoke-platform.sh` (section `[data]`)

**Interfaces:**
- Consumes: gateway route `/api/data/graphql` (Task 4), `tokens.sh`, `psql_app`.
- Produces: GraphQL root fields named after tables (`households`, `parcels`, `lots`, …) visible per role.
- Hasura env: `HASURA_GRAPHQL_ENABLE_CONSOLE=false`, `HASURA_GRAPHQL_DEV_MODE=false`, `HASURA_GRAPHQL_ADMIN_SECRET` from env, `HASURA_GRAPHQL_JWT_SECRET`:
```json
{"jwk_url":"http://keycloak:8080/realms/agrimarket/protocol/openid-connect/certs",
 "issuer":"http://localhost:8080/realms/agrimarket","audience":"dx-os-core",
 "claims_map":{"x-hasura-user-id":{"path":"$.sub"},
  "x-hasura-allowed-roles":{"path":"$.realm_access.roles"},
  "x-hasura-default-role":{"path":"$.dxos_default_role","default":"farmer"},
  "x-hasura-htx-code":{"path":"$.htx_code","default":""}}}
```
- Permissions: exactly the RLS table in spec §4.3 (select only, all columns); relationships `households.htx_profile`, `parcels.household`, `lots.htx_profile`, `lot_parcels.lot`, `lot_parcels.parcel`, and child tables `→ parcel`/`→ journal_entry` as needed for the filters. `partners` not tracked.

- [ ] **Step 1: Write the fixture and failing data checks**

`two-htx.sql` inserts HTX `TC` and `LB` (explicit `id`, `updated_at = now()`), households `hh_tc_1` (phone `0900000001`, TC), `hh_tc_2` (`0900000002`, TC), `hh_lb_1` (`0900000003`, LB), one parcel per household (`crop_type 'Chè Trung du'`, `area_ha 0.5`), one lot per HTX linked via `lot_parcels` to that HTX's first parcel. Setup links farmer: `psql_app "update households set keycloak_user_id='$(user_id farmer_tc)' where id='hh_tc_1'"`. Checks (all via `$GATEWAY/api/data/graphql`):
- `manager_tc` `{households{id}}` → ids exactly `hh_tc_1,hh_tc_2`.
- `manager_lb` same query → exactly `hh_lb_1`.
- `farmer_tc` `{households{id} parcels{household_id} lots{htx_profile_id}}` → only `hh_tc_1` and its parcel/lot.
- `manager_tc` with header `x-hasura-role: farmer` → `households` empty.
- `manager_tc` mutation `insert_households_one` → response has `errors`.
- `farmer_tc` `{__schema{types{name}}}` → no type named `partners`.
- Token from `user_token manager_tc dxos-noaud` (client without scope `dx-os-core`, created in setup via `ensure_client dxos-noaud roles,profile`) → response has `errors` mentioning JWT.

- [ ] **Step 2: Run to verify it fails**

Run: `make platform-up && make platform-smoke`
Expected: FAIL in `[data]` (`502` from gateway, Hasura absent).

- [ ] **Step 3: Implement service and metadata**

Smoke setup must run `npx prisma migrate deploy` (from `apps/web`, `DATABASE_URL` pointing to `localhost:5432`) before loading the fixture.

- [ ] **Step 4: Verify**

Run: `make platform-smoke`
Expected: all `[data]` PASS; earlier sections still PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat(platform): add read-only Hasura data API with HTX row-level permissions"`

---

### Task 6: Pin images, route n8n, ADR

**Files:**
- Modify: `docker/docker-compose.yml` (`n8nio/n8n:2.47.2`, `rhasspy/wyoming-piper:2.5.2`, `mattermost/mattermost-team-edition:12.1.0`)
- Create: `docs/adr/0001-n8n-workflow-engine.md`
- Modify: `platform/tests/smoke-platform.sh` (section `[pins]`)

- [ ] **Step 1: Write the failing pin check**

`[pins]`: `grep -nE 'image:\s*\S+:latest|image:\s*[^:[:space:]]+\s*$' docker/docker-compose.yml` must print nothing → `pass "no unpinned images"`.

- [ ] **Step 2: Run to verify it fails**

Run: `make platform-smoke` → FAIL listing `n8n`, `piper`, `mattermost` lines.

- [ ] **Step 3: Pin and write the ADR**

ADR sections: Context (exam mandates a Workflow engine; exam reference stack lists n8n; 10 workflows exist), Decision (n8n 2.47.2 as Tier-1 workflow engine), License (Sustainable Use License, not OSI; runs as a separate network service, no code linked or bundled), Consequences, Exit path (Kestra, Apache-2.0).

- [ ] **Step 4: Verify**

Run: `make platform-smoke` → `[pins]` PASS; `docker compose -f docker/docker-compose.yml config -q` exits 0.

- [ ] **Step 5: Commit**

`git commit -m "chore(platform): pin remaining images and record n8n ADR"`

---

### Task 7: CI job, release override, docs

**Files:**
- Modify: `.github/workflows/ci.yml` (append job `platform-smoke`; existing jobs untouched)
- Modify: `docker/docker-compose.release.yml` (`ports: !reset []` for `postgres`, `n8n`, `seaweedfs`, `piper`; service `migrate` with profile `tools`)
- Modify: `scripts/package-release.sh` (add `platform` to `BUNDLE_PATHS`)
- Modify: `README.md` (Tier 1 section: `make platform-up`, gateway `:9080`, dev reset notes: recreate Postgres volume or `REINDEX DATABASE agrimarket;`, recreate Keycloak realm, old MinIO data not migrated), `CHANGELOG.md` (`[Unreleased]`)

- [ ] **Step 1: Add the CI job**

Job `platform-smoke` (`needs: [lint]`): checkout, setup Node 20 + `npm ci` in `apps/web`, copy env examples, `make platform-up`, `python3 -m unittest platform/tests/test_realm_policy.py`, `make platform-smoke`, on failure dump `docker compose logs`.

- [ ] **Step 2: Verify locally and lint**

Run: `actionlint && make platform-smoke && D=$(mktemp -d) && bash scripts/package-release.sh 0.0.0-test "$D" && tar -tzf "$D/opentea-dx-os-0.0.0-test.tar.gz" | grep -c '^opentea-dx-os-0.0.0-test/platform/'`
Expected: actionlint clean; smoke PASS; platform file count > 0.

- [ ] **Step 3: Verify the release override**

In an extracted bundle: `OPENTEA_VERSION=x docker compose -f docker/docker-compose.yml -f docker/docker-compose.release.yml config --format json` → only `apisix`, `web`, `keycloak` publish host ports; `migrate` present under profile `tools`.

- [ ] **Step 4: Commit**

`git commit -m "ci(platform): add Tier 1 platform smoke job and release wiring"`

- [ ] **Step 5: Push for CI (owner approval required)**

Ask the owner, then push; all 9 CI jobs must be green before tagging `v1.3.0` through the existing release flow.
