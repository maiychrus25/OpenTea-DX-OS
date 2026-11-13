# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`make web-up` and `make gateway-up`**: `web-up` rebuilds or starts `web` and `disease-api` on the generated route file (it replaces the hand-typed `docker compose up` for `web`, in the README, `docs/miniapps.md` and CI); `gateway-up` puts the gateway back on that file after a hand-typed compose command recreated it on the base one.

### Fixed

---

## [1.10.0] - 2026-11-13

### Added

- **App Store detail page** (`/manager/app-store/<id>`, web version 1.10.0): header with the Cài, Gỡ, Thử lại and Mở ứng dụng buttons, a step progress while an install runs (Đã gửi yêu cầu, Chuẩn bị, Dựng và khởi động, Đăng ký), a strip of screenshots that open at full size, the "Giới thiệu" text, a preview "Khi cài, ứng dụng sẽ" of what the install does for the HTX ("Ứng dụng đã thêm vào HTX" once the HTX uses the app), the data and personal data the app declares, version information, the full address of the app's public page with a "Chép địa chỉ" button, and the history of the app.
- **Richer store page**: accent-insensitive search, filters by status and category, cards that link to the detail page, and a "Lịch sử" tab with the 50 newest install and removal requests of the HTX and the name of who asked. The history only holds requests of the caller's HTX.
- **Optional `store` block in the mini-app manifest** (category, icon from an allowlist, about, data, personal data, core reads, up to 4 screenshots of at most 400 KB, PNG, WebP or JPEG detected from the first bytes). Text from a manifest is shown as plain text only. `./dxos validate` also checks the screenshot files (inside the app directory, size, type); `catalog-sync` stores the block (`platform.app_catalog.store`, `requires_core`, `has_database`) and the screenshots (`platform.app_catalog_screenshots`) in the platform database.
- **Install phases**: while the worker installs an app it sets `platform.app_requests.phase` to `prepare`, `build` and `register` through the new `./dxos worker-progress`, so the page can show the step; a failed install keeps the phase that failed. A hand `./dxos install` never writes a request or a phase.
- **Store text and screenshots for the five apps**: `leaf-purchase`, `tea-shop`, `farm-supply` (two screenshots each), `tea-tour` (one) and `hello` carry a `store` block in Vietnamese; the screenshots come from the real apps with sample data and are retaken with `apps/web/tests/e2e/tools/store-screenshots.spec.ts` (`E2E_STORE_SHOTS=1`).
- **Tests**: the app smoke checks the synced store block, the phases seen during a queued install, the `build` phase of a failed install, that a hand install writes no request, and that `validate` refuses a text file declared as a screenshot; the App Store story now searches, opens the detail page, installs from it, opens the app and finds the history row; the screens add the history tab and the detail page at 1280 and 390 px, light and dark.

### Upgrade notes
- **`make platform-up` applies the new columns and tables without recreating `postgres`** (`06-app-store.sql` is extended in place and stays idempotent). Keep every `docker_*` volume.
- **Rebuild the web image** (`make web-up` from v1.10.1; before that the full command of the v1.8.0 note, with `DXOS_GATEWAY_FILE`) and **restart `./dxos worker`**, otherwise the page works but no install phase is reported.
- Apps that carry a `store` block declare `requires.core: ">=1.10.0"`; app versions are unchanged.

### Known limits
- **The declared data is not enforced**: what an app says it stores or reads is the publisher's statement, shown as such; nothing checks it against the app's real behaviour.
- **There is no update flow**: an installed app is not upgraded from the store, and its version does not change for a metadata-only edit.
- The install steps show only what the worker reports (three phases); building and starting the container are one step.

---

## [1.9.0] - 2026-11-13

### Added
- **Optional `description` in the mini-app manifest** (1-200 characters), shown by the upcoming app store; `hello` and `tea-tour` now declare one. `docs/miniapps.md` documents it and the rule that public pages live under `/public/<htxCode>/...` (from v1.9.0 the web proxy serves a public page only when that HTX has enabled the app). Web package version is now `1.9.0`
- **App Store: install mini-apps per cooperative** (the manifest `description` above feeds it). A manager opens "Kho ứng dụng" (`/manager/app-store`) and installs or removes an app for their own HTX; the card shows Chưa cài, Đang cài…, Đã cài, Đang gỡ…, Lỗi (with Thử lại) or "Đã cài cho mọi HTX (quản trị máy chủ)", and polls every 3 s only while something is in progress, then refreshes the sidebar menu of the manager who pressed the button (other signed-in users of the HTX see the change at their next page load). A mini-app is now served, and listed in the menu, only to the HTXs that enabled it: the proxy answers 404 to any other HTX on protected and public paths, and a public page names its HTX in `/public/<htxCode>/...`. New tables in schema `platform` (`platform/postgres/init/06-app-store.sql`, applied by `platform-init`): `app_catalog` (synced from `miniapps/*/app.yaml` by `make platform-up` and by the worker; an installed app keeps its card when its directory is gone), `app_enablements` (`*` means every HTX), `app_requests` (one open request per app and HTX, enforced by a unique index) and `app_worker` (heartbeat); requests and enablements are audited. `./dxos worker` is the host process that claims requests one at a time (`ENABLE` installs the app when needed, `DISABLE` removes the container once no HTX is left, and keeps the data), takes a lock in `docker/runtime/<project>/worker.lock`, fails requests a crashed worker left running (undoing the half install) and logs one line per job; without it the page warns that requests wait for the administrator. `./dxos install <dir>` is unchanged and enables the app for `*`. New API: `GET /api/app-store`, `POST /api/app-store/requests` (`docs/api-contract.md`)
- **Mini-app `leaf-purchase` (Thu mua búp tươi)**: officers and managers write fresh-leaf weighing tickets (household, date, grade, kg with one decimal, price copied from the grade when written; money is integer VND shown as `9.000 ₫`) and can edit or void a ticket until its period closes; managers set the price per grade (`/prices`), close a payment period over a date range (`/periods`: every non-voided ticket in the range joins it and gets one payout per household) and mark each payout paid; a farmer sees their own tickets and payouts at `/mine`. The household lists come from Hasura with the caller's own token and role, so a farmer sees only their household. Periods of one HTX never overlap (checked in a transaction under an advisory lock, since the app role cannot create `btree_gist`), and a ticket cannot be written or moved into a closed period's dates. Menu: "Thu mua búp tươi" (officer, manager), "Kỳ thanh toán" (manager), "Phiếu cân của tôi" (farmer). Schema `app_leaf_purchase`
- **Mini-app `tea-shop` (Cửa hàng chè)**: managers list products (name, pack, price, stock, optional trace lot code) and process orders (`Mới` → `Đã xác nhận` → `Đang giao` → `Hoàn tất`, or cancel, which gives the stock back); guests order without an account at `/apps/tea-shop/public/<htxCode>` (cash on delivery), get an 8-character order code and look the order up with code and phone together. Stock is locked per order in a fixed product order, so concurrent orders never oversell and never deadlock; an order keeps the product name and price it was placed with; a manager's stock edit is an adjustment (`+/-`), never an overwrite. Personal data (name, phone, address, note) is shown only to the HTX's manager and never on a public page. Menu: "Cửa hàng chè" (manager). Schema `app_tea_shop`
- **Mini-app `farm-supply` (Vật tư mua chung)**: managers open a group-buying round with a deadline and add items (name, unit, price) while it is open; each farmer registers quantities for their own household (the household comes from Hasura with the farmer's token, never from the form) until the round closes; closing creates one settlement per registered household, and the manager marks each delivered and paid and sees totals per item and per household. Menu: "Vật tư mua chung" (manager), "Đăng ký vật tư" (farmer). Schema `app_farm_supply`
- **Tests for the store and the three apps**: `make apps-smoke` now also installs, calls through the gateway (200 with the right role, 404 on the published port, the gateway's refusal for a wrong role, including `/tickets/*` and `/periods/*` of `leaf-purchase`), reads the real Hasura household lists as officer, manager and farmer, makes one write per app (a ticket, a closed period and a payout, a public order, a registration) and purges each app; through the queue it enables `tea-shop` for TC, checks that the web proxy answers 404 for LB when the web container runs, disables it, enables it again and checks that the product created before is still there. It refuses to start when one of the five apps is installed, and starts its own `./dxos worker`. Browser: `tests/e2e/story/app-store.spec.ts` (TC installs the shop from the page and sees `Đang cài…` then `Đã cài`; LB does not see it and gets 404; a guest orders on a 390 px phone; the manager advances the order, presses Gỡ, installs again and finds the order) and `business-apps.spec.ts` (the leaf-purchase and farm-supply stories); `screens.spec.ts` adds the store page and one screen per app and role at 1280 and 390 px, light and dark. CI runs the pytest suites of the three apps next to `tea-tour`'s and, in `platform-smoke`, a `./dxos worker` for the store stories

### Upgrade notes
- **First `make platform-up` recreates `postgres` once**: it mounts the new `platform/postgres/init/06-app-store.sql`. The data in `docker_pgdata` is kept, and `platform-init` creates the store tables on the existing database. Never delete the `docker_*` volumes
- **Apps installed before the upgrade stay enabled for every HTX**: the `platform-init` run that creates `platform.app_enablements` enables each already-installed app for `*` once (`enabled_by = 'dxos-upgrade'`), so nothing disappears from the menu. Later runs never do it again: an installed app with no enablement is a valid state (every HTX turned it off) and is not handed back to everyone
- **Start `./dxos worker`**: the store only queues a request until a worker runs. Start it from the repo root (README, "Kho ứng dụng và `./dxos worker`", has a systemd unit); until it runs, the page warns "Trình cài đặt chưa chạy". `./dxos install` and `./dxos remove` work without it
- **The web image must be rebuilt** (`make web-up` from v1.10.1; before that the full command of the v1.8.0 note, with `DXOS_GATEWAY_FILE`): the proxy, the menu and the store page read `platform.app_enablements`; the package version is now `1.9.0`, which the new manifests require
- **Demo**: build the images of the three new apps ahead (install each once, then `./dxos remove <id> --purge`) and start the worker before the demo; the first Cài otherwise builds an image, which takes minutes

### Known limits
- **Apps still trust each other** (ruling R24, unchanged): enabling an app per HTX only decides who sees it; every installed app shares `dxos-apps-net` and decodes the token without verifying it, so another installed app can read or change the data of `leaf-purchase`, `tea-shop` and `farm-supply`. Install only apps of this repository. Real per-app isolation is deferred
- **The worker is a host process**, not a container (the web app must never hold the Docker socket): it must be started and kept alive by the operator, and one worker serves one compose project
- **The farm-supply item form** shows a rejected item (empty name, bad price) as a plain error page (heading and one message, no form and no link back; the browser's Back button returns to the round) instead of an inline error; nothing is stored
- **The gateway can answer 503 for up to about 30 seconds after a core service restarts** (for example Hasura): its DNS client caches the "name not found" answer it got while the service was down, and `apisix.dns_resolver_valid` only shortens the cache of valid answers. Unchanged from earlier releases

---

## [1.8.1] - 2026-11-12

The `v1.8.0` tag has no GitHub Release, images or bundle: the release workflow's smoke gate failed on the flaky restart fixed below. `v1.8.1` is the same product with that fix and is the first published build of the mini-app platform.

### Fixed
- **`make platform-up` no longer recreates containers whose build inputs did not change**: BuildKit attached a provenance attestation with a new digest to every build, so rebuilding an unchanged image (`up --build`, `run --build migrate`, the web step) produced a new image ID and Compose recreated `agrimarket-postgres` (and its dependents) under a running Keycloak. Keycloak then answered 500 on its next admin call, which failed `make apps-smoke` on main and in the release gate (`FAIL: keycloak admin PUT .../default-client-scopes/...`, `Error 22`). The Makefile, `./dxos` and the CI `platform-smoke` job now set `BUILDX_NO_DEFAULT_ATTESTATIONS=1`, so the same inputs give the same image ID. First-start behaviour is unchanged
- **`make apps-smoke` waits for Keycloak after `make platform-up`**: it now asserts that the postgres container is the same one as before, then waits (bounded, 120 s for the admin API, 60 s for the user token) before using Keycloak, so a legitimate restart no longer fails the run. New helper `kc_ready` in `platform/tests/tokens.sh`; no assertion was removed

---

## [1.8.0] - 2026-11-12

### Added
- **Mini-app manifest and `dxos validate`**: a mini-app is described by `app.yaml` (`apiVersion: dxos/v1`), published as the JSON Schema `platform/apps/manifest.schema.json` with `additionalProperties: false` everywhere. `./dxos validate <dir>...` refuses a manifest with a schema error, an `id` already installed, a licence outside the CLI's OSI list, a `requires.core` the core (`version` in `apps/web/package.json`) does not satisfy, an `image` not pinned by `@sha256:` digest, a route or menu path with `..`, `//` or characters outside `[a-z0-9/_-]`, a role other than `farmer`, `officer` and `manager`, a prefix listed as both public and protected, or a protected prefix nested under a public one (the web proxy would never send it a token). The developer guide is `docs/miniapps.md`; the decision is recorded in `docs/adr/0002-miniapp-architecture.md`
- **`./dxos install`, `remove` and `list`**: `./dxos` at the repo root runs the `dxos-cli` container (profile `tools`, no host port, no docker socket) for the manifest, database, gateway, install journal and registry work, and starts or stops the app container itself with `docker compose`. Install validates the manifest, prepares the database (when declared), writes the app's APISIX routes under `/apps/<id>/` and the app's compose file, starts the container with `up -d --build --wait`, then records the app in `platform.installed_apps` (id, name, version, menu, manifest, install time; created by `platform-init` from `platform/postgres/init/05-apps.sql`). A failure at any step, a failing health check, Ctrl-C or TERM undoes the earlier steps in reverse order from the journal `docker/runtime/<project>/apps/<id>.pending.json`; installing an installed app only makes sure its container runs. `remove <id>` stops the container, removes the routes and the registry row and keeps the data; `--purge` also drops it. `list` prints id, version, install time and container state. Protected routes use `openid-connect` `bearer_only` with a `claim_schema` check on `realm_access.roles`; a token without one of the manifest's roles gets 401 from the gateway. The routes are merged with the tracked `platform/gateway/apisix.yaml` into `docker/runtime/<project>/gateway/apisix.yaml`, which APISIX reloads in place within about a second; with no app installed that file is identical to the base, and the tracked file is never modified. `make platform-up` and `make up` run `gateway-sync` first, so installed apps keep their routes and containers across a restart. App routes match only on the gateway's internal listener `9081` (`vars: [["server_port", "==", "9081"]]`), so the published `9080` answers 404 under `/apps/` and every outside request goes through the web proxy; `gateway-sync` refuses an app route without that condition
- **Hardened app containers**: the generated compose file runs service `app-<id>` as user `10001:10001` with a read-only root filesystem and a `/tmp` tmpfs, `cap_drop: [ALL]`, `no-new-privileges`, 256 MB of memory and 0.5 CPU, no host port, and only on the new network `dxos-apps-net`. That network is `internal: true` (no egress) and holds only `apisix` and `postgres` besides the apps. Every installed app shares it, so apps can reach each other (see Known limits). The manifest cannot change any of this
- **App database**: for a manifest with `database.migrations`, install creates the login role and schema `app_<id>` (`-` becomes `_`): no superuser, database, role, replication or RLS-bypass right, `CONNECTION LIMIT 10`, a random password sent to the server only as a SCRAM verifier, and rights on its own schema only. Migrations (`*.sql`, in file-name order, one transaction per file) run on a connection logged in as the app role with `search_path` set to its schema, never on the superuser connection, and are recorded in `app_<id>.schema_migrations`. Every app table must have `htx_code text NOT NULL`, checked after each file and again from a fresh session. The app reads `DXOS_APP_DB_URL` from `docker/runtime/<project>/apps/<id>.env` (mode 600, git-ignored). A failed install drops a schema and role it created and keeps ones that existed before. `--purge` drops the schema (refused, dropping nothing, when an object outside it depends on it), then `DROP OWNED BY` and the role, and deletes the env file
- **Mini-app `hello`**: about 80 lines of standard-library Python with no database. It greets the user with the name, HTX and role from the token, on one menu item for every role, and its README is the walkthrough for a first mini-app
- **Mini-app web proxy**: `/apps/<id>/...` on the web app forwards to installed mini-apps through the gateway, only for ids in `platform.installed_apps` (read on every request, so a removed app answers 404 at once, and 503 when the list cannot be read). Protected paths get the user's access token and answer 401 with a sign-in link when the session has expired; public manifest paths get no token and are limited to 10 requests a minute per client IP across every app (429 with a Vietnamese message), with new IPs sharing one bucket once the 10,000-IP table is full. Paths with empty or dot segments or encoded separators answer 400; only `content-type`, `accept` and `content-length` (plus the token) are forwarded, so the browser's `cookie`, `authorization` and `x-hasura-*` headers never reach the app; only `content-type` and `location` come back, so the app's `set-cookie` is dropped, and a redirect that leaves the app answers 502. Every response carries `Content-Security-Policy` with `script-src 'none'` and `X-Content-Type-Options: nosniff`. The per-IP limiter of `/api/register` now lives in `apps/web/src/lib/ip-rate-limit.ts`, unchanged
- **`DXOS_APP_PUBLIC_LIMIT`**: the public mini-app limit per minute and IP for the `web` container, read by Compose interpolation, default `10`; a value that is not a positive integer keeps 10. The CI `Start Web` step raises it (to 1000), so a Playwright retry cannot hit 429. A demo machine on Docker Desktop should raise it too (for example 300), because Docker Desktop shows every client as one IP and the limit becomes shared by the whole room. Production and the compose default keep 10
- **Cross-site form posts to mini-apps refused**: the web proxy answers 403, without forwarding, to a non-`GET` request under `/apps/` whose `Origin` header is neither `<scheme>://<Host>` of the request nor the `AUTH_URL` origin (`Origin: null` included), or that has no `Origin` but `Sec-Fetch-Site: cross-site`, since the proxy attaches the signed-in user's token
- **Mini-apps in the app shell**: each role's menu lists the installed mini-apps whose manifest menu names that role (read on every page load; when the list cannot be read the menu shows no app and the other items stay). `/<role>/apps/<id>/...` shows the app in an `<iframe sandbox="allow-forms allow-same-origin allow-top-navigation-by-user-activation">` (no `allow-scripts`) on `/apps/<id>/...`, passes the page query through, adds `?theme=light|dark` from the stored theme choice, and answers 404 when the app is not installed, has no menu entry for the role, or the path has an unsafe segment; when the app list cannot be read the page shows "Dịch vụ dữ liệu đang tạm gián đoạn" with "Thử lại". The service worker never answers `/apps/` from its cache
- **`/dxos-app.css`**: the shared stylesheet for mini-apps, served without a session. It holds the core tokens (same values as `globals.css`, checked by a test) for light, dark and `data-theme`, plus styles for text, tables, forms, buttons and `button.secondary`, `.notice`, `.error`, `.pill`. Tables span their card, header row included. Below 640 px each row is stacked as a card: a cell with `data-label` shows that column name next to its value, and a cell without one keeps the card's full width. Apps set `data-theme` on `<html>` from `?theme=` and keep it across their links and forms, as `hello` and `tea-tour` do
- **Mini-app `tea-tour` (Đặt tour đồi chè)**: `./dxos install miniapps/tea-tour` adds "Tour đồi chè" to the manager menu and "Lịch dẫn tour" to the farmer menu. Managers create tours (title, Vietnam-time start, meeting point, 1–50 seats, price in VND shown as `250.000 ₫`, description) with a guide picked from their HTX's households, read through the gateway with the user's own token (the tour list stays usable when the core does not answer within 5 s), edit an open, upcoming tour (seats never below those booked, checked under the tour's row lock), see each tour's bookings with phone numbers, confirm (only while the tour is open; the confirm locks only that booking's tour) or cancel them, and cancel tours; a confirm or cancel that changes nothing says so. Guests book without signing in at `/apps/tea-tour/public/<htx>` (name, Vietnamese phone, 1–10 people, note), get an 8-character code and look the booking up with code and phone together; public pages never show another guest's name or phone. A booking locks the tour row, so concurrent bookings never oversell; past, cancelled and other-HTX tours are refused with a Vietnamese message and nothing stored. The guide farmer sees their tours with confirmed guest counts. Its tables carry ARIA table roles and `data-label` on every cell, so they keep their meaning when stacked on phones. Data lives in schema `app_tea_tour` (`tours`, `bookings`, both with `htx_code`; a booking's foreign key includes its HTX). The app holds at most 8 database connections and answers 503 "Hệ thống đang bận" when none frees within 2 s; it never holds one while waiting for the core
- **Mini-app tests and CI**: `make apps-smoke` installs and removes `hello`, `tea-tour` and the CLI fixtures on a seeded stack (it purges their data, so it refuses to start, with exit 1, when `./dxos list` shows `tea-tour` or `hello` installed): routes 200 with a token and 401 without on the internal port `9081`, 404 on the published `9080`, the gateway's 401 for the wrong role, a tour booked end to end, idempotent re-install, rollback of a failing health check, routes kept across `make platform-up`, 404 after removal, `--purge`, and finally `make platform-smoke` on the app-free stack. `tests/e2e/story/tea-tour.spec.ts` runs the tour story in the browser (the manager creates a tour with a TC household as guide, a guest books on a 390 px phone, the manager confirms, the guide sees 2 guests) and, with `E2E_TEA_TOUR=removed`, checks that the menu item is gone and the public page answers 404; `screens.spec.ts` adds the tea-tour manager, public and guide screens at 1280 and 390 px in light and dark, and also checks overflow and overlap inside the app frame. CI runs the CLI, `hello` and `tea-tour` tests, validates every manifest under `miniapps/`, and in the `platform-smoke` job installs `tea-tour`, runs the story and the screens, removes it, runs the removal check, then `make apps-smoke`

### Changed
- **Version**: `apps/web/package.json` is `1.8.0`, the core version the mini-app manifests require (ruling R7)
- **APISIX route file**: apisix now mounts `${DXOS_GATEWAY_FILE:-../platform/gateway/apisix.yaml}`. The Makefile and `./dxos` set `DXOS_GATEWAY_FILE` to the generated `../docker/runtime/<project>/gateway/apisix.yaml`; without it (release bundle, a bare `docker compose up`) apisix reads the tracked base file and serves no app route
- **Compose**: `postgres` also mounts `platform/postgres/init/05-apps.sql` and, like `apisix`, joins `dxos-apps-net`; the `dxos-cli` service is added under profile `tools`

### Fixed
- **`make platform-smoke` re-run on a seeded stack**: two checks of `smoke-dataops.sh` counted every LB reading, including the ones `[lifecycle]` backfills for the seeded LB parcels in the first run, so any second run failed. They now count only the fixture parcel `P-LB-001`, whose rows the section deletes first
- **The gateway could send one mini-app's requests to another after a reinstall**: Docker's DNS answers app names with a 600 s TTL and gives a removed app's IP to the next container, and APISIX kept the old answer. After `./dxos remove tea-tour`, `./dxos install miniapps/hello` and a reinstall of `tea-tour`, tea-tour's requests, with the user's token, reached `hello` (CI run 43178558735: creating a tour got hello's 404). `platform/gateway/config.yaml` now sets `apisix.dns_resolver_valid: 1`, so the gateway resolves app names again every second. `make apps-smoke` first replays that sequence and checks that 30 requests on new connections all reach `tea-tour`

### Upgrade notes
- **Routes written before the internal-port fix**: an app installed from a pre-release build of this branch has a route file without the `9081` condition, and `gateway-sync` refuses it. Run `./dxos remove <id>` (it deletes that route file), then `./dxos install miniapps/<id>` again
- **Start the stack with make**: `make platform-up` (or `make up`) creates `docker/runtime/<project>/gateway/apisix.yaml` and sets `DXOS_GATEWAY_FILE`. When starting `web` on its own, pass the same variable (`DXOS_GATEWAY_FILE=../docker/runtime/docker/gateway/apisix.yaml docker compose -f docker/docker-compose.yml up -d --build --wait web disease-api`), or Compose recreates apisix on the base file and the app routes disappear until the next `make platform-up`
- **First `make platform-up` recreates `postgres` and `apisix`**: their mounts changed (the new init file, the generated route file) and both join `dxos-apps-net`. The data in `docker_pgdata` is kept, and `platform-init` creates `platform.installed_apps` on the existing database. Never delete the `docker_*` volumes
- **Runtime state per compose project**: generated files live under `docker/runtime/<project>/` (git-ignored), where `<project>` is the `COMPOSE_PROJECT_NAME` environment variable, default `docker`. Set the project with that variable; `./dxos` and the Makefile do not read `-p` or `docker/.env`. No app was installed before this release, so nothing needs moving
- **Release bundle**: v1.8.0 does not install mini-apps from the release bundle (no `dxos-cli` image is published); the release stack starts apisix on the base route file as before, with no change to the release steps
- **Demo**: build the `tea-tour` image ahead (install it once, then `./dxos remove tea-tour --purge`), so `./dxos install miniapps/tea-tour` takes about 11–12 seconds. On Docker Desktop, start web for the demo with a higher `DXOS_APP_PUBLIC_LIMIT` (for example 300), since every phone shares one IP (README, "Chuẩn bị demo")

### Known limits
- **Cross-app trust** (ruling R24): every installed app shares `dxos-apps-net`, and an app decodes the token's claims without verifying the signature (the gateway verifies user requests). Another installed app can therefore call it directly with a forged token, with any HTX and role, and read or change its data. Install only trusted apps. Real per-app isolation (JWT verification or a network per app) is deferred to v1.9
- **`npm run dev` outside Docker cannot reach mini-apps**: app routes match only on `apisix:9081`, which the host cannot reach; work on mini-apps with the `web` container
- **Public limit and `X-Forwarded-For`**: the public mini-app limit trusts the first `X-Forwarded-For` element and counts per web process, like `/api/register`; a client can forge the header to get a new bucket. It must move to the gateway or a shared store when web runs more than one instance
- **`PUBLIC` keeps `CONNECT` on the other databases** (`keycloak`, `postgres`, `template1`) in v1.8.0 (ruling R17): an app role can connect there, and default privileges an app leaves there make `--purge` fail (the env file is kept) until an admin runs `DROP OWNED BY app_<id>` in that database
- **The `--purge` dependency guard covers table, type and function dependencies only**: an object outside the schema that depends on another kind of app object (for example a core column using an app collation) is dropped by `DROP SCHEMA ... CASCADE`
- **Migrations are recorded by file name only, with no checksum**: editing an applied file has no effect on an existing install, and an unpurged dev install keeps the old version. A `COMMIT` inside a migration file breaks its one-transaction-per-file rule (the app's schema only)
- **Re-installing over an existing app role logs in as that role**: a stale env-file password or 10 connections already held make the install fail, safely, with nothing changed
- **Soft 404 on a missing app's shell page** (ruling R15): `/<role>/apps/<missing>` renders the 404 page with HTTP 200, because the role layouts stream their loading state first, like the existing `/lot`, `/q` and `/htx` pages. The proxy `/apps/<id>/...` answers a real 404, so a removed app is unreachable
- **A bare `docker compose up` has no app routes**: without `DXOS_GATEWAY_FILE`, apisix serves only the base routes, which fails closed
- **`/apps/<id>` without a trailing slash** answers 404 at the gateway; the web proxy always sends `/apps/<id>/...`
- **Behind a TLS proxy** the proxy's own scheme is `http`, so the Origin check relies on `AUTH_URL` naming the public URL, as the documented deployment already sets it

---

## [1.7.0] - 2026-11-11

### Added
- **Tea leaf disease model**: `ai-models/tea_leaf_model.keras` (MobileNetV2 transfer learning, 224×224, 8 classes listed in `ai-models/tea_class_names.txt`, 9.2 MB) with Vietnamese labels in `tea_class_names_vi.json`, each marked for officer review. `ai-models/tea/` holds the reproducible pipeline (`train.py`, `datasets.json` with DOIs, download URLs and SHA-256, pinned `requirements.txt`) that runs in `python:3.12.15-slim-bookworm`. It is trained on three CC BY 4.0 Mendeley datasets (Kimutai and Förster, Kenya; Islam, Bangladesh; Billah et al., Bangladesh), credited in `ai-models/ATTRIBUTION.md`; no image is committed. `ai-models/tea/MODEL_CARD.md` reports the measured numbers: test accuracy 0.8683 on 1,025 images and confidence threshold 0.60, but only 0.12 to 0.35 when one source is held out, and a random-noise image is called `healthy` at 0.988. Accuracy on Thái Nguyên photos is not measured; every result goes to an officer
- **Tea disease model served**: `POST /predict?model=tea` on `disease-api` uses the tea leaf model next to the general one (still the default; any other model name answers 400). Responses gain `model` and `uncertain`; a tea result below `TEA_CONFIDENCE_THRESHOLD` (default `0.60`, rejected at startup outside (0, 1]) has null names and keeps `top3`. `/health` adds `models` with each model's state
- **Tea disease flow in the web app**: a parcel whose crop names `chè`/`tea` is diagnosed with the tea model, any other with the general one. An uncertain result is stored as `Không xác định`, and every result still goes to the officers; the farmer screen says `Đã gửi cán bộ kỹ thuật xem` instead of presenting a final diagnosis. A 503 from the tea model is an outage (503 `AI_UNAVAILABLE`), never a fallback to the general model
- **Officer's confirmed diagnosis**: the review form has a **Tên bệnh đã xác nhận** field, pre-filled with the AI name (empty when uncertain). `PUT /api/officer/diseases/[id]/review` takes `confirmed_diagnosis`, required when approving, and stores it in `confirmed_diagnosis`; the farmer history, officer lists, soil-health screen, notification and archived report show it over the AI name
- **Tea harvest rounds**: `POST /api/parcels/[id]/start-round` (officer only, `TenantGuard.parcel`) moves a `HARVESTED` parcel to `TENDING` and opens the cycle `Lứa <n>/<year>`, numbered within the year in Vietnam time. The status check and the new cycle are one transaction, so a second start, or a start on any other status, is refused with 422 and creates nothing. The officer's household screen has a **Bắt đầu lứa mới** button on harvested parcels
- **Journal photo upload**: `POST /api/journal/upload` (farmer and officer) returns a presigned upload URL valid for 900 seconds and the key `para/<htxCode>/Areas/Journal/<yyyy>/<uuid>-<safe name>`, which `POST /api/journal` accepts as `photo_minio_key`. Only `image/jpeg`, `image/png` and `image/webp` are accepted; the name is reduced to its last segment without Vietnamese marks or unsafe characters, capped at 100 characters. The farmer journal form's photo upload called this route before it existed; the A3 browser story uploads a photo through it to storage and opens it again
- **Withdrawal on the farmer dashboard**: `Thửa <mã> còn <N> ngày cách ly` for each parcel of the farmer's household whose latest safe harvest date (from journal entries not rejected) is still ahead; `N` is whole days, rounded up
- **Tea demo data**: `npm run seed` (new script, runs `prisma db seed`) creates the Tân Cương (`TC`) and La Bằng (`LB`) cooperatives with made-up households and tea parcels (Trung du, LDP1, Kim Tuyên). Parcel `TC-A3` has, relative to the seed run, a fertiliser entry, a spraying entry still under its 7-day withdrawal, a harvested previous round whose lot `TC-CHE-A3-001` is already exported with a public trace page, and one pending tea disease report. Re-running it changes only `TC` and `LB` rows (plus the shared market, bulletin and partner rows); the history of the seeded parcels is rebuilt with fresh dates. `platform/tests/seed-test.sh` checks this on a throwaway database
- **Tea demo accounts** in the realm: `manager_tc`, `officer_tc`, `farmer_tc`, `manager_lb`, `officer_lb`, `farmer_lb` (password `Test1234!`; managers and officers must set up TOTP). The farmers have fixed ids, which the seed uses to link them to their household
- **Tea market data**: `comtrade_export_sync` also fetches HS `0902` and stores it as `Tea`; `vietnam_market_sync` adds a simulated dried tea bud price (`Tea`, `VND/kg`). Every price that workflow simulates is now written under the source `Mô phỏng (Toàn quốc)` instead of naming a ministry or market portal, and the dashboard price list, the market widget and the chatbot's market context label such prices `giá mô phỏng`; the chatbot and the bulletin prompt must say so too, and the chatbot's context no longer calls its market data "thực tế". The market widget names no source when it has no data. Prices already stored under the old source names are not relabelled
- **Design system and dark mode**: `DESIGN.md` (google-labs-code/design.md format) documents the tokens of `apps/web/src/styles/globals.css`, which now has a dark value for every colour token, applied under `prefers-color-scheme: dark` unless the viewer picked light, or under `data-theme="dark"`. A theme button (Sáng → Tối → Theo hệ thống, stored in `localStorage` key `opentea-theme`) sits in the top bar and on the home and login pages; an inline script sets the stored theme before first paint and does nothing if storage is blocked. Tailwind's `dark:` variant follows the same choice, and semantic tokens (`bg-danger-subtle`, `text-ink-secondary`, ...) are available as Tailwind colours. Tests check that every light token has a dark value, that text/background pairs reach WCAG AA 4.5:1 in both themes, and that `DESIGN.md` matches `globals.css`. A colour guard fails on hard-coded colours in `*.module.css` and `*.tsx`; its baseline of files still to convert (74 when it was added) was emptied by the move to tokens below
- **A3 story and priority screens in the browser**: `tests/e2e/story/tea-a3.spec.ts` runs "Một ngày của lô chè A3" on the seeded stack with real Keycloak logins: the farmer sees A3's withdrawal and adds a journal entry with a photo uploaded to storage; a tea photo diagnosis goes through the gateway to the tea model (checked in the `disease-api` access log) and into the officer queue, where the officer confirms it with a name the farmer then sees; harvest approval and a lot of A3 are refused during the withdrawal; the officer creates and exports a lot of `TC-A2`; the public pages `/q/<code>` of that lot and of `TC-CHE-A3-001` show their withdrawal status. `tests/e2e/visual/screens.spec.ts` saves the priority screens of spec §6.4 (9 pages: the disease review is both the queue and the review form) at 1280×800 and 390×844 in light and dark (36 screenshots under `test-results/screens/`) and fails on page-level horizontal overflow, on overlapping visible text, and on a theme button missing from or crowded in the phone top bar. The `platform-smoke` CI job now seeds the demo data, starts `disease-api` with `web`, runs both specs after the core tenant spec and uploads the screenshots as the `priority-screens` artifact. `make platform-smoke` also creates `smoke_officer_tc`, because the demo officers must set up TOTP first
- **Home page**: `/` is now public for signed-out visitors, with a short introduction, a sign-in button and a lot code field that opens the public trace page `/q/<code>` (signed-in users are still sent to their dashboard). The PWA icons are real 192 and 512 px tea-leaf icons and are served without a session

### Changed
- **disease-api dependencies pinned**: every package in `apps/disease-api/requirements.txt` has an exact version, and `tensorflow-cpu` (unpinned, no arm64 wheel) is replaced by `tensorflow==2.21.0` with `keras==3.15.1`, so the image also builds on arm64; it is larger than before. The 46-class general model gives the same prediction as with the previously resolved versions. A pytest suite (`requirements-dev.txt`: `pytest`, `httpx2`) covers model selection, the threshold and the general model, and the CI job "Lint FastAPI" now runs it with `-W error`
- **Brand**: the product is named `OpenTea DX-OS` everywhere (page titles via one title template, sidebar, top bar, login, register and PIN pages, trace pages, PWA manifest and the Keycloak login theme's title), from `apps/web/src/lib/brand.ts`. The Keycloak theme directory and realm keep the name `agrimarket`
- **Colours**: the accent is now amber (`#b45309`, was orange `#EA580C`); the status, feedback and tertiary text colours are darkened where white or coloured text missed 4.5:1; `--font-family-sans` uses Be Vietnam Pro instead of an Inter font that was never loaded. The login page uses tokens only
- **Tea vocabulary**: the app no longer speaks of rice. Placeholders, chat suggestions, mock bulletins, the soil-health warning and the seeded market, bulletin and partner rows use tea; the seed no longer attributes made-up figures to real bodies (its FAOSTAT rows and the bulletin's WTO and Sở NN&PTNT sources are gone, and its one demo price is simulated); the menu item `Lịch vụ mùa` is now `Lịch thu hái`; a new zone's season defaults to `Lứa 1/<year>`; the default commodity of the bulletin, market widget and market API is `Chè`/`Tea` (the farmer bulletin page now looks it up by its English name, as the workflows store it, and `GET /api/bulletin` without `?commodity` reads `Tea` for any tea crop of the HTX, such as `Chè Trung du`). The manager dashboard's price list shows the 3 newest tea prices, topped up with the newest other commodities only when fewer than 3 exist. A test fails when a rice word is back in the web source or the seed; its only exceptions are the commodity name maps for Comtrade rice and wheat rows
- **Demo data and accounts**: the `MD2` rice cooperative is no longer seeded, the old seed's backfill of households without an HTX is gone, and weather rows are seeded only for the seeded parcels. `manager1`, `officer1` and `farmer1` are removed from the realm
- **Smoke and browser tests** use their own `smoke_` accounts (`smoke_manager_tc`, `smoke_manager_lb`, `smoke_manager_none`, `smoke_farmer_tc`, `smoke_officer_tc`); `ensure_user` refuses any other name, so tests never reset a demo user's password or TOTP. The A3 story and the screenshots also sign in as `farmer_tc`, which has no TOTP step; a login does not change the account. The `two-htx.sql` fixture shares the `TC`/`LB` profiles with the seed instead of deleting them, and the household checks are scoped to the fixture rows plus an every-row HTX check
- **Colour tokens everywhere**: every `*.module.css` and `*.tsx` under `apps/web/src` takes its colours from `globals.css`, so all screens follow the dark theme, and the colour guard's baseline is empty. Text on primary fills uses `--color-primary-foreground` and on success or danger fills `--color-ink-inverse`; the always-dark surfaces (sidebar, bulletin header) use the sidebar tokens. The guard's `exceptions` name the exact fixed colours a file may keep, each with a reason and the number of times it may occur: parcel colours drawn on map tiles, and text in Leaflet popups and controls, which `leaflet.css` keeps white. The lot page's decorative QR preview follows the theme. About 80 variables that `globals.css` never declared (`--color-surface-border`, `--text-secondary`, `--radius-lg`, ...) now point at real tokens, so borders, muted text and rounded corners that had fallen back to nothing render as designed; `@theme` names count as undeclared because Tailwind emits them only when a utility needs them. A test fails on any `var(--…)` that `globals.css` does not declare, apart from four variables set at runtime
- **QR export rule**: every parcel of the lot needs a crop cycle harvested on or before the lot's harvest date (same day counts, in Vietnam time) instead of being in `HARVESTED`, `TENDING` or `HARVEST_APPROVED`. A lot of the previous round can be exported while the next round runs, and a parcel harvested only after the lot date is refused. The withdrawal block is unchanged

### Upgrade
- **Realm**: Keycloak imports the realm only when it is missing, and the Admin Console cannot set a user id, which `farmer_tc` and `farmer_lb` need. On an existing stack either (a) delete the realm (Realm settings > Action > Delete) and run `docker compose -f docker/docker-compose.yml restart keycloak` so `--import-realm` imports it again, which also drops users created at runtime; or (b) delete `manager1`, `officer1` and `farmer1`, then Realm settings > Action > Partial import of `docker/keycloak/realm-agrimarket.json` with only Users and Overwrite, which replaces the `manager_tc`, `manager_lb` and `farmer_tc` the old smoke created and keeps the fixed ids. Overwrite also resets the six demo users' passwords and TOTP, so do it before setting up TOTP for a demo. Never delete `docker_pgdata`: the realm lives in its `keycloak` database next to all app data
- **Demo data**: run `npm run seed` only on a demo database: it rebuilds the history of the `TC` and `LB` parcels with fresh dates. Re-run it before each demo so A3's withdrawal is active again
- **TOTP**: managers and officers set up TOTP at their first login; set it up on the demo phone before the demo (README, "Cài TOTP trước buổi demo")
- **Disease diagnosis** needs the `disease-api` container (`docker compose -f docker/docker-compose.yml up -d --build --wait web disease-api`); `make platform-up` does not start it
- **Never `down -v` on the main stack**: earlier upgrade notes (1.3.0) suggested recreating the Postgres volume or running `docker compose down -v` once for n8n. Both delete `docker_pgdata`, which holds the Keycloak realm and all app data. Use `REINDEX DATABASE` for the collation change and let n8n create its tables in the `n8n` schema (README, "Nâng cấp môi trường dev cũ")
- **Storage**: no change to `docker/.env.local` is needed. `MINIO_ENDPOINT` may be `minio` or `minio:9000`

### Fixed
- **web image on arm64**: `npm install` in the Dockerfile could leave out `@next/swc-linux-*-musl` without an error (npm skips an optional download that fails), and BuildKit then reused that broken layer, so `next build` failed on arm64 with "Failed to load SWC binary". The install step now fails when the musl SWC binary is missing
- **Photo uploads from the web app**: the storage adapters used `MINIO_ENDPOINT` as a host name while `docker/.env.local.example` sets `minio:9000`, so every request of `web` that touched storage failed with `Invalid endPoint`: journal photo upload, diagnosis, the farmer's diagnosis history, the officer's disease screens, documents and QR export. Both adapters now accept `host` or `host:port`. The browser's presigned `PUT` to SeaweedFS needed no CORS change
- **Pages hanging after a few clicks in the installed app**: the PWA service worker cached every same-origin `/api/` GET with NetworkFirst, including the `/api/notifications/stream` event stream, which never ends. Each page left an open connection behind, and after a few pages the browser's 6 connections per host were taken: requests hung, then came from the cache after 10 seconds, and form posts never went out. The stream now bypasses the cache (NetworkOnly). Found by the A3 browser story, which failed about one run in six before
- **Vietnamese status labels on the demo screens**: the trace page that the printed QR opens (`/lot/<code>`) showed the raw `QR_EXPORTED` (or `READY`) pill and now shows `Đã xuất QR`, `Sẵn sàng` or `Bản nháp`; the officer disease queue and review showed `PENDING` and now show `Chờ duyệt`; the farmer's diagnosis history mapped a status the reports never take (`RESOLVED`) and showed `CONFIRMED`/`REJECTED` raw, and now shows `Chờ duyệt`, `Đã xác nhận` or `Bị từ chối`. The lot form and the QR export show a refusal without its machine code (`WITHDRAWAL_NOT_PASSED: `), which the API still returns
- **Market sources on the manager dashboard**: the source box counted price rows instead of sources, called a simulated price "nguồn đã kiểm chứng", and with no data named USDA, WTO and Sở NN&PTNT. It now counts distinct real sources only, names simulated sources on their own line ("Nguồn mô phỏng: …"), and names none when there is no data
- **Farmer dashboard weather** showed the stored WMO code (for example `3`) and now shows its Vietnamese name (`U ám`)
- **Phone top bar**: the product name broke after the hyphen ("OpenTea DX-" / "OS"); it now stays on one line, slightly smaller at 400 px and below
- **Demo lot grade**: the seeded lot `TC-CHE-A3-001` is graded `Loại 1` instead of `Grade 1`
- **disease-api health check** allows 60 seconds for both TensorFlow models to load before failed checks count, so `up --wait` does not give up on a cold machine
- **Missing report photos**: a disease report whose photo is not in storage (the seeded A3 report, or one quarantined by the scanner) now shows "Không tải được ảnh" in the officer queue, the officer review and the farmer's history instead of a broken image
- **e2e session harness**: the specs that forge an Auth.js cookie signed it with a fallback secret the Playwright dev server never had, and without `htxCode`, so 20 of them landed on `/login` or the NO_HTX notice. `playwright.config.ts` sets an e2e-only `AUTH_SECRET` for the dev server and the specs, and one helper (`tests/e2e/helpers/forged-session.ts`, HTX `TC`) replaces the 12 copies
- **Chatbot market context**: its header said the data covered 48 hours while the query reads 30 days; it now says 30 days
- **Sidebar profile menu**: it sat on `--card` with white text, so in light mode its links were white on white. It now uses the overlay surface and ink tokens
- **Journal reject button**: the officer's "Từ chối nhật ký" button set its fill from an undefined variable, so it was transparent and its white text was invisible on the white dialog. It is now a danger fill with `--color-ink-inverse` text
- **Exported lot status on the public trace page**: the snapshot stored at QR export was read before the export, so it kept `status: 'READY'` and the lot's earlier QR image (normally none); the public page then showed a READY pill and no "locked" banner for every lot exported in the app. The snapshot now stores `QR_EXPORTED` and the generated QR image. Snapshots already stored with `READY` are not rewritten, so lots exported before this fix still show READY on their public page (an exported lot cannot be exported again)
- **Journal photo keys**: `POST /api/journal` accepted any `photo_minio_key` inside `para/<htxCode>/`, so a farmer could attach any document of their HTX, a manager-only one for example, and receive a signed download URL for it from `GET /api/journal`. It now accepts only a file key under `para/<htxCode>/Areas/Journal/` (400 otherwise), and the journal list signs only such keys; a row stored with another key comes back without a photo. No legitimate photo is lost: the upload route did not exist before this release
- **Farmer diagnosis confidence**: the result and history showed the 0–1 confidence as a percentage without scaling (`0.988` as `1.0%`), and the low-confidence warning always showed. They now show `98.8%` and warn only below 70%

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

[Unreleased]: https://github.com/maiychrus25/OpenTea-DX-OS/compare/v1.10.0...HEAD
[1.10.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.10.0
[1.9.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.9.0
[1.8.1]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.8.1
[1.8.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.8.0
[1.7.0]: https://github.com/maiychrus25/OpenTea-DX-OS/releases/tag/v1.7.0
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
