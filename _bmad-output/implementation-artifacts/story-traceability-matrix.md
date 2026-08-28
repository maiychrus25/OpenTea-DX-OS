# DX-AgriMarket — Epic Execution Matrix

> **Mục đích:** Chỉ dùng file này để biết làm Epic/story nào trước, Epic/story nào sau.
>
> **Nguồn trạng thái duy nhất:** `_bmad-output/implementation-artifacts/sprint-status.yaml`.
> Trạng thái trong từng story markdown chỉ là mô tả, không dùng để điều phối.
>
> **Quy tắc:** Epic 8 chỉ hoàn thiện giao diện prototype/mock. Epic 8 không thay thế BE, schema, n8n hoặc integration của Epic 1–6. Không bắt đầu story khi dependency trực tiếp chưa `done` hoặc chưa được người phụ trách xác nhận đã unblock.

---

## 1. Thứ tự Epic tổng thể

| Thứ tự | Epic | Vai trò | Dependency bắt buộc | Kết quả mở khóa |
|---:|---|---|---|---|
| 1 | **Epic 0** | Chốt contract, schema, route, ownership và audit n8n/production | Không | Toàn bộ backlog còn lại được làm theo cùng contract |
| 2 | **Epic 1** | Hạ tầng, database, auth, session, profile và nền tảng n8n | Epic 0.1–0.3 | Các API/domain và UI role có nền tảng dùng chung |
| 3 | **Epic 2** | Market data, bulletin, TTS, chatbot, partner map, notification nền | Epic 1; có thể chạy song song với Epic 3 sau khi contract sẵn sàng | Luồng thông tin thị trường và dữ liệu đầu vào cho dashboard |
| 4 | **Epic 3** | Household, parcel, crop cycle, journal, weather, approval, announcement | Epic 1 + 2.0a/3.5a; là đầu critical path | Dữ liệu vùng trồng và nhật ký đủ để làm QR |
| 5 | **Epic 4** | Withdrawal, harvest approval, lot, QR, disease backend/proxy | Epic 3; 6.2 cần trước QR export | Lot và disease backend sẵn sàng cho Farmer/integration |
| 6 | **Epic 5** | Farmer journal/diagnosis/PWA, disease review, broadcast, Mattermost, reminder | Epic 3–4; notification contract từ 2.7 | Các luồng Farmer và notification đầy đủ |
| 7 | **Epic 6** | MinIO/PARA, certificate, technical chatbot, public storefront | Epic 1; QR certificate cần Epic 4 | Tài liệu, chứng nhận, chatbot kỹ thuật, storefront |
| 8 | **Epic 7** | Shared production UI migration và các public/dashboard surface | Epic 0.1 + foundation liên quan | Design system và các màn hình nền production |
| 9 | **Epic 8** | FE prototype reconstruction và các màn hình còn thiếu | Epic 7; không cần chờ BE để làm mock | Toàn bộ visual prototype hoàn chỉnh |
| 10 | **Epic 10** | BE/schema/API contracts còn thiếu để phục vụ FE và n8n | Epic 0; làm sau khi contract đã chốt | Các API/use case/storage/notification dùng cho integration |
| 11 | **Epic 9** | Nối FE với BE/n8n và chứng minh E2E | Epic 0, Epic 3–6, Epic 8, Epic 10 | Sản phẩm hoạt động E2E; là cổng hoàn tất cuối cùng |

### Diễn giải thứ tự

- **Epic 0 phải làm trước tất cả.**
- **Epic 1 phải hoàn tất các foundation gate trước domain work.**
- **Epic 2 và Epic 3 có thể chạy song song** sau Epic 0 và các dependency nền tương ứng.
- **Epic 4 bắt buộc sau Epic 3** vì QR phụ thuộc household, parcel, crop cycle, journal và withdrawal.
- **Epic 5 và Epic 6 có thể chạy song song sau khi các dependency của chúng sẵn sàng.**
- **Epic 7 và Epic 8 là FE track**, có thể chạy song song với phần BE/domain sau khi route/design contract đã chốt.
- **Epic 10 phải hoàn tất trước Epic 9.**
- **Epic 9 luôn làm sau cùng**, vì đây là bước thay mock bằng API/DB/n8n thật và chạy E2E.

---

## 2. Epic 0 — Contract, ownership và kiểm soát

**Làm đầu tiên.** Không có Epic nào được xem là sẵn sàng tích hợp trước Epic 0.

| Story | Làm gì | Mở khóa |
|---|---|---|
| `0-1` | Reconcile route, role, API envelope, Prisma field, status và ownership | Epic 1–10 dùng cùng contract |
| `0-2` | Kiểm kê/verify 11 workflow n8n, schedule, credential, table, idempotency, error path | Epic 1.7, 2.4, 3.5, 5.7, 5.8, 9.2 |
| `0-3` | Register production deviations: inline style, route thiếu, polling/SSE, TTS TODO, middleware, state | Epic 7–10 và hardening |

**Gate:** 0.1–0.3 hoàn tất hoặc có quyết định unblock rõ ràng.

---

## 3. Epic 1 — Foundation

**Làm sau Epic 0.** Các story có thể chạy song song sau khi database/auth contract đã rõ.

| Story | Layer | Thứ tự |
|---|---|---|
| `1-1` | Docker/infra | Đầu Epic 1 |
| `1-3` | Prisma/schema/migration | Sau 0.1; trước domain BE |
| `1-4` | Hexagonal architecture | Sau 1.3 |
| `1-5`, `1-5e`, `1-5f` | Auth/session/Keycloak | Sau 1.4; trước role pages |
| `1-5c`, `1-5d`, `1-2a` | Sign-out/unauthorized/loading/error UI | Sau auth contract; có thể song song |
| `1-6` | HTX profile | Sau auth + schema; trước crop-filter/market |
| `1-7` | n8n market pipelines | Sau 0.2 + schema; verify, không viết lại n8n |
| `1-2` | Design system cũ | `superseded-by-7-1` |
| `1-5a` | Login UI cũ | `superseded-by-7-6` |
| `1-5b` | Shell UI cũ | `superseded-by-7-2` |
| `1-8` | Dashboard placeholder | `superseded-by-7-7` |

**Epic 1 mở khóa:** API/domain, role layouts, Epic 2–6 và Epic 7–8.

---

## 4. Epic 2 — Market Intelligence

**Bắt đầu sau Epic 1.** Có thể chạy song song với Epic 3 sau khi API/data foundation sẵn sàng.

| Story | Layer | Dependency / thứ tự |
|---|---|---|
| `2-0a` | Geocode API | Sau 1.4; trước partner/farm map |
| `2-1` | Market Data API | Sau 1.7; trước bulletin/chat |
| `2-3a` | TTS API/Piper | Sau infra; trước TTS UI/integration |
| `2-4` | n8n bulletin synthesis | Sau 1.7 + 0.2; giữ n8n ownership |
| `2-2` | Bulletin UI/API | Sau 2.1/2.4 |
| `2-3` | Bulletin TTS UI | Sau 2.2/2.3a |
| `2-5` | Manager market chatbot | Sau market data + AI contract |
| `2-6` | Partner map CRUD | Sau 2.0a + schema |
| `2-7` | Notification BE/SSE | Sau notification/schema contract; trước 9.2 |
| `2-8` | Manager farm-zone read-only | Sau Epic 3 parcel API; có thể chuẩn bị FE trước |

**Epic 8 relation:** `8-1` và phần Manager của `8-6` chỉ là visual prototype; không đóng `2-1`, `2-2`, `2-3`, `2-4`, `2-5`, `2-7`.

---

## 5. Epic 3 — Farm Zone và Journal

**Bắt đầu sau Epic 1 và các API nền.** Đây là phần đầu của critical path QR.

| Story | Layer | Dependency / thứ tự |
|---|---|---|
| `3-1` | Household CRUD | Sau schema/auth |
| `3-2` | Parcel polygon/Turf/GPS/crop cycle | Sau 3.1 + 2.0a |
| `3-3` | Officer journal self-record | Sau 3.2 + weather contract |
| `3-5a` | Weather API | Trước 3.3/3.5 integration |
| `3-5` | Weather attach/n8n cache | Sau 3.5a + 0.2 |
| `3-4` | Parcel status/crop-cycle derivation | Sau journal model/3.3 |
| `3-6` | Officer batch approval | Sau 3.3/3.4; authority = Officer |
| `3-7` | Technical announcement | Sau household/notification contract |

**Epic 3 mở khóa:** Epic 4 withdrawal/lot/QR và Epic 5 Farmer journal.

**Epic 8 relation:** `8-5`, `8-7`, `8-11` chỉ là FE prototype; không thay thế `3-1`–`3-7`.

---

## 6. Epic 4 — Withdrawal, Lot, QR và Disease Backend

**Bắt buộc sau Epic 3.**

| Story | Layer | Dependency / thứ tự |
|---|---|---|
| `4-1` | Withdrawal/harvest approval | Sau journal/status |
| `4-2` | Officer lot creation/draft | Sau 4.1 + eligible parcels |
| `6-2` | Certificate lifecycle | Trước QR export; có thể chạy song song 4.2 |
| `4-3` | Review/export QR | Sau 4.2 + 6.2; immutable snapshot |
| `4-5` | Manager read-only lot list | Sau lot API/4.2; implementation in review as of 2026-08-24: `/manager/lots` reads published `READY`/`QR_EXPORTED` lots via BE, preserves filters/search/detail deep-link, and renders no Manager mutation controls. E2E browser run remains environment-blocked by missing `libnspr4.so`. |
| `4-6` | FastAPI disease service | Có thể chạy song song từ sau infra |
| `4-6a` | Diagnosis proxy | Sau 4.6 + storage/notification contract |
| `4-4` | Public QR page cũ | `superseded-by-7-9`; behavior tiếp tục ở 9.1/10.2 |

**Epic 8 relation:** `8-3`/`8-4` chỉ là Manager visual/read-only prototype; không cấp quyền mutation và không thay `4-1`–`4-3`.

---

## 7. Epic 5 — Farmer và Notifications

**Làm sau Epic 3–4 và notification contract.** Có thể chạy song song với Epic 6.

| Story | Layer | Dependency / thứ tự |
|---|---|---|
| `5-2` | Farmer journal | Sau 3.3/3.6 + Farmer isolation; implementation in review as of 2026-08-24: Farmer routes resolve household by `keycloak_user_id`, list/create/update/delete are household-scoped, `/farmer/journal/new` submits production entries as pending, pending withdraw is real API delete, and submit/withdraw/approve notifications are persisted. Epic 8-7/8-12 stay Officer/UI mock surfaces only. |
| `5-3` | Farmer diagnosis UI/flow | Sau 4.6/4.6a |
| `5-4` | PWA offline diagnosis | Sau 5.3 + storage/offline contract |
| `5-5` | Officer disease review | Sau 5.3 + notification |
| `5-6` | Manager broadcast | Sau 2.7/3.7 |
| `5-7` | Mattermost n8n connector | Sau 0.2; giữ n8n ownership |
| `5-8` | Friday reminder n8n | Sau 3.6/5.5; verify actual workflow |
| `5-1` | Dashboard presentation cũ | `superseded-by-7-7`; integration tiếp tục ở 9.2 |

**Epic 8 relation:** `8-9` chỉ là notification page mock; không thay `2-7`, `5-6`, `5-7`, `5-8`.

---

## 8. Epic 6 — Documents, Technical Chatbot, Storefront

**Sau foundation; có thể chạy song song với Epic 5.**

| Story | Layer | Dependency / thứ tự |
|---|---|---|
| `6-1` | MinIO/PARA | Sau infra; ownership/presigned URL bắt buộc |
| `6-2` | Certificates | Sau 6.1; trước 4.3 export |
| `6-3` | Officer technical chatbot/RAG | Sau 6.1 + AI contract |
| `6-4` | Public HTX storefront | Sau 1.6 + lots/public snapshot |

**Epic 8 relation:** Officer chat/doc/profile surfaces là mock; không đóng BE/RAG/MinIO.

---

## 9. Epic 7 — Production UI Migration

**FE track.** Có thể làm sau Epic 0 và shared contract; không cần chờ toàn bộ domain BE nếu dùng approved fixtures.

| Story | Thứ tự |
|---|---|
| `7-0a` | Schema prerequisite — `Household.htx_profile_id` + `Lot.htx_profile_id` + `HtxProfile` relations. **Status: ✅ DONE (2026-08-28).** Evidence: (✅) `schema.prisma` L87–109, L200–225; (✅) migration `20260814102205_add_htx_relations` applied — ADD COLUMN households + DROP TABLE "Lot" + CREATE TABLE "lots" + FK constraints; (✅) `20260818125835_add_pushed_to_mattermost` applied via `prisma migrate deploy` (all 5/5 migrations applied); (✅) Backfill executed: 9 households updated (3 → MD2 by parcel code P-HTX-MD2-*, 2 → Test HTX Weather by P-TW1-*/P-STAT-*, 4 remaining test → MD2), 0 NULL remain; (✅) Lots: 0 rows, no backfill needed; (✅) DROP TABLE "Lot" safe — table `lots` already existed; (✅) 10+ consumers verified: `PrismaHouseholdRepository`, `PrismaLotRepository`, dashboard pages, `GlobalSearchUseCase`. |
| `7-1` | Tailwind v4/Be Vietnam Pro/tokens |
| `7-2` | AppShell/sidebar |
| `7-3` | TopBar/bottom navigation |
| `7-4` | Pill/Button |
| `7-5` | MetricCard/SourceBox/AiNote |
| `7-6` | Login visual |
| `7-7` | Manager dashboard |
| `7-8` | Officer/Farmer dashboards |
| `7-9a` | Lot trace use case verification |
| `7-9` | Public QR page |
| `7-10` | Public HTX storefront |
| `7-11` | NotificationBell visual; full SSE/TTS remains BE/integration |

---

## 10. Epic 8 — FE Prototype Reconstruction

**FE-only track.** Có thể chạy song song với Epic 2–6 BE, nhưng phải sau khi Epic 0.1 chốt route/role/design contract.

| Story | Nội dung |
|---|---|
| `8-1` | Bulletin 3-card UI |
| `8-2` | Officer Today UI |
| `8-3` | Manager lot list UI |
| `8-4` | Manager lot detail/read-only UI |
| `8-5` | Officer farm-zone setup wizard UI |
| `8-6` | Manager market + Officer technical chat shells |
| `8-7` | Officer journal approval UI |
| `8-8` | Role-specific profile UI |
| `8-9` | Notification full page/Farmer combined UI |
| `8-10` | Auth recovery/registration UI |
| `8-11` | Member/household/invitation UI |
| `8-12` | Journal/diagnosis/QR edge-state UI |
| `8-13` | Documents/partners/search/settings UI |

**Không được kết luận E2E done sau Epic 8.** Epic 8 chỉ chứng minh visual coverage.

---

## 11. Epic 10 — Shared BE Contracts

**Làm sau Epic 0; phải hoàn tất trước Epic 9.** Có thể chạy song song với Epic 7/8 và phần domain Epic 2–6 khi contract không còn thay đổi.

| Story | Nội dung |
|---|---|
| `10-1` | Resource APIs/use cases, Prisma migrations, auth, farm/journal/profile/search contracts |
| `10-2` | Notification/SSE, TTS, chatbot, diagnosis, MinIO, certificates, immutable QR snapshot |

**Gate:** API envelope, role isolation, migration safety, n8n-owned reads và storage boundaries phải được test.

---

## 12. Epic 9 — FE–BE Integration và E2E

**Luôn làm sau cùng.** Không bắt đầu khi Epic 0, domain dependencies và Epic 10 chưa pass.

| Story | Luồng |
|---|---|
| `9-1` | Officer household → parcel → journal/weather → withdrawal → harvest approval → lot → certificate → QR snapshot → public QR |
| `9-2` | n8n market data → bulletin → TTS; market/technical chat; notification fan-out → bell/inbox/SSE fallback |

### E2E acceptance order

1. Auth/session/role isolation.
2. Officer tạo household và parcel.
3. Farmer/Officer ghi journal.
4. Weather được lấy từ cache do n8n sở hữu.
5. Officer duyệt journal và kiểm tra withdrawal.
6. Officer duyệt harvest.
7. Officer tạo draft lot từ parcel hợp lệ.
8. Chọn certificate và nhập weight/packaging.
9. Export QR tạo immutable snapshot và khóa lot.
10. Buyer mở public QR không cần login.
11. n8n tạo market/bulletin/notification records.
12. Manager/Officer xem đúng UI, citation, TTS, chat và notification.
13. Chạy negative tests: sai role, sai household, duplicate export, provider down, workflow rerun, offline/reconnect.

---

## 13. Definition of completion

- Epic 0: contract, ownership và workflow boundaries được chốt.
- Epic 1–6: domain/infra outputs có implementation + test evidence.
- Epic 7–8: visual production/prototype coverage hoàn tất.
- Epic 10: shared BE/schema/API/storage contracts hoàn tất.
- Epic 9: browser + API + database + n8n E2E pass.

Chỉ khi **Epic 0, Epic 1–8, Epic 10 và Epic 9** đạt các điều kiện trên mới kết luận `sprint-status.yaml` hoàn chỉnh E2E.
