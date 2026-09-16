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
| [fastapi](https://github.com/tiangolo/fastapi) | latest | MIT | Python web framework |
| [uvicorn](https://github.com/encode/uvicorn) | latest | BSD-3-Clause | ASGI server |
| [python-multipart](https://github.com/andrew-d/python-multipart) | latest | Apache-2.0 | File upload support |
| [Pillow](https://github.com/python-pillow/Pillow) | latest | MIT-CMU | Image processing |
| [numpy](https://github.com/numpy/numpy) | latest | BSD-3-Clause | Numerical computation |
| [tensorflow-cpu](https://github.com/tensorflow/tensorflow) | latest | Apache-2.0 | Machine learning inference |

---

## Infrastructure Services (Docker Compose)

| Service | Image | License | Purpose |
|---------|-------|---------|---------|
| PostgreSQL | `postgres:16-alpine` | PostgreSQL License (OSI) | Relational database |
| Keycloak | `quay.io/keycloak/keycloak:24.0` | Apache-2.0 | Identity & Access Management |
| n8n | `n8nio/n8n:latest` | Sustainable Use License* | Workflow automation |
| MinIO | `minio/minio:latest` | AGPL-3.0 (OSI) | S3-compatible object storage |
| Piper TTS | `rhasspy/wyoming-piper:latest` | MIT | Text-to-Speech engine |
| Mattermost | `mattermost/mattermost-team-edition` | MIT (Team Edition) | Team communication |

> **\* n8n License Note:** n8n uses the Sustainable Use License (fair-code, source-available,
> not OSI-approved). DX-AgriMarket does NOT import, link, or bundle n8n source code.
> Communication is exclusively via HTTP API. n8n is an optional, replaceable component.

---

## License Compatibility

All direct dependencies use OSI-approved licenses (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC)
that are fully compatible with the project's **MIT License**.

The only non-OSI dependency is **n8n** (Sustainable Use License), which is used as an
external Docker service communicating via HTTP API only — no source code is imported or bundled.
This follows the same integration pattern as using any external SaaS API and does not
affect the project's MIT licensing.
