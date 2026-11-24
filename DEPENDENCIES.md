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
| Python | `python:3.12.15-slim-bookworm` | PSF | Base image of `dxos-scanner`, `dxos-dataops`, `dxos-cli` and the mini-apps `hello`, `tea-tour`, `leaf-purchase`, `tea-shop`, `farm-supply`, `custom-books` and `htx-dashboard`, and of `ai-models/tea` training (not a Compose service) |
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
| [psycopg[binary]](https://github.com/psycopg/psycopg) | 3.3.6 | LGPL-3.0 | PostgreSQL driver for `platform.installed_apps` and each app's schema, role and migrations (dynamically linked, unmodified) |
| [pytest](https://github.com/pytest-dev/pytest) | 9.1.1 | MIT | Unit tests (dev only) |

### Mini-app `hello` (`miniapps/hello`)

Python standard library only (`http.server`, `unittest`); no third-party package.

### Mini-app `tea-tour` (`miniapps/tea-tour`)

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [fastapi](https://github.com/fastapi/fastapi) | 0.162.2 | MIT | Web framework (same as the disease API) |
| [uvicorn](https://github.com/encode/uvicorn) | 0.54.0 | BSD-3-Clause | ASGI server |
| [python-multipart](https://github.com/Kludex/python-multipart) | 0.0.33 | Apache-2.0 | HTML form parsing |
| [Jinja2](https://github.com/pallets/jinja) | 3.1.6 | BSD-3-Clause | HTML templates (autoescaped) |
| [psycopg[binary]](https://github.com/psycopg/psycopg) | 3.3.6 | LGPL-3.0 | PostgreSQL driver for schema `app_tea_tour` (dynamically linked, unmodified) |
| pytest, httpx2 (`requirements-dev.txt`, with the CLI's requirements for its test Postgres) | 9.1.1, 2.16.0 | MIT, BSD-3-Clause | Unit tests (dev only) |

### Mini-apps `leaf-purchase`, `tea-shop` and `farm-supply` (`miniapps/<id>`)

No new package: each app's `requirements.txt` and `requirements-dev.txt` are identical to `tea-tour`'s (the packages and pins in the table above), and each stores its data in its own schema (`app_leaf_purchase`, `app_tea_shop`, `app_farm_supply`).

## Project site (`site/`)

| Component | Version | License | Purpose |
|-----------|---------|---------|---------|
| [Be Vietnam Pro](https://github.com/bettergui/BeVietnamPro) font (latin and vietnamese subsets, weights 400, 600, 700), self-hosted in `site/assets/fonts` as woff2 | 5.3.0 (`@fontsource/be-vietnam-pro`) | OFL-1.1 | Page typeface; licence text in `site/assets/fonts/OFL-1.1.txt` |

The site has no JavaScript dependency, no build toolchain and no external requests at run time.

## Build tools of the project site (`scripts/build-docs.py`)

Only the documentation generator uses a package. It is installed by `.github/workflows/pages.yml` and for local builds.

| Component | Version | License | Purpose |
|-----------|---------|---------|---------|
| [Python-Markdown](https://github.com/Python-Markdown/markdown) | 3.7 | BSD-3-Clause | Converts the repository's Markdown documents to HTML pages of the project site |

Python 3.12 (PSF) runs the scripts. The site's icons and diagrams are drawn in SVG by the project; no icon library is used.

## Mobile app (`apps/hub-mobile`, Flutter 3.41.7 / Dart 3.11.5)

All versions are pinned exactly in `pubspec.yaml`; `pubspec.lock` pins the transitive packages (installed with `flutter pub get --enforce-lockfile`). No Google Play services, Firebase, Maps SDK or analytics.

### Runtime Dependencies

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [Flutter SDK](https://github.com/flutter/flutter) (build toolchain, `flutter` package) | 3.41.7 | BSD-3-Clause | UI framework |
| [go_router](https://pub.dev/packages/go_router) | 17.5.0 | BSD-3-Clause | Role-based routing and redirects |
| [provider](https://pub.dev/packages/provider) | 6.1.5+1 | MIT | State management (session, cart, orders) |
| [shared_preferences](https://pub.dev/packages/shared_preferences) | 2.5.6 | BSD-3-Clause | Cart, orders and tickets kept on the device |
| [qr_flutter](https://pub.dev/packages/qr_flutter) | 4.1.0 | BSD-3-Clause | VietQR payment code and ticket QR (pulls `qr` 3.0.3, BSD-3-Clause) |
| [flutter_appauth](https://pub.dev/packages/flutter_appauth) | 12.1.0 | BSD-3-Clause | Keycloak sign-in: OIDC authorization code flow with PKCE in the system browser. Wraps the native AppAuth libraries: [AppAuth-Android](https://github.com/openid/AppAuth-Android) 0.11.1 (Apache-2.0; depends only on `androidx.annotation`, `androidx.appcompat`, `androidx.browser`) and AppAuth-iOS (Apache-2.0). No Google Play services. Pulls `flutter_appauth_platform_interface` 12.1.0 (BSD-3-Clause) |
| [flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage) | 11.2.0 | BSD-3-Clause | Refresh and access tokens in Android Keystore (AES key managed with [Tink](https://github.com/tink-crypto/tink-java) `tink-android` 1.23.0, Apache-2.0, no Play services) and the iOS Keychain. Pulls `flutter_secure_storage_darwin` 0.4.3, `_linux` 3.0.3, `_platform_interface` 2.1.1, `_web` 2.1.1 and `_windows` 4.2.2 (BSD-3-Clause) |
| [image_picker](https://pub.dev/packages/image_picker) | 1.1.2 | BSD-3-Clause | Camera and gallery pickers for the leaf photo (disease scan). Uses the system camera app (no camera permission on Android) and the iOS picker; no Google Play services. Pulls `image_picker_android` 0.8.13+17, `_ios` 0.8.13+10, `_for_web` 3.1.1, `_linux` 0.2.2, `_macos` 0.2.2+1, `_windows` 0.2.2, `_platform_interface` 2.11.2, `cross_file` 0.3.5+5, `file_selector_linux` 0.9.4+1, `_macos` 0.9.5+1, `_windows` 0.9.3+6, `_platform_interface` 2.7.0, `flutter_plugin_android_lifecycle` 2.0.35 (all BSD-3-Clause, Flutter authors) and `mime` 2.1.0 (BSD-3-Clause, Dart project authors) |
| [camera](https://pub.dev/packages/camera) | 0.12.0+2 | BSD-3-Clause | Live camera preview and shutter for the leaf scan on phones (the browser demo uses `web` instead). Uses CameraX on Android (AndroidX, no Google Play services) and AVFoundation on iOS. Pulls `camera_android_camerax` 0.7.2, `camera_avfoundation` 0.10.3+1, `camera_platform_interface` 2.15.0, `camera_web` 0.3.6 (BSD-3-Clause, Flutter authors) and `stream_transform` 2.1.2 (BSD-3-Clause, Dart project authors) |
| [video_player](https://pub.dev/packages/video_player) | 2.11.1 | BSD-3-Clause | Plays the short videos ("Video ngắn") on the account pages: bundled demo clips and clips picked from the gallery. Uses ExoPlayer (AndroidX Media3) on Android, AVPlayer on iOS and the browser's `<video>` on web; no Google Play services. Pulls `video_player_android` 2.9.5, `video_player_avfoundation` 2.12.1, `video_player_web` 2.4.0, `video_player_platform_interface` 6.9.0 (BSD-3-Clause, Flutter authors), `html` 0.15.7 and `csslib` 1.0.2 (BSD-3-Clause, Dart project authors) |
| [web](https://pub.dev/packages/web) | 1.1.1 | BSD-3-Clause | Browser APIs for the leaf scan in the web demo (`getUserMedia`, canvas); already a transitive package, now pinned as a direct one (Dart project authors) |
| [http_parser](https://pub.dev/packages/http_parser) | 4.1.2 | BSD-3-Clause | Media type of the leaf photo in the multipart upload; already a transitive package of `http`, now pinned as a direct one (Dart project authors) |
| [http](https://pub.dev/packages/http) | 1.6.0 | BSD-3-Clause | HTTP client of `HttpHubRepository` (GraphQL calls to the core through the gateway); tests use its `MockClient` (pulls `http_parser` 4.1.2 and `typed_data` 1.4.0, BSD-3-Clause) |
| [Be Vietnam Pro](https://github.com/bettergui/BeVietnamPro) font (Regular, Medium, SemiBold, Bold), bundled in `apps/hub-mobile/assets/fonts` | 1.002 (Google Fonts `ofl/bevietnampro`, fetched 2026-11-17) | OFL-1.1 | The sans-serif of the whole app; license text in `assets/fonts/OFL.txt` |
| [flutter_localizations](https://api.flutter.dev/flutter/flutter_localizations/flutter_localizations-library.html) (Flutter SDK) | 3.41.7 | BSD-3-Clause | Vietnamese labels of the built-in widgets (the date picker of the booking screen). Pulls [intl](https://pub.dev/packages/intl) 0.20.2 (BSD-3-Clause) |

### Dev Dependencies

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| flutter_test (Flutter SDK) | 3.41.7 | BSD-3-Clause | Unit and widget tests |
| [flutter_lints](https://pub.dev/packages/flutter_lints) | 6.0.0 | BSD-3-Clause | Lint rules for `flutter analyze` |

Transitive packages (all BSD-3-Clause or MIT, checked from their LICENSE files; added with `flutter_secure_storage`: `args` 2.7.0, `code_assets` 1.2.1, `crypto` 3.0.8, `ffi_leak_tracker` 0.1.2, `hooks` 2.0.2, `jni` 1.1.2, `jni_flutter` 1.0.4+1, `jni_util` 1.0.0, `objective_c` 9.5.0, `package_config` 3.0.0, `path_provider` 2.1.6, `path_provider_android` 2.3.1, `path_provider_foundation` 2.6.0, `pub_semver` 2.2.1, `record_use` 0.6.0, `win32` 6.4.0, `yaml` 3.1.4): `characters`, `collection`, `ffi`, `file`, `http_parser`, `logging`, `material_color_utilities`, `meta`, `nested` (MIT), `path`, `path_provider_linux`, `path_provider_platform_interface`, `path_provider_windows`, `platform`, `plugin_platform_interface`, `qr`, `shared_preferences_android`, `shared_preferences_foundation`, `shared_preferences_linux`, `shared_preferences_platform_interface`, `shared_preferences_web`, `shared_preferences_windows`, `typed_data`, `vector_math`, `web`, `xdg_directories`.

---
### Mini-app `htx-dashboard` (`miniapps/htx-dashboard`)

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [fastapi](https://github.com/fastapi/fastapi) | 0.162.2 | MIT | Web framework (same pin as `tea-tour`) |
| [uvicorn](https://github.com/encode/uvicorn) | 0.54.0 | BSD-3-Clause | ASGI server |
| [Jinja2](https://github.com/pallets/jinja) | 3.1.6 | BSD-3-Clause | HTML templates (autoescaped) |
| pytest, httpx2 (`requirements-dev.txt`) | 9.1.1, 2.16.0 | MIT, BSD-3-Clause | Unit tests (dev only) |

No database driver and no form parser: the app has no database and no form that writes. It reads the core with the standard library (`urllib`).

> **\* n8n License Note:** n8n uses the Sustainable Use License (fair-code, source-available,
> not OSI-approved). DX-AgriMarket does NOT import, link, or bundle n8n source code.
> Communication is exclusively via HTTP API. n8n is an optional, replaceable component.
> See [ADR 0001](./docs/adr/0001-n8n-workflow-engine.md).

---

## Agent external providers (`platform/agent`, optional)

| Service | Version | License | Purpose |
|---------|---------|---------|---------|
| Anthropic Messages API | API version `2023-06-01` | Commercial API, opt-in | Optional provider of one agent (ADR 0004), called over HTTPS |
| OpenAI Chat Completions API | - | Commercial API, opt-in | Optional provider of one agent (ADR 0004), called over HTTPS |

No package is installed for these: the agent calls both APIs with `urllib` from the Python standard library. Both services are paid and off unless a manager turns them on for a cooperative; their keys come from the operator's environment only.

---

## License Compatibility

All direct dependencies use OSI-approved licenses (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC)
that are fully compatible with the project's **MIT License**.

The only non-OSI dependency is **n8n** (Sustainable Use License), which is used as an
external Docker service communicating via HTTP API only — no source code is imported or bundled.
This follows the same integration pattern as using any external SaaS API and does not
affect the project's MIT licensing.

---

## Staff Desktop App (`apps/staff-desktop`)

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| [CommunityToolkit.Mvvm](https://github.com/CommunityToolkit/dotnet) | 8.4.2 | MIT | MVVM base classes, source-generated properties and commands |
| [Microsoft.Extensions.DependencyInjection](https://github.com/dotnet/runtime) | 10.0.4 | MIT | Dependency injection |
| [Microsoft.EntityFrameworkCore.Sqlite](https://github.com/dotnet/efcore) | 10.0.4 | MIT | Offline SQLite storage |
| [SQLitePCLRaw.lib.e_sqlite3](https://github.com/ericsink/SQLitePCL.raw) | 3.53.3 | Apache-2.0 | Native SQLite build |
| [Npgsql.EntityFrameworkCore.PostgreSQL](https://github.com/npgsql/efcore.pg) | 10.0.3 | PostgreSQL | Storage in the core schema `app_staff_work` |
| Microsoft.AspNetCore.App (shared framework) | 10.0 | MIT | REST API for the mobile app |
| xunit / xunit.runner.visualstudio (test) | 2.9.3 / 3.1.4 | Apache-2.0 | Unit tests |

## Staff Mobile App (`apps/staff-mobile`)

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| AndroidX Core KTX, Activity Compose, Lifecycle, SplashScreen | 1.19.1 / 1.13.0 / 2.11.0 / 1.2.0 | Apache-2.0 | Android platform support |
| Jetpack Compose BOM (ui, material3, icons-extended) | 2026.09.00 | Apache-2.0 | UI toolkit |
| [kotlinx.serialization JSON](https://github.com/Kotlin/kotlinx.serialization) | 1.12.0 | Apache-2.0 | JSON models |
| AndroidX ExifInterface | 1.4.2 | Apache-2.0 | Upright evidence photos |
| Android Gradle Plugin / Kotlin / Gradle wrapper (build) | 9.5.1 / 2.4.21 / 9.9.0 | Apache-2.0 | Build toolchain |
| [Robolectric](https://github.com/robolectric/robolectric) (test) | 4.17 | MIT | JVM UI tests |
| JUnit 4 (test) | 4.13.2 | EPL-1.0 | Unit tests |

Full lists with notes: `apps/staff-desktop/DEPENDENCIES.md` and `apps/staff-mobile/DEPENDENCIES.md`.