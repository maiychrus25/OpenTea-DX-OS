<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M9: mini-app actions and business campaigns — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a mini-app declares in `app.yaml` what an agent may suggest and do in it.
- Its suggestions become ordinary proposals that a person approves.
- Approving runs the app's own endpoint on behalf of the approver.
- Removing the app removes its actions from the catalogue and expires its open proposals (test 16).
- Done when a `tea-shop` promotion is proposed, approved and runs.

**Architecture:**
- **New manifest block.** `agent` declares the app's `suggestions` path and its `actions` (name, Vietnamese title, payload schema, risk, approver roles, money flag).
- **Proposing.** `dxos-agent` calls each enabled app's suggestions path with its cooperative token and posts the results as proposals of kind `app.<app id>.<action>`.
- **Catalogue.** The web builds these catalogue entries from the installed manifests.
- **Executing.** On approval, the web calls the app's action path through the gateway with a new confidential client `dxos-apps-actor` and the approver in three headers. The gateway strips those headers from every other request, and apps trust them only next to that client's token.

**Tech Stack:** Next.js 14 + zod (`apps/web`), Python 3.12 (`platform/agent`, `platform/cli`, `platform/appkit`, `miniapps/tea-shop` FastAPI), Keycloak, APISIX.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` §10.2, §10.5, §6 (catalogue), §11.1 (money actions are `unlockable`), §15 test 16, milestone row M9.

## Scope

| In M9 | Later |
|---|---|
| The `agent` block: schema, `dxos validate` and docs | — |
| The dynamic catalogue, execution through `dxos-apps-actor`, expiry on removal | — |
| Agent loop for app suggestions; A9 includes app actions in the campaign | — |
| `tea-shop`: promotions (table, the public price, manager UI) and its `promotion.create` action with a suggestion rule | `tea-tour` "open more seats" and `leaf-purchase` "announce purchase price" follow the same pattern; add them in a later PR |

## Global Constraints

- **Repository rules:** `AGENTS.md`. No new dependency.
- **App actions are catalogue entries.** They go through `CreateProposalUseCase` and `DecideProposalUseCase` like every other kind. An app action is never executed without a decision.
- **AI-built apps.** An app with `generated: true` in its manifest (M13) may not declare `agent.actions` (H2, test 29). `dxos validate` refuses it.
- **Money and autonomy.** An action with `money: true` is `autonomy: unlockable` with a 2-hour window in M12. Others are `auto` (medium: 15 minutes).
- **The acting headers** `X-DXOS-Acting-Sub`, `X-DXOS-Acting-Role` and `X-DXOS-Acting-Htx`:
  - are stripped by the gateway on every app route (`proxy-rewrite` header removal);
  - are added only by the web's executor;
  - are honoured by an app only when the token's `azp` is `dxos-apps-actor`.
- **The app re-checks** its own business rules when an action runs, as for a click in its UI.

## Review Focus

1. **Forged acting headers.** A user request to an app with `X-DXOS-Acting-*` headers sees them stripped by the gateway. A request with the headers and a normal user token gets the user's own claims, not the headers' (test in the app kit).
2. **App removed while a proposal is open.** The proposal becomes `expired` (test 16), and a stray decision on it answers `expired` without calling the app.
3. **App disabled for the cooperative but still installed.** No suggestions are fetched for that cooperative, and decisions on its open proposals answer `expired`.
4. **Bad suggestion payloads:** a payload outside the action's schema, an unknown action, or another cooperative's ids are refused by the web (400). The agent logs them and goes on.
5. **The app answers an error at execution** (for example the product was deleted). The proposal is `failed`, with the app's Vietnamese message in the result, and nothing is retried on its own.

---

## Contracts

### C1. Manifest `agent` block (`platform/apps/manifest.schema.json`)

```yaml
agent:
  suggestions: /agent/suggestions          # GET; under routes.protected; called with an agent token
  actions:
    - name: promotion.create               # ^[a-z][a-z0-9_.]{2,40}$
      title_vi: Tạo khuyến mãi              # 1..80
      risk: medium                         # low | medium | high
      approver_roles: [manager]            # subset of officer, manager
      money: true
      path: /agent/actions/promotion-create   # POST; under routes.protected
      payload:                             # JSON Schema subset: type object, properties of type string|integer|number|boolean,
        type: object                       # enum, minimum, maximum, minLength, maxLength, required, additionalProperties false
        required: [product_id, discount_pct, days]
        additionalProperties: false
        properties:
          product_id: { type: string, maxLength: 64 }
          discount_pct: { type: integer, minimum: 5, maximum: 30 }
          days: { type: integer, minimum: 1, maximum: 14 }
      preview_vi: "Giảm {discount_pct}% cho sản phẩm {product_name} trong {days} ngày"   # placeholders from payload or suggestion `labels`
```

- At most 10 actions per app.
- `dxos validate` checks the subset (it refuses any other keyword), the paths, and the `generated` rule.
- `docs/miniapps.md` documents the block.

### C2. Suggestions (app → agent)

`GET /apps/<id>/agent/suggestions`, called by the agent with its cooperative token. The app trusts `realm_access.roles` containing `agent` and the `htx_code` claim. It answers:

```json
{"suggestions": [{
  "action": "promotion.create",
  "payload": {"product_id": "p1", "discount_pct": 10, "days": 7},
  "labels": {"product_name": "Chè Tân Cương 200 g"},
  "reason_vi": "Sản phẩm còn 40 gói, 21 ngày chưa bán được gói nào.",
  "subjects": ["p1"]
}]}
```

- At most 10 suggestions.
- The agent posts each one to `POST /api/internal/agent/proposals` with:
  - `agent: 'app:<id>'`;
  - `kind: 'app.<id>.<action>'`;
  - the payload with `labels` merged under `_labels`;
  - `reason_vi`;
  - evidence `{rows: [{table: 'app:<id>', id: <subject>, sha256: sha256(canonical_json(payload))}], sha256: digest}`.
- The web's repeat window for app kinds is 24 h, on the dedupe key of kind plus subjects.

### C3. Web catalogue and execution

**`getAction(kind)`** also resolves `app.<id>.<name>` from `platform.installed_apps.manifest`, cached for 60 s and cleared on install or remove. It only resolves when the app is enabled for the proposal's cooperative: the lookup takes `htxCode`; the existing calls pass it.

**The definition:**
- `risk`, `approverRoles` and `titleVi` come from the manifest;
- `origins: ['agent']`;
- `autonomy` is `money ? 'unlockable' : 'auto'`;
- `channels: ['web','telegram']`;
- `payloadSchema` is built with zod from the C1 subset, plus `_labels: record<string,string>` optional;
- `subjectTable: null`;
- `repeatAfterHours: 24`;
- `expiresAfterHours: 72`;
- `preview` fills `preview_vi`;
- `isStale` is always false (the app re-checks when the action runs);
- `execute` calls the app.

**`execute`:**
- POST `<gateway internal>/apps/<id><path>` with:
  - the client-credentials token of `dxos-apps-actor` (secret in the web env, written by `./dxos apps actor enable`);
  - the headers `X-DXOS-Acting-Sub: <approver userId>`, `X-DXOS-Acting-Role: <approver role>`, `X-DXOS-Acting-Htx: <htx>`;
  - the body = the payload without `_labels`.
- A 2xx returns `{ result: <app JSON> }`. A 4xx throws `DomainError(<app message_vi>)`. Others throw a system error.

**Removal (test 16):** removing an app through the existing flow sets every `proposed` proposal of kind `app.<id>.%` to `expired`, and writes the audit event `agent.proposal.expired` with reason `app_removed`. Also run it at web start for kinds whose app is no longer installed.

**Coverage:** none, because the routes are internal.

### C4. Platform

- **Keycloak.** Confidential client `dxos-apps-actor`, service account only, no roles, audience `dx-os-core`.
  - In the realm JSON and an idempotent `./dxos apps actor enable`, which writes `DXOS_APPS_ACTOR_SECRET` to the web env.
- **Gateway.** Every app route gets `proxy-rewrite` header removal for the three `X-DXOS-Acting-*` headers. The web's internal executor calls the internal port, which keeps the headers for tokens with `azp = dxos-apps-actor` (a `claim_schema` on an internal app route `apps-actor`).
- **App kit.** `platform/appkit/appkit.py` (copied into apps by `make appkit-sync`) and each app's `claims.py`:
  - `read_claims(authorization, headers)` returns the acting person's claims when `azp == dxos-apps-actor` and the three headers are valid;
  - it ignores the headers otherwise;
  - `roles` is taken from the header (manager or officer only).

### C5. tea-shop

- **Table** `promotions (id, product_id, discount_pct, starts_on, ends_on, created_by, created_at)` in its schema migrations.
- **The public price** applies the active promotion. The manager UI lists promotions and can end one.
- **The rule:** products with stock ≥ 20 and no order line in 21 days, and no active promotion, suggest 10% for 7 days.
- **`POST /agent/actions/promotion-create`:**
  - checks the product exists and belongs to the cooperative, and that no promotion overlaps;
  - creates it as the acting manager;
  - answers `{promotion_id, ends_on}`;
  - 409 `{message_vi: "Sản phẩm đang có khuyến mãi."}` on overlap.
- Version bump, store text and a screenshot.

---

## Tracks

| Track | Owns |
|---|---|
| W web | `apps/web/**`, `docs/api-contract.md` |
| P platform | `platform/apps/manifest.schema.json`, `platform/cli/**`, `dxos`, `docker/keycloak/realm-agrimarket.json`, `platform/gateway/apisix.yaml`, `platform/appkit/**`, `docs/miniapps.md` |
| A agent | `platform/agent/**` |
| S tea-shop | `miniapps/tea-shop/**` (including its copy of the app kit, after `make appkit-sync`) |
| I smoke and docs | `platform/tests/**`, `docs/rules-and-limits.md`, `README.md` |

Tasks per track follow the contracts with test-first steps. Each track's tests are named in the Review Focus.

**The I smoke:**
- seed a tea-shop product with stock 40 and no orders;
- restart the agent;
- assert an open `app.tea-shop.promotion.create` proposal;
- approve it through Telegram;
- assert the promotion row and the public price;
- remove tea-shop with `./dxos remove` and assert a second open proposal became `expired` (test 16);
- reinstall it in cleanup, as the app smoke does.
