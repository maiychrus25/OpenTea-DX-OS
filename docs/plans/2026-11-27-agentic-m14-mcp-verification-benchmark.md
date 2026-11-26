<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M14: MCP for outside agents, the lot verification line, the public benchmark — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** three outward-facing parts of the agentic layer.
1. A person connects any MCP client (Claude Desktop, Claude Code, Codex or another) with their own Keycloak account. The client gets the assistant's read tools and exactly one write tool, "create a proposal". The person still confirms every proposal on the web or Telegram (test 38).
2. The public lot trace page shows `AI đề xuất, <vai trò> đã duyệt ngày …, kiểm chứng trong sổ audit` only when the decision is in an intact audit chain and the evidence hash matches (test 39).
3. Anyone can rerun the agent scenario suites against a model with one command, and the results table is published in `docs/`.

**Architecture:**
- **MCP.**
  - The web serves the tools as JSON over two bearer-authenticated routes behind the gateway. The bearer is the person's Keycloak access token.
  - A small standard-library bridge, `platform/mcp/dxos_mcp.py`, speaks MCP over stdio to the client. It logs the person in with the OAuth 2.0 device authorization grant on a new public Keycloak client `dxos-mcp`, keeps and refreshes the tokens, and forwards tool calls.
  - Stdio works with every MCP client and needs no OAuth server inside the web.
- **Verification line.** It is computed on the server from the proposal, its audit events and `audit.verify_chain()`.
- **Benchmark.** It reuses the replay scenario files and the provider classes.

**Tech Stack:** Next.js 14 + zod (`apps/web`), Python 3.12 standard library (`platform/mcp`, `platform/agent`), Keycloak 26 (device grant), PostgreSQL 16.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md`: §8.5, §7.2 (lot decisions in the audit), §15 (public benchmark, tests 38 and 39), §15.1 step 4, milestone row M14 in §17.

## Global Constraints

- **Repository rules:** `AGENTS.md`.
  - English Conventional Commits and English identifiers.
  - Vietnamese user-facing text with diacritics.
  - SPDX headers on new files.
  - No secrets and no `.env*` files. No new dependency: the bridge and the benchmark are standard library, and the web needs no MCP SDK.
- **MCP proposals.** An MCP request never executes anything.
  - A proposal from MCP has `origin: 'user'`, `requested_by` set to the person, and `agent: 'mcp'`.
  - It is decided only through `DecideProposalUseCase` by someone with the kind's approver role, which may be the person.
  - In autonomous mode (M12), `origin: 'user'` never runs on its own; M12 must keep this.
- **MCP rights.** An MCP client has exactly the person's rights. Role, cooperative and enabled flag are read live, as for Telegram (`LiveRoleReader`).
- **Public lot page.** It never shows a person's name. The line shows the role only.
- **New routes** are classified in `coverage.ts` (test 17): `/api/mcp/**` goes to the `none` group, because they are not Telegram.
- **Unchanged behaviour:** M1 to M8.

## Review Focus

1. **Token problems** (test 38 and C2): an expired token, a token for another client, a disabled user, or a role removed after login. Expected: 401 or 403, and nothing created.
2. **A kind the person cannot decide.** A proposal for a kind whose `approverRoles` exclude the person's role is refused (403 `NOT_AN_APPROVER`): they could never confirm it.
3. **A forged verification line** (test 39). No line appears when:
   - the audit chain is broken (`verify_chain` reports a bad row);
   - the proposal's evidence hash differs from the one in its decision event;
   - the proposal was rejected;
   - the lot has no AI decision.
4. **Bridge token refresh.** A refresh that fails (refresh token expired) tells the client to run `login` again; it never crashes the stdio loop.
5. **Benchmark against a provider that fails mid-suite.** The run records the failure per case and still writes the table.

---

## Contracts

### C1. Web MCP routes

**`GET /api/mcp/tools`** answers `{ "tools": [{ "name", "title_vi", "description_vi", "input_schema" }] }`:
- the person's allowed `CHAT_TOOLS`, with their `args` as JSON Schema properties;
- the write tool `create_proposal`, with input `{ "kind": string, "payload": object, "reason_vi": string (1..500) }`.

**`POST /api/mcp/tools/[name]`** with body `{ "arguments": {...} }`:
- a read tool answers `{ "text": "<lines>\nNguồn: <source>" }`;
- `create_proposal` answers 201 `{ "proposal_id", "status": "proposed", "message_vi": "Đã tạo đề xuất. Bạn cần xác nhận trên web hoặc Telegram." }`.

**`create_proposal` rules:**
- `kind` must be in the catalogue with `'user'` in `origins`. These kinds gain `'user'`: `notification.internal`, `notification.households`, `disease.inspection`, `journal.approve`, `journal.reject`, `harvest.approve`, `bulletin.publish`.
- The person's role must be in the kind's `approverRoles`; otherwise 403 `NOT_AN_APPROVER`.
- The payload goes through the kind's `payloadSchema`. `humanOnlyFields` are allowed, because a person writes them.
- **Evidence is built by the web from the payload's subjects,** with the hashing `isStale` uses (a new helper `evidenceForSubjects(kind, payload, htxCode)`). A subject outside the cooperative gives 400 `EVIDENCE_NOT_IN_HTX`.
- The proposal is queued to Telegram like any other proposal (`notifyProposalCreated`). Audit: `agent.proposal.created` with `origin: 'user'` and `channel: 'mcp'`.

**Auth:**
- `Authorization: Bearer <access token>` from realm `agrimarket`, verified by signature, issuer and expiry, with `azp` equal to `dxos-mcp`.
- The live role, cooperative and enabled flag come from `LiveRoleReader`, and the `ChatUser` is built as for Telegram.
- Errors: 401 `UNAUTHORIZED` (bad, expired or foreign token), 403 `FORBIDDEN` (disabled user, or no role).

**Gateway:** APISIX routes `/api/mcp/*` on the public port to the web, as other `/api/*` routes are.

### C2. Keycloak client `dxos-mcp`

- Public client with `oauth2.device.authorization.grant.enabled = true`. Standard flow off, direct access grants off.
- Access token lifespan as the realm. Offline access not allowed.
- It is added to `docker/keycloak/realm-agrimarket.json` for new installs, and through `make mcp-client` (kcadm, idempotent, like `make mobile-client`) for running ones.
- The access token carries the realm roles and the `htx_code` claim, using the same mappers as `dxos-web`.

### C3. Bridge `platform/mcp/dxos_mcp.py`

**Commands:**
- **`login --server <base URL>`:**
  - runs the device grant against `<server>/auth/realms/agrimarket` (the Keycloak base is configurable with `--issuer`);
  - prints the verification URL and the user code;
  - polls until approved;
  - stores `{issuer, server, access_token, refresh_token, expires_at}` in `~/.config/dxos-mcp/token.json` with mode 0600.
- **`serve`:** MCP over stdio, JSON-RPC 2.0, one message per line. It supports:
  - `initialize`, answering `protocolVersion` `2025-06-18`, `capabilities: {tools: {}}`, and `serverInfo` `dxos-mcp` with the repository version;
  - `notifications/initialized`;
  - `tools/list`, which maps `/api/mcp/tools`;
  - `tools/call`, which maps `/api/mcp/tools/<name>` and answers `{content: [{type: "text", text}], isError}`;
  - `ping`.

**Behaviour:**
- It refreshes the token when it expires within 30 s.
- A failed refresh makes the call answer `isError` with the text `Phiên đăng nhập đã hết. Chạy: python3 dxos_mcp.py login --server <server>`.
- It never prints the token. It logs to stderr only.

**Docs:** `platform/mcp/README.md` explains the login and gives config snippets for Claude Desktop, Claude Code and Codex. The MCP clients are named there as products, not as contributors.

### C4. Lot verification line (public trace page)

`LotAiVerification` (`apps/web/src/application/lot/lot-ai-verification.ts`), for a lot:
1. For each parcel of the lot, take the latest `harvest.approve` proposal of that parcel that is `executed` before the lot was created.
2. Take its decision audit event: the `agent.proposal.decided` event, or the event the decision use case writes today; reuse it and do not add a new one. Read the event's evidence hash.
3. Show the line when all of these hold:
   - the event exists;
   - its evidence hash equals the proposal's `evidence.sha256`;
   - `audit.verify_chain()` reports no bad row up to that event.
4. The line is `AI đề xuất, <cán bộ|trưởng HTX> đã duyệt ngày <dd/MM/yyyy>, kiểm chứng trong sổ audit` (roles: officer → `cán bộ`, manager → `trưởng HTX`). With several parcels, show one line per distinct decision, at most 3. No name is ever shown.
5. The trace page shows the lines in the existing trace layout as a small verified block. When there are none, nothing is shown.

### C5. Benchmark (`platform/agent/benchmark.py`, `make benchmark`)

- `make benchmark PROVIDER=<replay|ollama|anthropic|openai> MODEL=<id>` runs every `platform/agent/tests/scenarios/*.json` suite through the agents' own pure functions with the chosen provider (the replay provider gives the reference answers). Keys come from the environment, as for `dxos-agent`.
- **Per suite and case, it records:**
  - **correct:**
    - rule agents: the proposals and dropped items equal the expected ones;
    - A1: the decision equals the expected one;
    - A7: the intent equals the expected one;
    - A5, A9, A10: the output passes the schema and the length limits;
  - latency in ms;
  - tokens;
  - estimated cost (`estimate_cost_usd`).
- **Output:** a Markdown table appended to `docs/benchmark.md`, under a heading `<date> · <provider> · <model>`, with columns `Bộ kịch bản | Số ca | Đúng | Độ trễ trung vị (ms) | Chi phí (USD)`, plus a total row.
- A provider error marks the case failed and the run goes on.
- `docs/benchmark.md` starts with how to run it and holds the replay baseline. The main session adds the owner's AI host run at integration.

---

## Tracks

Four parallel sessions start from the commit of this plan, each in its own worktree and branch, and merge into `feat/55-agentic-m14`.
- Keep to your files.
- Follow C1–C5 exactly.
- If a contract cannot work as written, build the closest version and say exactly what differs in the report.

| Track | Branch | Owns |
|---|---|---|
| W web | `feat/55-agentic-m14-web` | `apps/web/**`, `docs/api-contract.md` |
| B bridge and Keycloak | `feat/55-agentic-m14-bridge` | `platform/mcp/**`, `docker/keycloak/realm-agrimarket.json`, `Makefile` (`mcp-client` target only), `platform/gateway/apisix.yaml` (the `/api/mcp/*` route on the public port) |
| A benchmark | `feat/55-agentic-m14-bench` | `platform/agent/benchmark.py`, `platform/agent/tests/test_benchmark.py`, `docs/benchmark.md`, `Makefile` (`benchmark` target only) |
| I smoke and docs | `feat/55-agentic-m14-infra` | `platform/tests/**` except `platform/agent/tests`, `docs/rules-and-limits.md`, `README.md` |

### Track W

**W-1: auth and tools routes.**
- C1 auth and `GET /api/mcp/tools`.
- [ ] Tests:
  - expired token → 401;
  - another client's token → 401;
  - disabled user → 403;
  - a farmer gets only farmer tools;
  - every tool has a JSON Schema;
  - the coverage rows.
- [ ] Commit.

**W-2: tool calls and `create_proposal`.**
- [ ] Tests:
  - a read tool answers the engine's lines plus the source;
  - `create_proposal` for `notification.internal` by a manager → 201, `origin: 'user'`, `requested_by`, `agent: 'mcp'`, server-built evidence, and a Telegram message queued;
  - `NOT_AN_APPROVER`;
  - a kind not in the user origins → 400;
  - a foreign subject → `EVIDENCE_NOT_IN_HTX`;
  - test 38: no route or tool executes, and the proposal stays `proposed` until decided.
- [ ] Throwaway Postgres check of the evidence builder (container `dxos-m14-web-pg`, port `127.0.0.1:55461`).
- [ ] Commit.

**W-3: lot verification.**
- [ ] Tests (test 39):
  - a line for an executed harvest with an intact chain and matching hash;
  - no line for a broken chain (simulate `verify_chain` reporting a bad row), a hash mismatch, a rejected proposal, or no decision;
  - the role wording;
  - no name in the output;
  - at most 3 lines.
- [ ] Add the block to the trace page.
- [ ] Headless check at 1280 and 390 px, light and dark. Commit.

**W-4: docs and checks.**
- [ ] Update `api-contract.md`.
- [ ] Run the whole Jest suite, lint, `tsc --noEmit`. Commit.

### Track B

**B-1: the bridge.**
- [ ] Unit tests with a fake web and a fake Keycloak (`http.server` on 127.0.0.1):
  - the device flow (pending, slow_down, approved);
  - the token file mode 0600;
  - refresh;
  - a failed refresh message;
  - `initialize`, `tools/list`, `tools/call`, `ping`;
  - malformed JSON-RPC → error `-32700` or `-32600`;
  - the token never in stdout or stderr.
- [ ] Commit.

**B-2: Keycloak client and gateway.**
- [ ] C2 in the realm JSON and `make mcp-client`.
- [ ] The `/api/mcp/*` route.
- [ ] Tests in `platform/tests` that check the realm entry and the route.
- [ ] Commit.

**B-3: README.** Client config snippets and the login flow. Commit.

### Track A

**A-1: runner.**
- [ ] C5 with tests: the replay provider gives 100% correct on every suite; a failing provider records failures and still writes the table; the table format.

**A-2: docs and target.**
- [ ] `docs/benchmark.md` with the run instructions and the replay table.
- [ ] `make benchmark`.
- [ ] Run `PYTHONPATH=platform/agent uvx --python 3.12 pytest platform/agent/tests -W error`. Commit.

### Track I

**I-1: `platform/tests/smoke-mcp.sh`.**

Sourced by `smoke-agentic.sh` last; adds no PASS line to `make platform-smoke`.
- Setup:
  - run `make mcp-client`;
  - get a `dxos-mcp` token for `smoke_manager_tc`. In CI, direct grant is off, so enable the device grant flow through kcadm, or approve a device code through kcadm/admin API. Choose the most robust way and explain it.
- Through the bridge's `serve` command on stdin and stdout, assert:
  - `tools/list` has `create_proposal`;
  - a read tool answers;
  - `create_proposal` makes a `notification.internal` proposal with `origin` `user`;
  - the linked manager approves it through the Telegram stub, and it is `executed`.
- Lot line:
  - create a lot with the parcel whose harvest M4's smoke approved, through the existing lots API as the manager;
  - fetch `/lot/<code>` and assert `kiểm chứng trong sổ audit`.
- [ ] Add `test_smoke_scripts.py` checks.

**I-2: docs.**
- [ ] `rules-and-limits.md`: MCP limits (C1, C2) and the verification rule (C4).
- [ ] `README.md`: a short MCP section and a link to `docs/benchmark.md`.
- [ ] Run checks. Commit.

## Integration (main session)

1. Merge the four tracks.
2. Cross-track check on a throwaway Postgres: the bridge's `serve` against the real routes, with a token verifier stub, creating a proposal that `DecideProposalUseCase` executes.
3. Run the benchmark against the owner's AI host (the OpenAI-compatible provider) and add its table.
4. Add the spec notes. Open the PR, and merge when CI is green.
