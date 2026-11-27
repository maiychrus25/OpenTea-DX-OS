<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M5 follow-up (issue #80): the remaining Telegram chat operations — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every row of the two "in chat" groups of `apps/web/src/application/telegram/coverage.ts` is answered in chat.
- Each `chatRead` row has a read tool.
- Each `chatConfirm` row has an action that ends in a confirmation card.
- A farmer sends a disease photo in chat and gets the diagnosis.
- The bulletin can be listened to.
- Photo captions are read as text, and photos of cancelled or expired cards are deleted.

**Architecture:** the M5 engine (`application/telegram/chat/`) is unchanged in shape.
- **A tool** is a `ChatTool`: Prisma reads with explicit cooperative and household scope; reply lines capped like the M5 tools.
- **An action** is a `ChatAction`:
  - a flow of steps;
  - a card;
  - `execute`, which calls the same use case as the web route, with the acting person's rights re-read when they press Confirm.
- **`high` actions** take the two-step card.
- **Nothing here is an agent proposal.** These are a person's own operations (M5 spec note: `telegram.action.executed` audit event).

**Tech Stack:** Next.js 14 + Prisma + zod (`apps/web`), Python 3.12 standard library (`platform/telegram`), Keycloak, APISIX, bash (`dxos`).

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` §13 (13.2 to 13.4, 13.7), §21 "M5" notes, issue #80.

## Global Constraints

- **Repository rules:** `AGENTS.md`. No new dependency.
- **No session in chat (lesson 6).** Tools and actions never use `requireTenant()`, `auth()`, `getCoreToken()`, `CoreGatewayClient` or `Gateway*Reader`. They read and write through Prisma repositories and existing use cases with explicit scope.
- **Same rules as the route.** Each tool and action keeps its route's role guard, validation and tenant scope. A role that the route refuses gets `noPermission`. When the route's use case needs something only a session has, say so in the report; do not weaken the check.
- **Risk.** Deletes (`journal`, `notifications`, `members`, `parcels`), the cooperative-wide broadcast and member approval are `high`: two-step card. The rest are `medium`.
- **Names.** Tool names and action names are English, `noun` or `noun.verb`, and are added to `TOOL_NAMES` and `ACTION_NAMES` in `chat/types.ts`.
- **Coverage (test 17).** The rows stay where they are; each new tool or action lists the rows it serves in `routes`. Add a test that every `chatRead` and `chatConfirm` row is served by some tool or action.

## Review Focus

1. **Another cooperative's or another household's id** typed into a flow (a parcel code, a member, a lot): `notFound`, never the other's data.
2. **A role change between the card and Confirm** (a manager demoted): the Confirm answers `noPermission` and writes nothing.
3. **A delete confirmed twice** (double tap on the second card): one delete, the second press is stale.
4. **A photo larger than 5 MB or not JPEG/PNG** in the disease flow: refused with the M5 photo texts; nothing is stored.
5. **Piper is not running** when `Nghe` is pressed: `Chưa đọc được bản tin lúc này.`; nothing is queued.

---

## Contracts

### C1. Read tools (track R)

| Tool | Rows | Roles | Keywords (router) | Reply |
|---|---|---|---|---|
| `search` | `GET /api/search` | all | `tìm <từ>` | up to 8 hits by type, with the code or name |
| `certificate` | `GET /api/lot/[lot_code]/certificate` | all | `chứng nhận <mã lô>` | lot, product, harvest date, status, public trace link |
| `soil` | `GET /api/farm/parcels/[id]/soil-health` | farmer (own), officer, manager | `đất thửa <mã>` | latest readings and the health label |
| `photo` | `GET /api/parcels/[id]/latest-photo` | farmer (own), officer, manager | `ảnh thửa <mã>` | date and source of the latest photo; a Mini App link when the public URL is HTTPS |
| `households` | `GET /api/farm/households`, `GET /api/farm/households/[id]` | officer, manager | `nông hộ`, `hộ <tên>` | up to 10 households, or one with its parcels |
| `members` | `GET /api/members` | manager | `thành viên` | counts by status and up to 10 pending |
| `diseases` | `GET /api/officer/diseases` | officer, manager | `báo cáo bệnh` | up to 10 open reports |
| `profile` | `GET /api/profile` | all | `hồ sơ` | the person's own profile, without secrets |
| `documents` | `GET /api/documents`, `GET /api/documents/url` | as the route | `tài liệu` | up to 10 documents by name and date; never the file or a signed URL in chat |
| `partners` | `GET /api/partners` | as the route | `đối tác` | up to 10 partners |

### C2. Actions (track W)

| Action | Row | Roles | Risk | Flow |
|---|---|---|---|---|
| `journal.edit` | `PUT /api/journal/[id]` | farmer (own draft) | medium | choose a draft, choose the field, type the value |
| `journal.delete` | `DELETE /api/journal/[id]` | farmer (own draft) | high | choose a draft |
| `disease.review` | `PUT /api/officer/diseases/[id]/review` | officer, manager | medium | choose a report, choose the decision, type the note |
| `round.start` | `POST /api/parcels/[id]/start-round` | as the route | medium | choose a parcel |
| `harvest.schedule` | `PATCH /api/schedule/harvest/[cycle_id]` | as the route | medium | choose a cycle, type the date |
| `lot.create` | `POST /api/lots` | as the route | medium | choose parcels, type the weight |
| `lot.export_qr` | `POST /api/lots/[id]/export-qr` | as the route | medium | choose a lot |
| `notification.announce` | `POST /api/notifications/announce` | manager | medium for households, high for the whole cooperative | choose the audience, type the text |
| `notification.read` | `PUT /api/notifications` | all | medium | none (one tap) |
| `notification.clear` | `DELETE /api/notifications` | all | high | none |
| `member.invite` | `POST /api/members/invite` | manager | medium | type the phone or email, choose the role |
| `member.approve` | `POST /api/members/[id]/approve` | manager | high | choose a pending member |
| `member.remove` | `DELETE /api/members/[id]` | manager | high | choose a member |
| `profile.edit` | `PUT /api/profile` | all | medium | choose the field, type the value |
| `household.add` | `POST /api/farm/households` | as the route | medium | type the name and phone |
| `household.edit` | `PUT /api/farm/households/[id]` | as the route | medium | choose a household, choose the field, type the value |
| `parcel.delete` | `DELETE /api/farm/parcels/[id]` | as the route | high | choose a parcel |

Rules for every action:
- Each flow offers at most 8 choices per step, and the newest come first.
- A field the route does not let that role change is not offered.
- The card shows what will change, in at most 5 lines.

### C3. Disease photo in chat (track M)

- **Service client.**
  - Keycloak client `dxos-web-service`: confidential, service account, audience `dx-os-core`, realm role `web-service`.
  - It is in the realm file and is created by `./dxos telegram enable`, which writes `DXOS_WEB_SERVICE_SECRET` to the web's `roles.env` through `roles_env_update`. `./dxos telegram disable` drops it.
  - The web reads the environment first, then the file, as the apps-actor client does.
- **Gateway.** A route `internal-web-disease` on 9081 only: `/api/internal/web/disease/*` to the disease upstream, with `azp = dxos-web-service` and the role `web-service`. User routes also refuse `web-service`.
- **Action `disease.report`** (farmer; risk medium): choose a parcel, send a photo (JPEG or PNG, at most 5 MB), card `Gửi ảnh thửa <mã> để chẩn đoán`.
  - Confirm runs `SubmitDiagnosisUseCase` with a disease client that uses the service token.
  - The reply is the top label, the confidence, and `Cán bộ sẽ xác nhận kết quả này.` (H3: a person confirms disease results).
  - Without the secret: `Chưa bật chẩn đoán qua Telegram.`.

### C4. Read aloud (track M)

- The `bulletin` tool's reply gains the button `Nghe` (v2 callback, token `menu`, step `listen`).
- Pressing it queues an outbox item with `audio: {kind: 'bulletin', id}`.
- The relay fetches `GET /api/internal/telegram/media?bulletin=<id>` (relay token). There the web synthesises the bulletin's text with `PiperTtsAdapter` (WAV, at most 2,000 characters of text).
- The relay sends the file with `sendDocument` as `ban-tin.wav`, with the caption `Bản tin <ngày>`.
- Telegram voice notes need OGG/Opus, MP3 or M4A and no encoder is installed, so the audio goes as a file (recorded in spec §21).

### C5. Captions, orphan photos, journal filter (track M)

- **Captions.** A photo's caption is handled as the message text when no flow waits for a photo. Inside a photo step the photo wins and the caption is ignored.
- **Orphan photos.** `PhotoStore` gains `delete(key)`. A stored photo is deleted when its card is cancelled, when its flow is replaced, and when an expired conversation is found. The photo of an executed action is kept.
- **Journal filter.** `GET /api/journal` for a farmer with no household answers an empty list. Check the route and fix it with a test if it applies no household filter.

---

## Tracks

| Track | Owns |
|---|---|
| R read tools | `apps/web/src/application/telegram/chat/tools/**` (new files and `index.ts`), their tests, the tool part of `chat/router.ts` and `chat/types.ts` (`TOOL_NAMES`) |
| W actions | `apps/web/src/application/telegram/chat/actions/**` (new files and `index.ts`), their tests, the action part of `chat/router.ts` and `chat/types.ts` (`ACTION_NAMES`) |
| M media and platform | the engine and handler changes of C3 to C5, `apps/web/src/app/api/internal/telegram/media/**`, `apps/web/src/app/api/journal/route.ts`, `platform/telegram/**`, `dxos` (telegram part), `docker/keycloak/realm-agrimarket.json`, `platform/gateway/apisix.yaml`, `platform/tests/**`, `docs/rules-and-limits.md`, `docs/api-contract.md` |

- R and W each add to `chat/router.ts` and `chat/types.ts`: keep to your own block, add lines, reorder nothing.
- The coverage test (every in-chat row is served) is written by track W, which lands last in the registries.
- Each track ends with the whole Jest suite, lint and `tsc --noEmit` clean. Track M also runs the platform and relay pytest and `bash -n`.

**The M smoke** extends `smoke-assistant.sh`:
- a caption is routed as text;
- a disease photo in chat reaches the stubbed disease API through the new gateway route and answers the label;
- `Nghe` sends a document to the stub when a stub TTS is up, and answers the fallback text when it is not.
