# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [1.6.0] - 2026-11-10

### Added
- **Identity-aware core access**: the web app keeps the Keycloak access and refresh tokens server-side in the encrypted session cookie and refreshes them in the middleware when under 30 seconds remain; a failed refresh sends the user to `/login`. `/api/auth/session` exposes neither token
- **Tenant isolation**: `requireTenant()` resolves the caller's HTX from the `htx_code` claim, answering 403 `NO_HTX` when it is missing or unknown; `TenantGuard` answers 404 before any write by ID on a record of another HTX. Notifications sent to a whole HTX now carry `htx_profile_id`
- **Gateway read adapters**: parcels, households, lots, journal entries and disease reports are read through Hasura with the user's token. A core outage gives 503 `CORE_UNAVAILABLE` and a Vietnamese error page, never a fallback to Prisma
- **Internal gateway port `9081`** for the `web` container: not limited per IP, JWT and permissions as on `9080`
- **Browser test** `tests/e2e/tenant/core-tenant.spec.ts` (`E2E_CORE=1`), run in the `platform-smoke` CI job against a real `web` container and real Keycloak: isolation between two HTXs, no token in the session endpoint, a live refresh of an expired token, and a Hasura outage

### Changed
- **Disease detection and the local LLM** go through the gateway with the user's token; the Groq path is unchanged when a key is set. The LLM route is limited per bearer token
- **Sessions**: `ssoSessionIdleTimeout` and `ssoSessionMaxLifespan` are 8 hours, matching the app session
- **Accounts**: registration and invitations write `htx_code`; invited managers and officers must set up TOTP (#18)
- **`docker/.env.local.example`, `.env.example`**: removed `DISEASE_API_URL` and `OLLAMA_BASE_URL`, which no service reads. `docker/.env.local.example` also drops the `KEYCLOAK_ISSUER` that Compose overrides and adds `AUTH_URL`; `.env.example` has no `AUTH_URL`
- **Documents are namespaced by HTX**: keys are `para/<htxCode>/...`. The list, URL and upload routes derive the namespace from the session and answer 404 for anything outside it, including `..` traversal; `certificate_keys` outside it answer 400. The one exception is `para/Archives/Market_Reports/`, written by the n8n workflow and holding no tenant data: the list and URL routes may read it, and the document screen shows it without upload

### Fixed
- **Migration drift** (#7): migrations now produce the database described by `schema.prisma`, without dropping any column
- **Login from the Docker image**: `web` built the `redirect_uri` from `HOSTNAME` (`0.0.0.0`) and Keycloak refused it; Compose now sets `AUTH_URL`
- **Account attributes**: Keycloak 24 silently dropped `fullName`, `phone` and `htxId`; the realm now declares them as admin-only
- **HTX assumed to be the first one**: every `htxProfile.findFirst()` now reads the caller's HTX
- **Cross-HTX reads**: `schedule/harvest`, `schedule/unscheduled`, `weather/forecast` and the officer soil-health page returned data of every HTX; they now filter by the caller's HTX
- **Role frozen at sign-in**: the role is read again from each refreshed access token, and is cleared when no recognised role remains
- **Keycloak admin credentials on a release**: the web app also reads `KEYCLOAK_ADMIN` and `KEYCLOAK_ADMIN_PASSWORD`, and refuses to fall back to `admin/admin` in production
- **Self-registration**: the middleware no longer answers 401 to the anonymous `POST /api/register`; new accounts stay disabled until a manager approves them
- **Pre-upgrade sessions**: in production a session without a refresh token goes to login instead of showing the no-HTX notice
- **Silent load failures**: the officer journal approval and manager farm-zone screens now say when loading failed
- **Anonymous `POST /api/register`**: limited to 5 requests per IP per 10 minutes (429), and anything other than a validation error answers a generic message instead of the raw error text
- **Rejected registrations**: the household is unlinked before the Keycloak account is deleted, so a failed unlink can be retried and never leaves the phone taken
- **Object keys from clients**: `POST /api/journal` answers 400 for a `photo_minio_key` outside the caller's document root, and the journal list signs a stored key only when it is inside that root; other entries come back without a photo. The public certificate route signs a key only inside the document root of the lot's HTX

### Upgrade notes
- Run `migrate` (two new migrations: `20261109120000_sync_schema_drift` and `20261109130000_notifications_htx`), then `platform-init`, as in the deploy section.
- On a running release, after `up -d --no-build` run `docker compose --env-file docker/.env.local -f docker/docker-compose.yml -f docker/docker-compose.release.yml restart hasura apisix`. Their compose config is unchanged, so they are not recreated: APISIX keeps listening on 9080 only and Hasura lacks the new relationships, and every list answers 503.
- Keycloak imports the realm only on a new database. On a running realm, set **SSO Session Idle** and **SSO Session Max** to 8 hours (Realm settings > Sessions) and declare `fullName`, `phone` and `htxId` as admin-only attributes (Realm settings > User profile).
- Assign the `htx_code` attribute to existing accounts in Keycloak, or they receive `NO_HTX`.
- Old notifications with neither a recipient nor an HTX are no longer shown; n8n system alerts remain visible.
- Rows with a null `htx_profile_id` (households, lots) become invisible and unwritable and must be assigned to an HTX (see `scripts/backfill-htx-profile-id.sql`).
- Documents written before this release stay under `para/Projects/`, `para/Areas/`, `para/Resources/` and `para/Archives/`. They are no longer listed and are not moved automatically; copy them to `para/<htxCode>/...` to use them again.
- Certificates of exported lots whose keys are outside `para/<htxCode>/` of the lot's HTX now answer 403 on the public page, and such journal photos stop showing. Copy the object into that folder and update the key to use it again.
- Set `KEYCLOAK_ADMIN` as well as `KEYCLOAK_ADMIN_PASSWORD` in `docker/.env.local`, or the admin routes answer 500 in production.
- Set `AUTH_URL` in `docker/.env.local` when the web app is not served from `http://localhost:3000`, and add that URL to the redirect URIs of the `nextjs-web` client.
- Known limits: `9081` must stay unpublished, because it is not rate limited per IP; `workflows/mattermost-push.json` posts disease and harvest events of all HTXs to one webhook; in production, pre-upgrade cookies go to login; `/api/dev-login` cookies carry no access token, so core reads fail closed; the write path is protected in the application, not in the database; the `POST /api/register` limit is per process and trusts `X-Forwarded-For`, clients behind one proxy or NAT share it and a value that is not a valid IP goes to one shared `unknown` bucket, so it must move to the gateway or a shared store when `web` runs more than one instance.

---

## [1.5.0] - 2026-11-09

### Added
- **MQTT sensor ingest**: `mosquitto` (no host port, per-HTX device accounts restricted to their own topics) and `dxos-ingest` validate every message and store it in `telemetry.sensor_readings`; rejected messages are kept with a reason in `telemetry.ingest_rejects`. `dxos-simulator` (profile `demo`) publishes demo readings
- **Data lifecycle and lineage**: `dxos-lifecycle` moves readings older than 30 days to Parquet (ZSTD) in the `dxos-lake` bucket in whole UTC days (the cutoff is floored to midnight UTC, so a row can stay hot for up to about one extra day), verifies SHA-256 and row count before deleting the hot rows, and records each export in `telemetry.lifecycle_runs` and `audit.events`. `python -m dxos_dataops query` reads the cold data through the `sensor_readings_cold` view. Hasura exposes both telemetry tables to managers and officers (scoped by `htx_code`)
- **In-house LLM**: `ollama` serves `qwen2.5:0.5b` (Apache-2.0) behind the gateway at `POST /api/ai/llm/v1/chat/completions` (JWT with the `dx-os-core` audience, 30 requests per minute); the Ollama management API is not routed. `ollama-init` pulls the model and checks its ID
- **Dataops image**: published to GHCR as `opentea-dx-os-dataops` (6 images per release with `migrate`); CI runs the dataops unit tests
- **Dependencies**: Mosquitto (EPL-2.0), Ollama (MIT), `paho-mqtt` (EPL-2.0 OR BSD-3-Clause), `duckdb` (MIT)

### Changed
- **Deploy order**: `postgres` -> `platform-init` -> `migrate` -> `platform-init` -> the rest -> `ollama-init`. `make platform-up` runs it end to end, and the release flow is identical (`--profile tools run --rm ollama-init` last)
- **`migrate`** moved into `docker/docker-compose.yml` (profile `tools`), so the same service is used in dev and release

### Fixed
- **Hasura started before migrations** (#17): it is no longer restarted by the smoke test; `platform-up` migrates first
- **Prebuilt `migrate` image** (#15): `apps/web/prisma/Dockerfile` ships `prisma@5.22.0`, the schema and the migrations; the entrypoint URL-encodes `POSTGRES_PASSWORD` when it builds `DATABASE_URL`
- **LLM smoke check** retries on HTTP 429 and reports failures instead of exiting silently

### Upgrade notes
- Add `DXOS_MQTT_DEVICES` (comma list of `HTX_CODE:password`) and `DXOS_MQTT_INGEST_PASSWORD` to `docker/.env.local` (see `docker/.env.local.example`). The release override makes the broker refuse to start while any of these passwords begins with `change_me`.
- Re-run `migrate` and `platform-init` (the postgres image gains `04-telemetry.sql`); create the `mosquitto`, `dxos-ingest`, `dxos-lifecycle` and `ollama` containers, then run `--profile tools run --rm ollama-init`.
- Release flow: every `docker compose` command now takes `--env-file docker/.env.local` before `-f`; without it Compose used the defaults published in this repo. SeaweedFS refuses to start while `MINIO_ACCESS_KEY` or `MINIO_SECRET_KEY` is empty or a placeholder, and Keycloak refuses to start while `KEYCLOAK_ADMIN_PASSWORD` is empty, `admin` or begins with `change_me`. Keycloak reads that value only on a new database, so on a running system also change the admin password inside Keycloak. On existing volumes, `POSTGRES_PASSWORD`, `KEYCLOAK_DB_PASSWORD` and `N8N_ENCRYPTION_KEY` in that file must match the values the volumes were initialised with (until now the `docker-compose.yml` defaults).
- On a running release stack, restart `hasura` and `apisix` after `up -d --no-build` (`docker compose --env-file docker/.env.local -f docker/docker-compose.yml -f docker/docker-compose.release.yml restart hasura apisix`): Hasura loads metadata only at start and APISIX keeps the old inode of its route file. `make platform-up` does this in dev when the stack is already running.
- Known limits: the cold view keeps the first-ingested copy of a duplicated key; Mosquitto saves its state every 60 seconds (`autosave_interval 60`), so messages queued in the last 60 seconds can be lost if the broker crashes; a cold `make platform-up` is slow because of the Ollama image and the 397 MB model pull; `dxos-ingest` and `dxos-lifecycle` share the `agrimarket` database account (a least-privilege role is Tier 2).

---

## [1.4.0] - 2026-11-09

### Added
- **File quarantine**: ClamAV (`clamav`) and the `dxos-scanner` service scan new objects in `agrimarket-docs` and `agrimarket-private`; infected or unscannable (> 50 MiB) objects are copied to `dxos-quarantine/<bucket>/<key>` and removed, with verdicts in `audit.file_scans`. The scanner image is published to GHCR as `opentea-dx-os-scanner`
- **Audit log**: hash-chained, append-only `audit.events` fed by row triggers on 9 business tables; verify with `select * from audit.verify_chain()`

### Security
- **ClamAV fails closed on archives**: encrypted archives and archives exceeding a scan limit (nesting depth, size, scan time 25 s) are reported as `FOUND` and quarantined instead of `OK`. Encrypted documents (for example password-protected PDFs) are still allowed
- **Scanner re-scans replaced objects**: a `clean` row is only trusted while the object's `LastModified` is unchanged, so an MD5 (etag) collision cannot hide a replacement; the source object is removed only if its etag still equals the scanned one
- **Audit chain head** can only advance; `verify_chain()` proves chain integrity, not capture coverage (a superuser can disable triggers)

### Changed
- **Deploy order**: `postgres` -> `platform-init` -> `migrate` -> `platform-init` (attaches audit triggers to the migrated tables) -> the rest
- **SeaweedFS** starts with `-volume.max=100`

### Fixed
- **SeaweedFS**: a PUT to a second bucket returned HTTP 500 (default limit of 8 volumes, 7 per bucket)

### Upgrade notes
- Re-run `platform-init` after `prisma migrate deploy` (the postgres image did not change); recreate the `seaweedfs`, `clamav` and `dxos-scanner` containers.
- On an upgraded stack, existing objects over 50 MiB in the watched buckets are moved to `dxos-quarantine` during the first scan rounds.

---

## [1.3.0] - 2026-11-08

### Added
- **Contribution tooling**: Bilingual issue templates (bug report, feature request), pull request template and `SECURITY.md` with a private vulnerability reporting policy
- **Tier 1 API gateway**: APISIX on `:9080` with JWT validation for `/api/data/graphql`, `/api/workflow/*` and `/api/ai/disease/*`
- **Hasura data API**: read-only GraphQL with row-level permissions scoped by the `htx_code` claim
- **PostGIS and pgvector**: the Postgres image now ships both extensions and is published to GHCR as `opentea-dx-os-postgres`
- **Platform smoke CI job**: `make platform-up` + `make platform-smoke` run in CI (`platform-smoke`)
- **Release `migrate` service**: `--profile tools run --rm migrate` applies Prisma migrations inside the compose network

### Security
- **Gateway**: strips the client-supplied `x-hasura-admin-secret` header on the GraphQL route (it previously let any authenticated user act as Hasura admin); `/api/workflow/*` and `/api/ai/disease/*` now require the `dx-os-core` audience
- **Release override**: Hasura refuses to start while `HASURA_GRAPHQL_ADMIN_SECRET` is empty or a `change_me*` placeholder

### Changed
- **Gateway CORS**: allows the `x-hasura-role` request header and exposes `X-Request-Id`
- **Release ports**: SeaweedFS S3 `:9000` stays published (browsers use presigned URLs on it) until storage moves behind the gateway
- **Hasura JWT issuer** is configurable through `KC_PUBLIC_ISSUER`
- **Object storage**: MinIO replaced by SeaweedFS S3 on `:9000` (network alias `minio` kept)
- **Keycloak**: TOTP required for staff, tokens carry the `dx-os-core` audience and the admin-only `htx_code` claim; the `nextjs-web` password grant is disabled
- **n8n**: tables moved to the Postgres schema `n8n`
- **Images**: all service images are pinned to exact tags
- **Release override**: only `apisix:9080`, `web:3000`, `keycloak:8080` and SeaweedFS `:9000` publish host ports; deploy order is postgres, `platform-init`, `migrate`, then the rest

### Upgrade notes
- Dev environments: recreate the Postgres volume (or run `REINDEX DATABASE agrimarket;` after the alpine to bookworm switch), recreate the Keycloak realm (it is imported only on a fresh database), run `docker compose down --remove-orphans`, and (dev only — never on production data) `docker compose down -v` once for n8n. MinIO data is not migrated to SeaweedFS.

---

## [1.2.0] - 2026-11-08

### Added
- **Tag-driven release pipeline**: Pushing a `vX.Y.Z` tag runs the full CI quality gate, publishes versioned `web` and `api` images to GHCR and creates a GitHub Release with CHANGELOG notes and a deployment bundle
- **Release compose override**: `docker/docker-compose.release.yml` runs `web` and `disease-api` from prebuilt GHCR images instead of building from source
- **Container images on GHCR**: `web` and `api` images are published to GitHub Container Registry
- **Build-from-source guide and dependency register**: Documented building without Docker and added `DEPENDENCIES.md` with third-party licenses

### Changed
- **Project identity**: Renamed the project to OpenTea DX-OS; copyright, contacts and repository links now point to OpenTea Developers
- **README**: Rewritten with an architecture diagram, feature overview, setup, testing, release and documentation sections
- **Docker edge images**: `docker-publish.yml` now publishes `edge` and `sha-<commit>` images only after the CI Quality Gate passes on `main`, using lowercase GHCR image names
- **License headers**: Added MIT license headers to remaining source files

### Removed
- **BMAD tooling**: Removed `.agent/`, `.agents/`, `_bmad/`, `_bmad-output/` and `docs/bmad-workflow-guide.md`; project rules now live in the root `AGENTS.md`

### Fixed
- **Hexagonal architecture**: Resolved layer-boundary violations reported in code review
- **Use case tests**: Fixed TypeScript errors caused by newly injected dependencies
- **Git ignore rules**: Rewrote a UTF-16 encoded `*.tar.gz` entry that made git ignore every new file

---

## [1.1.0] - 2026-09-15

### Added
- **Harvest Schedule Calendar**: Interactive calendar for scheduling and viewing expected harvest dates
- **Vietnamese Localization (Auth)**: Translated Keycloak login interface labels to Vietnamese for farmers
- **Soil Health Dashboard**: Soil analysis and pest risk visualization with interactive charts
- **Docker Publish CI**: Automated Docker image publishing to GitHub Container Registry (GHCR)

### Changed
- Streamlined user onboarding: removed mandatory email requirement for agricultural profiles
- Improved QR traceability public page with snapshot immutability and safety guards

### Fixed
- NextAuth TypeScript compilation issues with generic Route Handlers
- Leaflet SSR hydration mismatches in Map components

---

## [1.0.0] - 2026-09-15

### Added
- **Farm Zone Map**: GIS mapping with Leaflet.js for digitizing agricultural parcels
- **Smart Journal**: Farming log tracking with approval workflow and withdrawal days calculation
- **QR Lot Traceability**: Full lifecycle tracking from seed to harvest with public QR pages
- **Disease AI Assistant**: Computer vision for crop disease diagnosis via FastAPI
- **Audio Bulletin**: Automated agricultural news synthesis via n8n and Piper TTS
- **Market Chatbot**: LLM-powered market intelligence assistant (Groq Llama-3.1)
- **Keycloak SSO**: Role-based authentication (Manager/Officer/Farmer)
- **n8n Data Pipelines**: Automated FAOSTAT, Open-Meteo, Frankfurter FX, NASA POWER data sync
- **CI/CD Pipeline**: GitHub Actions with lint, test, build, Docker smoke test
- **DEPENDENCIES.md**: Full third-party library listing with license information
- **CODE_OF_CONDUCT.md** and **CONTRIBUTING.md** for open-source community

### Security
- All API routes protected with server-side auth checks (getServerSession)
- MinIO access via pre-signed URLs only (no client-side SDK exposure)

---


## [0.1.0-alpha] - 2026-08-11

### Added
- **Hexagonal Architecture scaffold** — Domain / Application / Infrastructure / Presentation layers with sample profile slice (#91)
- **Hybrid AI architecture** — Migration to Groq cloud API with Ollama local fallback (#52)
- **PR Deep Review skill** — Adversarial code review automation for CI

### Fixed
- CI: restore package-lock.json, add Zod dependency
- CI: remove BOM from package.json causing Prisma generate JSON parse error
- Remove redundant `CREATE DATABASE agrimarket` to fix CI pipeline

---

## [0.0.4-alpha] - 2026-08-10

### Added
- **Design System** — CSS custom properties (design tokens), Google Fonts integration (#89)
- **Shared UI components** — Button, Badge, Card, Modal, Skeleton with CSS Modules
- **Layout shell** — AppShell, Sidebar, TopBar, BottomNav responsive components
- **Unit tests** — Jest config + tests for tokens, Button, Badge, Skeleton, Sidebar

### Changed
- Refactored design system components based on code review findings

### Fixed
- CI: resolve lint, build, and docker-compose errors

---

## [0.0.3-alpha] - 2026-08-08

### Added
- **n8n data pipelines** — FAOSTAT commodity sync, Open-Meteo weather cache, Frankfurter FX rates, market bulletin generation (#87)
- CI/CD workflow for n8n JSON linting
- HTX profile and Lot public pages

---

## [0.0.2-alpha] - 2026-08-06

### Added
- **Full Prisma schema** — All 15+ tables with JSONB multi-currency support (#86)
- **Keycloak SSO integration** — NextAuth.js v5 + Keycloak OIDC with role-based routing (Manager/Officer/Farmer) (#84)

### Fixed
- Auth: correct relative import paths, remove unused variables
- Routing: remove route groups for role directories to fix build conflict
- CI: update env validation, use `npm install` for cross-platform lockfile

---

## [0.0.1-alpha] - 2026-08-04

### Added
- **Monorepo structure** — `apps/web` (Next.js 14) + `apps/disease-api` (FastAPI)
- **Docker Compose stack** — PostgreSQL 16, Keycloak 24, n8n, Piper TTS, MinIO, Disease API
- CI/CD pipeline (GitHub Actions) — Lint, build, Docker smoke test
- Environment validation script (`scripts/validate-env.sh`)
- Structure validation script (`scripts/validate-structure.sh`)

### Fixed
- Add missing `public/` directory for Next.js Docker build
- Docker Compose healthchecks and initial Next.js page

---

## [0.0.0] - 2026-07-09

### Added
- Initial project scaffold
- Business Analysis Document (BA) with HPDI architecture
- MIT License
- BMAD Method AI-Native Agile framework initialization
- Story splitting, testing strategy, and dependency mapping for Epics 1–6
- Complete project documentation (PRD, Architecture Spine, UX Design, API Contract)

---

> **Ghi chú:** Dự án DX-AgriMarket đang trong giai đoạn phát triển ban đầu (pre-release).
> Phiên bản đầu tiên sẽ chính thức được đánh số **v1.0.0** khi hệ thống được triển khai
> hoàn chỉnh với đầy đủ các tính năng MVP theo PRD.

[Unreleased]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.6.0
[1.5.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.5.0
[1.4.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.4.0
[1.3.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.3.0
[1.2.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.2.0
[1.1.0]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v0.1.0-alpha...v1.0.0
[0.1.0-alpha]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v0.0.4-alpha...v0.1.0-alpha
[0.0.4-alpha]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v0.0.3-alpha...v0.0.4-alpha
[0.0.3-alpha]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v0.0.2-alpha...v0.0.3-alpha
[0.0.2-alpha]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v0.0.1-alpha...v0.0.2-alpha
[0.0.1-alpha]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v0.0.0...v0.0.1-alpha
[0.0.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v0.0.0
