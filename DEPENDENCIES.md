# Dependencies — OPEN DX-AGRIMARKET

This document lists all third-party libraries and services used in the project,
along with their licenses, to ensure full transparency and license compliance.

> **Project License:** MIT License

---

## Web Application (`apps/web`)

### Runtime Dependencies

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [next](https://github.com/vercel/next.js) | 14.2.5 | MIT | React framework for full-stack web |
| [react](https://github.com/facebook/react) | ^18 | MIT | UI component library |
| [react-dom](https://github.com/facebook/react) | ^18 | MIT | React DOM renderer |
| [next-auth](https://github.com/nextauthjs/next-auth) | 5.0.0-beta.32 | ISC | Authentication (Keycloak OIDC) |
| [@prisma/client](https://github.com/prisma/prisma) | ^5.18.0 | Apache-2.0 | Database ORM client |
| [zod](https://github.com/colinhacks/zod) | ^3.23.8 | MIT | Schema validation |
| [leaflet](https://github.com/Leaflet/Leaflet) | ^1.9.4 | BSD-2-Clause | Interactive GIS maps |
| [@geoman-io/leaflet-geoman-free](https://github.com/geoman-io/leaflet-geoman) | ^2.20.0 | MIT | Leaflet geometry editing |
| [leaflet-geosearch](https://github.com/smeijer/leaflet-geosearch) | ^4.4.0 | MIT | Address/location search |
| [@turf/area](https://github.com/Turfjs/turf) | ^7.4.0 | MIT | Geographic area calculation |
| [@turf/helpers](https://github.com/Turfjs/turf) | ^7.4.0 | MIT | GeoJSON utilities |
| [lucide-react](https://github.com/lucide-icons/lucide) | ^1.31.0 | ISC | SVG icon library |
| [react-hook-form](https://github.com/react-hook-form/react-hook-form) | ^7.85.0 | MIT | Form state management |
| [@hookform/resolvers](https://github.com/react-hook-form/resolvers) | ^5.7.1 | MIT | Zod resolver for react-hook-form |
| [recharts](https://github.com/recharts/recharts) | ^3.10.1 | MIT | Data visualization charts |
| [swr](https://github.com/vercel/swr) | ^2.5.1 | MIT | React data fetching |
| [sonner](https://github.com/emilkowalski/sonner) | ^2.0.8 | MIT | Toast notifications |
| [react-markdown](https://github.com/remarkjs/react-markdown) | ^10.1.0 | MIT | Markdown renderer |
| [remark-gfm](https://github.com/remarkjs/remark-gfm) | ^4.0.1 | MIT | GitHub-flavored markdown |
| [remark-breaks](https://github.com/remarkjs/remark-breaks) | ^4.0.0 | MIT | Hard line breaks in markdown |
| [remove-markdown](https://github.com/stiang/remove-markdown) | ^0.6.4 | MIT | Strip markdown formatting |
| [openai](https://github.com/openai/openai-node) | ^7.5.0 | Apache-2.0 | LLM API client (Groq-compatible) |
| [qrcode](https://github.com/soldair/node-qrcode) | ^1.5.4 | MIT | QR code generation |
| [minio](https://github.com/minio/minio-js) | ^8.0.7 | Apache-2.0 | S3-compatible object storage client |
| [focus-trap-react](https://github.com/focus-trap/focus-trap-react) | ^12.0.3 | MIT | Accessible focus trapping |
| [idb-keyval](https://github.com/nicolo-ribaudo/idb-keyval) | ^6.3.0 | Apache-2.0 | IndexedDB key-value store |
| [@ducanh2912/next-pwa](https://github.com/nicolo-ribaudo/next-pwa) | ^10.2.9 | MIT | Progressive Web App support |

### Development Dependencies

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [typescript](https://github.com/microsoft/TypeScript) | ^5 | Apache-2.0 | Type-safe JavaScript |
| [tailwindcss](https://github.com/tailwindlabs/tailwindcss) | ^4.3.3 | MIT | Utility-first CSS framework |
| [@tailwindcss/postcss](https://github.com/tailwindlabs/tailwindcss) | ^4.3.3 | MIT | PostCSS plugin for Tailwind |
| [postcss](https://github.com/postcss/postcss) | ^8.5.26 | MIT | CSS transformer |
| [eslint](https://github.com/eslint/eslint) | ^8 | MIT | JavaScript linter |
| [eslint-config-next](https://github.com/vercel/next.js) | 14.2.5 | MIT | Next.js ESLint configuration |
| [prisma](https://github.com/prisma/prisma) | ^5.18.0 | Apache-2.0 | Database schema management |
| [jest](https://github.com/jestjs/jest) | ^30.4.2 | MIT | Testing framework |
| [jest-environment-jsdom](https://github.com/jestjs/jest) | ^30.4.1 | MIT | DOM environment for Jest |
| [ts-jest](https://github.com/kulshekhar/ts-jest) | ^29.4.12 | MIT | TypeScript preprocessor for Jest |
| [@testing-library/react](https://github.com/testing-library/react-testing-library) | ^16.3.2 | MIT | React component testing |
| [@testing-library/jest-dom](https://github.com/testing-library/jest-dom) | ^7.0.1 | MIT | Custom DOM matchers for Jest |
| [@testing-library/user-event](https://github.com/testing-library/user-event) | ^14.6.3 | MIT | User interaction simulation |
| [@playwright/test](https://github.com/microsoft/playwright) | ^1.62.1 | Apache-2.0 | End-to-end browser testing |
| [cross-env](https://github.com/kentcdodds/cross-env) | ^10.1.0 | MIT | Cross-platform env vars |
| [dotenv](https://github.com/motdotla/dotenv) | ^17.4.2 | BSD-2-Clause | Environment variable loading |
| [ts-node](https://github.com/TypeStrong/ts-node) | ^10.9.2 | MIT | TypeScript execution |
| [identity-obj-proxy](https://github.com/keyz/identity-obj-proxy) | ^3.0.0 | MIT | CSS module mocking for tests |
| [tw-animate-css](https://github.com/tailwindlabs/tailwindcss) | ^1.4.0 | MIT | Tailwind animation utilities |

---

## Disease Detection API (`apps/disease-api`)

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [fastapi](https://github.com/tiangolo/fastapi) | 0.162.2 | MIT | Python web framework |
| [uvicorn](https://github.com/encode/uvicorn) | 0.54.0 | BSD-3-Clause | ASGI server |
| [python-multipart](https://github.com/andrew-d/python-multipart) | 0.0.33 | Apache-2.0 | File upload support |
| [Pillow](https://github.com/python-pillow/Pillow) | 13.0.0 | MIT-CMU | Image processing |
| [numpy](https://github.com/numpy/numpy) | 2.4.6 | BSD-3-Clause | Numerical computation |
| [tensorflow](https://github.com/tensorflow/tensorflow) | 2.21.0 | Apache-2.0 | Machine learning inference (wheels for Linux arm64 and x86_64) |
| [keras](https://github.com/keras-team/keras) | 3.15.1 | Apache-2.0 | Model loading (pulled by tensorflow, pinned) |
| pytest, httpx2 (`requirements-dev.txt`; httpx2 is the test client Starlette 1.10 requires) | 9.1.1, 2.16.0 | MIT, BSD-3-Clause | Disease API tests |

---

## Tea model training (`ai-models/tea`, not shipped)

Pinned in `ai-models/tea/requirements.txt`; used only to retrain `ai-models/tea_leaf_model.keras`. The MobileNetV2
ImageNet weights it downloads are credited in `ai-models/ATTRIBUTION.md`.

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [tensorflow](https://github.com/tensorflow/tensorflow) | 2.21.0 | Apache-2.0 | Model training (same version as the disease API) |
| [keras](https://github.com/keras-team/keras) | 3.15.1 | Apache-2.0 | Model definition, MobileNetV2 transfer learning |
| [numpy](https://github.com/numpy/numpy) | 2.4.6 | BSD-3-Clause | Numerical computation |
| [Pillow](https://github.com/python-pillow/Pillow) | 13.0.0 | MIT-CMU | Image decoding and resizing (same as the disease API) |

---

## Infrastructure Services (Docker Compose)

| Service | Image | License | Purpose |
|---------|-------|---------|---------|
| PostgreSQL | `postgres:16.14-bookworm` (built in `platform/postgres`) | PostgreSQL License (OSI) | Relational database |
| PostGIS | 3.7.0, installed in the PostgreSQL image (PGDG) | GPL-2.0-or-later | Geospatial extension |
| pgvector | 0.8.7, installed in the PostgreSQL image (PGDG) | PostgreSQL License (OSI) | Vector similarity extension |
| Keycloak | `quay.io/keycloak/keycloak:24.0.5` | Apache-2.0 | Identity & Access Management |
| APISIX | `apache/apisix:3.19.0-debian` | Apache-2.0 | API gateway |
| Hasura | `hasura/graphql-engine:v2.51.4.cli-migrations-v3` | Apache-2.0 | Read-only GraphQL data API |
| n8n | `n8nio/n8n:2.47.2` | Sustainable Use License* | Workflow automation |
| SeaweedFS | `chrislusf/seaweedfs:4.50` | Apache-2.0 | S3-compatible object storage (replaces MinIO); started with `-volume.max=100` so more than one bucket fits |
| ClamAV | `clamav/clamav-debian:1.4.6` | GPL-2.0 | Antivirus daemon (network service, not linked) |
| Python | `python:3.12.15-slim-bookworm` | PSF | Base image of `dxos-scanner`, `dxos-dataops` and `dxos-cli`, and of `ai-models/tea` training (not a Compose service) |
| Mosquitto | `eclipse-mosquitto:2.1.2-alpine` | EPL-2.0 | MQTT broker (network service, not linked) |
| Ollama | `ollama/ollama:0.40.15` | MIT | Local LLM runtime (network service, no host port) |
| qwen2.5:0.5b | pulled by `ollama-init`, pinned by digest ID | Apache-2.0 | Default in-house LLM (model weights, not bundled in any image) |
| Piper TTS | `rhasspy/wyoming-piper:2.5.2` | MIT | Text-to-Speech engine |
| Mattermost | `mattermost/mattermost-team-edition:12.1.0` | MIT (Team Edition) | Team communication |

### File scanner (`platform/scanner`)

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [minio](https://github.com/minio/minio-py) | 7.2.20 | Apache-2.0 | S3 client |
| [psycopg[binary]](https://github.com/psycopg/psycopg) | 3.3.6 | LGPL-3.0 | PostgreSQL driver (dynamically linked, unmodified) |
| [pytest](https://github.com/pytest-dev/pytest) | 9.1.1 | MIT | Unit tests (dev only) |

### Data pipeline (`platform/dataops`)

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [paho-mqtt](https://github.com/eclipse-paho/paho.mqtt.python) | 2.2.0 | EPL-2.0 OR BSD-3-Clause | MQTT client |
| [duckdb](https://github.com/duckdb/duckdb) | 2.0.0 | MIT | Parquet writer and cold-lake query engine |
| [minio](https://github.com/minio/minio-py) | 7.2.20 | Apache-2.0 | S3 client |
| [psycopg[binary]](https://github.com/psycopg/psycopg) | 3.3.6 | LGPL-3.0 | PostgreSQL driver (dynamically linked, unmodified) |
| [pytest](https://github.com/pytest-dev/pytest) | 9.1.1 | MIT | Unit tests (dev only) |

### Mini-app CLI (`platform/cli`)

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [PyYAML](https://github.com/yaml/pyyaml) | 6.0.3 | MIT | Reads `app.yaml` manifests |
| [jsonschema](https://github.com/python-jsonschema/jsonschema) | 4.26.0 | MIT | Validates manifests against `platform/apps/manifest.schema.json` |
| [psycopg[binary]](https://github.com/psycopg/psycopg) | 3.3.6 | LGPL-3.0 | PostgreSQL driver for `platform.installed_apps` (dynamically linked, unmodified) |
| [pytest](https://github.com/pytest-dev/pytest) | 9.1.1 | MIT | Unit tests (dev only) |

### Mini-app `tea-tour` (`miniapps/tea-tour`)

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [fastapi](https://github.com/fastapi/fastapi) | 0.162.2 | MIT | Web framework (same as the disease API) |
| [uvicorn](https://github.com/encode/uvicorn) | 0.54.0 | BSD-3-Clause | ASGI server |
| [python-multipart](https://github.com/Kludex/python-multipart) | 0.0.33 | Apache-2.0 | HTML form parsing |
| [Jinja2](https://github.com/pallets/jinja) | 3.1.6 | BSD-3-Clause | HTML templates (autoescaped) |
| [psycopg[binary]](https://github.com/psycopg/psycopg) | 3.3.6 | LGPL-3.0 | PostgreSQL driver for schema `app_tea_tour` (dynamically linked, unmodified) |
| pytest, httpx2 (`requirements-dev.txt`, with the CLI's requirements for its test Postgres) | 9.1.1, 2.16.0 | MIT, BSD-3-Clause | Unit tests (dev only) |

> **\* n8n License Note:** n8n uses the Sustainable Use License (fair-code, source-available,
> not OSI-approved). DX-AgriMarket does NOT import, link, or bundle n8n source code.
> Communication is exclusively via HTTP API. n8n is an optional, replaceable component.
> See [ADR 0001](./docs/adr/0001-n8n-workflow-engine.md).

---

## License Compatibility

All direct dependencies use OSI-approved licenses (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC)
that are fully compatible with the project's **MIT License**.

The only non-OSI dependency is **n8n** (Sustainable Use License), which is used as an
external Docker service communicating via HTTP API only — no source code is imported or bundled.
This follows the same integration pattern as using any external SaaS API and does not
affect the project's MIT licensing.
