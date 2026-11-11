<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 OpenTea Developers -->
# ADR 0002: Mini-apps as separate services behind the gateway

- Status: Accepted
- Date: 2026-11-11

## Context

Tier 3 lets an HTX or an outside developer add a feature to DX-OS without
changing the core. The plug-in model is the main point of the OLP 2026 entry.
The demo installs a tea hill tour booking app (`tea-tour`) live and removes it
again, and the core must keep running, with every smoke and browser test green,
when no mini-app is installed.

The core already has what such an app needs:
- Keycloak tokens with `htx_code` and realm roles.
- APISIX in standalone YAML mode, with an internal port `9081` for the web
  container.
- Hasura row permissions on `htx_code`.
- Python services built from the same base image (`disease-api`,
  `dxos-scanner`, `dxos-dataops`).

## Decision

Each mini-app is its own service, described by an `app.yaml` manifest
(`apiVersion: dxos/v1`, JSON Schema in `platform/apps/manifest.schema.json`)
and installed with the `dxos` CLI (`./dxos install|remove|list|validate`).

- **Process:** one container per app, built from the app directory or pulled
  by `@sha256:` digest. The CLI generates its compose file with fixed settings
  that the manifest cannot change:
  - network `dxos-apps-net` only (`internal: true`, shared with `apisix` and
    `postgres` alone), no host port;
  - user `10001:10001`, read-only root filesystem, `/tmp` tmpfs;
  - `cap_drop: [ALL]`, `no-new-privileges`;
  - 256 MB of memory and 0.5 CPU.
- **Routes:**
  - The CLI writes the app's APISIX routes under `/apps/<id>/` into
    `docker/runtime/<project>/gateway/` and merges them with the tracked
    `platform/gateway/apisix.yaml`. APISIX reloads the merged file in place.
  - Protected prefixes use `openid-connect` `bearer_only`, plus a `claim_schema`
    check on `realm_access.roles` with the manifest's roles.
  - The tracked file is never modified at runtime.
- **Sign-in:**
  - The web app proxies `/apps/<id>/...` to `apisix:9081`. It attaches the
    user's access token, taken server-side by `getCoreToken()`, on protected
    paths only.
  - It forwards only to ids in `platform.installed_apps`, drops the browser's
    cookies and authorization headers, and refuses cross-site writes.
  - The app reads claims from the token that the gateway verified. Only the
    gateway can reach the app, and that is the trust boundary.
- **Data:**
  - Each app gets a schema and a login role, both `app_<id>`, with rights on
    that schema only and a connection cap.
  - Migrations run as that role, and every table must have
    `htx_code text NOT NULL`.
  - Core data is read through Hasura with the user's own token, so the core's
    tenant rules apply unchanged.
- **UI:**
  - Pages are rendered on the server, as HTML and forms with no JavaScript.
    Every response under `/apps/` carries `script-src 'none'`.
  - Signed-in pages show inside the app shell in an
    `<iframe sandbox="allow-forms allow-same-origin allow-top-navigation-by-user-activation">`.
  - `/dxos-app.css` gives apps the core's design tokens, and `?theme=` passes
    the viewer's light or dark choice.
- **Lifecycle:**
  - The CLI journals its steps (validate, database, gateway, compose).
    `./dxos` then starts the container and registers the app.
  - A failure or an interrupt at any step undoes the earlier steps in
    reverse order.
  - Remove keeps the app's data unless `--purge` is given.

## Alternatives considered

- **Next.js modules compiled into `apps/web`** (a plugin folder or package
  per app): rejected.
  - Every install or removal would mean a rebuild and a redeploy of the core
    image, which is the opposite of plug-in.
  - App code would run inside the web process, with its session cookies,
    secrets and database connection.
  - A broken or malicious app could take down or read the whole core.
- **A low-code builder** (forms and workflows defined in n8n or a form
  builder, stored as data): rejected.
  - It cannot express what `tea-tour` needs: a booking that locks the tour
    row so concurrent guests never oversell, per-HTX data rules, and public
    and role-scoped pages.
  - It ties apps to one engine. n8n is not OSI-licensed (ADR 0001).
  - A visual builder's output is hard to review and test.
- **Client-side apps with scripts in the frame** were also rejected. A script
  inside the app shell's origin could read the user's session, and the
  sandbox without `allow-scripts` removes that whole class of risk.

## Consequences

- Installing or removing an app touches no tracked file and does not rebuild
  the core. With the image built ahead, `./dxos install miniapps/tea-tour`
  takes about 11–12 seconds.
- A stack with no app installed has a gateway file identical to the base and
  behaves as before. A stack started with a bare `docker compose up` (no
  `DXOS_GATEWAY_FILE`) has no app routes, which fails closed.
- Apps are limited by design:
  - no JavaScript, no cookies, and no response headers beyond `content-type`
    and a redirect `location` inside the app;
  - no internet access at run time;
  - a Python image for the health check.
- Each app is one more container (256 MB cap) and one more database role.
  The role keeps `CONNECT` on the other databases through `PUBLIC` in v1.8.0
  (ruling R17).
- The public route limit (10 requests a minute per IP) is enforced in the web
  proxy per process, and it trusts `X-Forwarded-For`. It must move to the
  gateway or a shared store when web runs more than one instance.
- The release bundle of v1.8.0 cannot install mini-apps: no CLI image is
  published, and the release stack starts with the base gateway file.
- The manifest format is now a public contract (`dxos/v1`). Breaking changes
  need a new `apiVersion`.
