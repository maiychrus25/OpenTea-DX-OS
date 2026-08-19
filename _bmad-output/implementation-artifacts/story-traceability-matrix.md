# DX-AgriMarket — Story Traceability Matrix

**Source of status:** `_bmad-output/implementation-artifacts/sprint-status.yaml` (artifact `Status:` lines are descriptive only).
**Scope:** Epics 0–10, FE, BE, schema, n8n, integration and hardening.
**Rule:** A mock FE story does not close a BE/schema/n8n story. A story is `superseded` only when its whole deliverable is replaced; otherwise it is `partial`, `blocked`, or split into a follow-up. When this matrix and an artifact disagree, `sprint-status.yaml` wins.

## Status transition policy

- `done` → keep only when implementation and required upstream contract evidence exists in the sprint record.
- `partial` → implementation exists but a required contract, security, migration, integration or workflow verification remains.
- `superseded-by-*` → the entire scoped deliverable is replaced; any retained BE/n8n/data scope must have its own key.
- `blocked` → dependency is explicit and must not be started.
- `ready-for-dev` → artifact and test plan exist and dependencies are actionable.

## Execution order — do these first

1. **0-1 Contract/schema/route reconciliation** — freeze canonical roles, URLs, API envelopes, Prisma fields, status enums and ownership boundaries.
2. **0-2 n8n verification** — verify existing workflows, schedules, credentials, tables, idempotency and error paths; do not move ingestion into Next.js.
3. **0-3 Production deviation baseline** — track broken routes, inline styles, NotificationBell polling/TTS, middleware and state gaps.
4. **Foundation/data gates** — resolve 1.3/1.5/1.6, 2.0a/2.1/2.3a, 3.5a/4.6a and 7.0a gaps; preserve verified n8n outputs.
5. **FE prototype track** — Epic 7 and Epic 8 pages use deterministic fixtures only, following `DESIGN.md`.
6. **Domain BE track** — Epic 2–6 resource APIs/use cases, migrations, authorization, MinIO and AI contracts.
7. **Critical path integration (9-1)** — Officer household → parcel → journal/weather → withdrawal → harvest approval → lot → QR snapshot → public scan.
8. **Market/notification integration (9-2)** — n8n bulletin → bulletin UI/TTS, two chatbots, notification fan-out → bell/inbox/SSE fallback.
9. **Hardening** — security, accessibility, performance, offline/retry, workflow rerun and E2E sign-off.

## Epic 0 — Control and reconciliation

| Key | Sprint status | Layer | Action / evidence / next dependency |
|---|---|---|---|
| 0-1 | ready-for-dev | contract/schema/routes | Resolve API contract vs Prisma vs production routes before Epic 9/10. |
| 0-2 | ready-for-dev | n8n/data ownership | Verify all 11 workflows and preserve n8n as sole ingestion writer; reconcile table/field/idempotency gaps. |
| 0-3 | ready-for-dev | hardening | Track inline styles, broken links, polling/SSE, TTS TODO, middleware and state gaps; create targeted fixes. |

## Epic 1 — Foundation

| Key | Sprint status | Layer | Action / evidence / next dependency |
|---|---|---|---|
| 1-1 | done | infra | Keep status; verify Docker health/ports against current compose during 0-2/0-3. |
| 1-2 | superseded-by-7-1 | design system | UI token foundation replaced by Tailwind/Be Vietnam Pro; retain historical trace only. |
| 1-2a | ready-for-dev | FE platform | Implement global loading/error/not-found; required by every page. |
| 1-3 | done | schema | **Reopen/partial:** current Prisma/migration/docs diverge and migration safety is unresolved; reconcile via 0-1/10-1. |
| 1-4 | done | architecture | Keep; verify actual folder structure and route→use-case→port→adapter compliance in 0-3/10-1. |
| 1-5 | done | auth/middleware | Keep but verify canonical direct URL prefixes and recognized-role fail-closed behavior. |
| 1-5a | superseded-by-7-6 | FE auth | Login visual scope replaced by 7-6; retain Keycloak behavior and edge states in 8-10. |
| 1-5b | superseded-by-7-2 | FE shell | Shell visual scope replaced by 7-2; route protection/link correctness remains 0-3. |
| 1-5c | ready-for-dev | auth | Implement real server-side sign-out and session invalidation. |
| 1-5d | ready-for-dev | FE auth | Implement unauthorized page and role-safe recovery. |
| 1-5e | done | auth types | Keep status; verify no unsafe casts and role typing in hardening. |
| 1-5f | ready-for-dev | Keycloak | Import/verify realm, passkeys/PIN fallback and fail-closed roles. |
| 1-8 | superseded-by-7-7 | FE dashboard | Placeholder dashboard fully replaced by Today surfaces; no separate implementation. |
| 1-6 | ready-for-dev | profile BE/FE | Keep; integrate manager HTX profile, crop filtering and area aggregation. |
| 1-7 | done | n8n | **Reopen/partial:** workflow files exist but schedule/source/schema/provider gaps require 0-2 verification. |

## Epic 2 — Market intelligence

| Key | Sprint status | Layer | Action / evidence / next dependency |
|---|---|---|---|
| 2-0a | done | BE geocode | Keep; verify rate limit/auth/response envelope and partner/farm consumers. |
| 2-1 | ready-for-dev | BE market API | Add missing endpoint/use case, typed filtering and n8n-owned reads; prerequisite for bulletin/chat. |
| 2-2 | done | FE/API bulletin | **Reopen/partial:** existing pages call missing `/api/bulletin`/legacy presentation; Epic 8-1 replaces visual only. |
| 2-3 | done | FE TTS | **Reopen/partial:** TTS UI/AudioPlayer contract and placeholder/TTS route mismatch require integration. |
| 2-3a | done | BE TTS | **Reopen/partial:** adapter/compose port and response contract require verification; preserve Piper ownership. |
| 2-4 | done | n8n bulletin | **Reopen/partial:** workflow exists but provider/model/crop-filter/schema contract differs from PRD; fix through 0-2. |
| 2-5 | ready-for-dev | BE+FE market chat | Implement Manager market scope, streaming/history/citations and no-recommendation invariant; Epic 8-6 is shell only. |
| 2-6 | ready-for-dev | BE+FE partners | Implement manager-only CRUD, geocode and schema enum/HTX scoping; Epic 8-13 adds directory UI. |
| 2-7 | partial | BE notifications | Finish domain/API/read/SSE/recipient fan-out; 7-11 is only UI and remains partial until 9-2/10-2. |
| 2-8 | ready-for-dev | FE+BE farm read | Implement Manager read-only map/filter/empty/error using Officer-owned parcel APIs. |

## Epic 3 — Farm zone and journal

| Key | Sprint status | Layer | Action / evidence / next dependency |
|---|---|---|---|
| 3-1 | ready-for-dev | BE+FE household | CRUD, HTX scoping, member/household details; 8-5/8-11 are visual only. |
| 3-2 | ready-for-dev | BE+FE parcel | Leaflet/Turf polygon, area, crop cycle, GPS and CRUD; 8-5 is wizard only. |
| 3-3 | ready-for-dev | BE+FE journal | Officer self-record, conditional pesticide fields, server validation and auto-approval rule. |
| 3-4 | ready-for-dev | domain status | Derive parcel status/crop-cycle transitions transactionally. |
| 3-5 | ready-for-dev | n8n+BE journal weather | Consume n8n cache with historical/fallback semantics; no direct browser provider calls. |
| 3-5a | done | BE weather API | **Reopen/partial:** exact-cache/fallback/scoping behavior is incomplete or inconsistent with story contract. |
| 3-6 | ready-for-dev | BE+FE approval | Officer batch approve/reject/request changes/history; resolve old API-contract Manager wording in 0-1. |
| 3-7 | ready-for-dev | BE notification | Technical announcement recipient selection/fan-out; feeds 9-2. |

## Epic 4 — QR and disease backend

| Key | Sprint status | Layer | Action / evidence / next dependency |
|---|---|---|---|
| 4-1 | ready-for-dev | domain+BE | Withdrawal calculation and harvest approval notification; prerequisite for lot. |
| 4-2 | ready-for-dev | BE+FE lot | Officer-only lot creation from eligible parcels, code generation and draft transaction; Epic 8-3/8-4 do not replace. |
| 4-3 | ready-for-dev | BE+FE QR | Review/export, immutable snapshot, lock, QR asset and notification; depends 6-2/10-2. |
| 4-4 | superseded-by-7-9 | public FE | Visual public page replaced by 7-9; public snapshot/certificate/API behavior remains in 9-1/10-2. |
| 4-5 | ready-for-dev | Manager FE+BE | Read-only list/detail/deep link; Epic 8-3 is prototype reconstruction, not BE completion. |
| 4-6 | ready-for-dev | FastAPI | Deploy/verify model endpoint and invariant disease-only output. |
| 4-6a | done | BE proxy | **Reopen/partial:** route/persistence/role and broadcast behavior need contract alignment; feeds 5-3/5-5/10-2. |

## Epic 5 — Farmer and notifications

| Key | Sprint status | Layer | Action / evidence / next dependency |
|---|---|---|---|
| 5-1 | superseded-by-7-7 | FE dashboard | Presentation replaced by Epic 7; integration/data behavior remains 9-2. |
| 5-2 | ready-for-dev | FE+BE journal | Farmer-owned parcels, pending/withdraw/read-only approved flow; depends 3-3/3-6/10-1. |
| 5-3 | ready-for-dev | FE+BE diagnosis | Real upload/result/send flow; Epic 8-12 adds missing states only. |
| 5-4 | ready-for-dev | PWA | Offline photo/GPS queue and reconnect replay; depends 5-3/10-2. |
| 5-5 | ready-for-dev | BE+FE disease review | Officer confirm/correct/history and farmer isolation; no treatment recommendation. |
| 5-6 | ready-for-dev | BE+FE broadcast | Manager fan-out to Officer/Farmer with SSE/bell integration. |
| 5-7 | ready-for-dev | n8n Mattermost | Preserve connector; verify claim/retry/duplicate behavior in 0-2. |
| 5-8 | done | n8n reminder | **Reopen/partial:** current workflow behavior differs from artifact/BA reminder contract; verify before done. |

## Epic 6 — Documents, technical chat and storefront

| Key | Sprint status | Layer | Action / evidence / next dependency |
|---|---|---|---|
| 6-1 | done | MinIO/FE+BE | **Reopen/partial:** object-prefix/ownership validation and complete PARA operations need hardening/10-2. |
| 6-2 | ready-for-dev | BE+FE certificate | Presigned certificate lifecycle and lot selection; prerequisite for QR export. |
| 6-3 | ready-for-dev | BE+FE technical chat | Officer-only RAG from MinIO, streaming/history/citations; Epic 8-6 shell only. |
| 6-4 | ready-for-dev | public FE+BE | Public HTX capability profile, verified lot list and safe links; 7-10 visual surface exists. |

## Epic 7 — UI migration

| Key | Sprint status | Layer | Action / evidence / next dependency |
|---|---|---|---|
| 7-0a | done | schema prerequisite | **Reopen/partial:** migration/backfill/schema relation evidence must be verified before dependent data stories. |
| 7-1 | done | design system | Keep; current DESIGN.md is Tailwind v4/Be Vietnam Pro baseline. |
| 7-2 | done | shell FE | Keep status; broken navigation links and route protection are hardening follow-ups. |
| 7-3 | done | shell FE | Keep status; notification/SSE and route links are downstream work. |
| 7-4 | done | shared UI | Keep; verify accessibility/token usage. |
| 7-5 | done | shared UI | Keep; SourceBox/AiNote are mandatory for integrated AI/market surfaces. |
| 7-6 | done | auth FE | Keep visual status; 8-10 covers missing auth recovery states. |
| 7-7 | done | Manager FE | Keep visual status; real metric/API integration belongs 9-2/10-1. |
| 7-8 | done | Officer/Farmer FE | Keep visual status; Epic 8-2 is a prototype refinement, not a duplicate BE completion. |
| 7-9 | done | public FE | **Reopen/partial:** certificate API/public snapshot integration is missing despite page/use case. |
| 7-9a | done | BE use case | Keep but verify fields/statuses against canonical schema in 0-1/10-2. |
| 7-10 | done | public FE | Keep visual status; verify storefront data/route contract in 10-2. |
| 7-11 | done | FE notification | **Reopen/partial:** current polling/shape/TTS TODO does not satisfy full SSE/TTS contract; 2-7/9-2/10-2 remain. |

## Epic 8 — FE prototype and completion

| Key | Sprint status | Layer | Action / evidence / next dependency |
|---|---|---|---|
| 8-1 | ready-for-dev | FE mock | Bulletin 3-card visual only; 2.2/2.3/2.4 and 9-2 remain. |
| 8-2 | ready-for-dev | FE mock | Officer dashboard refinement; reconcile duplicate 7-8 metrics before implementation. |
| 8-3 | ready-for-dev | FE mock | Manager read-only list; Officer mutation remains 4.2/4.3. |
| 8-4 | ready-for-dev | FE mock | Manager read-only detail presentation; export mutation remains Officer domain story. |
| 8-5 | ready-for-dev | FE mock | Wizard visual; 3.1/3.2/10-1 persist data. |
| 8-6 | ready-for-dev | FE mock | Two role-specific chat shells; 2.5/6.3/9-2 integrate. |
| 8-7 | ready-for-dev | FE mock | Officer journal review visual; 3.6/10-1 integrate. |
| 8-8 | ready-for-dev | FE mock | Role profile visual; 1.6/10-1 integrate. |
| 8-9 | ready-for-dev | FE mock | Full notification/Farmer combined visual; 2.7/5.6/9-2/10-2 integrate. |
| 8-10 | ready-for-dev | FE mock | Auth recovery/registration states; Keycloak/BE follow-up required. |
| 8-11 | ready-for-dev | FE mock | Member/household/invitation surfaces; 3.1/10-1 integrate. |
| 8-12 | ready-for-dev | FE mock | Journal/diagnosis/QR edge states; 4.x/5.x/10-2 integrate. |
| 8-13 | ready-for-dev | FE mock | Documents/partners/search/settings; 2.6/6.x/10-1 integrate. |

## Epic 9 — Integration

| Key | Sprint status | Layer | Action |
|---|---|---|---|
| 9-1 | blocked | E2E integration | Unblock after 0-1/0-2, 10-1/10-2 and domain critical path; run real Prisma integration. |
| 9-2 | blocked | E2E integration | Unblock after 0-2/0-3, 2.x/5.x/6.3 and 10-2; verify n8n→UI without duplicate writers. |

## Epic 10 — Shared BE contracts

| Key | Sprint status | Layer | Action |
|---|---|---|---|
| 10-1 | blocked | BE/schema/API | Unblock after 0-1/0-2; fill resource APIs, migrations, auth and farm/journal/profile/search contracts. |
| 10-2 | blocked | BE/AI/storage/notifications | Unblock after 0-1/0-2 and domain contracts; fill SSE/TTS/chat/diagnosis/MinIO/immutable snapshot contracts. |

## n8n workflow coverage

| Workflow | Producer contract | Status action |
|---|---|---|
| `worldbank_sync.json`, `wto_tariffs.json`, `faostat_sync.json`, `comtrade_export_sync.json`, `nasa_power_sync.json` | `market_data` ingestion | Verify source correctness, schedules, escaping, schema and idempotency in 0-2; do not duplicate in Next.js. |
| `weather-sync.json` | hourly `weather_cache` per parcel | Verify unique key, historical lookup and consumer fallback in 0-2/3-5a. |
| `fx-rates-sync.json` | latest `fx_rates` | Verify append/idempotency/retention and consumer contract. |
| `bulletin-synthesis.json` | cited `bulletins` | Verify model/provider, crop filtering, safe SQL, latest flag and source fields. |
| `officer-reminder.json` | Friday officer reminder | Reconcile recipient identity, duplicate prevention and requested summary behavior. |
| `mattermost-push.json` | external notification connector | Verify atomic claim/retry/dead-letter and preserve as separate channel. |
| `weather_alerts.json` | error path only currently | Track as stub/deferred until alert requirements are explicitly approved. |

## Definition of E2E complete

`done` for a domain story requires implementation evidence, matching test evidence and all upstream dependencies done/verified. Epic 8 completion means visual prototype coverage only. Epic 9 completion requires browser + API + Prisma + n8n evidence for the critical flows. Epic 0/10 must be done before the final sprint can be called E2E-complete.
