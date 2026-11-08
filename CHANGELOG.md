# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **File quarantine**: ClamAV (`clamav`) and the `dxos-scanner` service scan new objects in `agrimarket-docs` and `agrimarket-private`; infected or unscannable (> 50 MiB) objects are copied to `dxos-quarantine/<bucket>/<key>` and removed, with verdicts in `audit.file_scans`. The scanner image is published to GHCR as `opentea-dx-os-scanner`
- **Audit log**: hash-chained, append-only `audit.events` fed by row triggers on 9 business tables; verify with `select * from audit.verify_chain()`

### Changed
- **Deploy order**: `postgres` -> `platform-init` -> `migrate` -> `platform-init` (attaches audit triggers to the migrated tables) -> the rest
- **SeaweedFS** starts with `-volume.max=100`

### Fixed
- **SeaweedFS**: a PUT to a second bucket returned HTTP 500 (default limit of 8 volumes, 7 per bucket)

### Upgrade notes
- Rebuild the postgres image and re-run `platform-init` after `prisma migrate deploy`; recreate the `seaweedfs` container.

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

[Unreleased]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v1.3.0...HEAD
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
