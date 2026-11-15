<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Tea-tour 1.0 (Tour Booking System) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `tea-tour` mini-app into a complete tour booking product: a customer website with photos, departures, VietQR payment, tickets and reviews; a back office for the cooperative manager; a guide page with check-in.

**Architecture:** Still one mini-app (one container, schema `app_tea_tour`), split into a pure domain layer, a store layer whose `core` module owns every booking state change, and four routers (public site, catalogue admin, sales admin, guide). No JavaScript; the customer site ships its own stylesheet, font and illustrations from the app. Three small generic changes in the web proxy (read/write rate limits, `cache-control` on public GETs, a body cap).

**Tech Stack:** FastAPI + Jinja2 + psycopg 3 (Python 3.12), Pillow, segno; Next.js 14 route handler (TypeScript, jest); Playwright; bash smoke tests.

**Spec:** `docs/specs/2026-11-15-tea-tour-system-design.md` (Vietnamese; the authority for every rule and limit — section numbers below refer to it).

## Global Constraints

- English-only identifiers; English Conventional Commits; author `maiychrus25 <ninhkhuongpl7@gmail.com>`; no trailer; no mention of any AI tool; no push.
- SPDX header (`MIT`, `2026 OpenTea Developers`) on every new text file.
- Never read or print any `.env*` file. Never delete `docker_*` volumes. Never touch the owner's running stack; full-stack rounds use `COMPOSE_PROJECT_NAME=dxos-clean` (Task I only).
- No JavaScript, no inline `style` attributes, no cookies in mini-app pages; the CSP of `/apps/` does not change.
- New dependencies: `Pillow` and `segno` in `miniapps/tea-tour/requirements.txt` only, pinned; the Be Vietnam Pro woff2 files (OFL-1.1) and a few Lucide icon paths (ISC) are vendored with their licence text. Nothing else.
- User-facing text is Vietnamese with full diacritics; money `250.000 ₫`; Vietnam time.
- Every query filters on `htx_code`. User text reaches SQL only as parameters and HTML only through autoescape.
- Kit copies (`appkit.py`, `templates/kit.html`) are never edited in the app.
- Versions: web `1.13.0` (Task P), `tea-tour` `1.0.0` with `requires.core: ">=1.13.0"` (Task D).
- No regression outside tea-tour: `make test`, `make lint`, `tsc --noEmit`, CLI pytest, kit pytest and the other apps' pytest keep their `v1.12.0` counts and pass.
- Parallel tasks S, B1, B2, G edit only the files listed as theirs. A missing shared helper is reported, not added to another task's file.

## Review Focus

1. Two guests take the last seats at the same moment, and an unpaid booking past its hold must free its seats without any sweep having run — Task D tests `concurrent bookings never exceed seats`, `expired hold frees seats before the sweep`.
2. A stranger with a booking code but the wrong access key, a guide opening another guide's departure, a manager of HTX `LB` opening an id of HTX `TC`, and the public URL of a draft tour's photo must all get the not-found answer — Task D `media is public only for published tours`, Task S `wrong key is not found`, Task B2 `other cooperative's booking is 404`, Task G `another guide's departure is 404`.
3. An upload that is a renamed text file, a 6 MB file, a 20-megapixel image or a JPEG with GPS EXIF must be refused or cleaned — Task D `process_image` tests.
4. Pressing "Xác nhận đặt chỗ" twice, or confirming after the manager changed the price, must not create a second or a mispriced booking — Task D `same request_key returns the same booking`, Task S `price change re-shows step 2`.
5. Hostile text (`<script>alert(1)</script>`, `=HYPERLINK("http://x")`) in a tour title, itinerary line, guest name or review must render as text and be neutralised in CSV — Tasks S, B1, B2.

---

## File Structure (`miniapps/tea-tour/`)

| Path | Owner | Responsibility |
| --- | --- | --- |
| `migrations/002_tour_system.sql` | D | Schema of spec §8, data move from 0.2.0, view `departure_load` |
| `tea_tour/main.py` | D | App factory: routers, exception handlers, `/healthz` |
| `tea_tour/web.py` | D | Shared request helpers, template environment, auth and db dependencies |
| `tea_tour/domain/{money,policy,vietqr,text,tour_templates}.py` | D | Pure rules (no I/O) |
| `tea_tour/media.py`, `tea_tour/qr.py` | D | Image processing; QR data URIs |
| `tea_tour/store/__init__.py`, `store/core.py`, `store/settings.py`, `store/media.py` | D | Connections; booking state changes; settings; media rows |
| `tea_tour/routes/assets.py` | D | Static files and media, public and protected |
| `tea_tour/templates/base.html`, `templates/admin/base.html`, `templates/site/base.html` | D | Page shells (admin shell holds the tab bar) |
| `tea_tour/static/fonts/`, `static/tokens.css`, `static/admin.css`, `static/icons.html` | D | Font, shared tokens, tab bar style, icon macros |
| `tests/conftest.py`, `tests/factories.py`, `tests/preview.py` | D | Fixtures, row factories, preview server with demo seed |
| `tea_tour/routes/public.py`, `store/site.py`, `store/guest.py`, `templates/site/*`, `static/site.css`, `static/illustrations/*`, `tests/test_site.py`, `DESIGN.md` | S | Customer site |
| `tea_tour/routes/admin_catalog.py`, `store/catalog.py`, `templates/admin/catalog/*`, `static/admin-catalog.css`, `tests/test_admin_catalog.py` | B1 | Tours, photos, departures, settings |
| `tea_tour/routes/admin_sales.py`, `store/sales.py`, `templates/admin/sales/*`, `static/admin-sales.css`, `tests/test_admin_sales.py` | B2 | Overview, bookings, payments, customers, reviews, inquiries, reports |
| `tea_tour/routes/guide.py`, `store/guide.py`, `templates/guide/*`, `static/guide.css`, `tests/test_guide.py` | G | Guide pages |

The 0.2.0 files `tea_tour/store.py`, the old templates and `tests/test_store.py`, `tests/test_pages.py` are removed by Task D once their behaviours are covered by the new tests.

### Route table (paths under `/apps/tea-tour`; cross-links between tasks use exactly these)

| Owner | Routes |
| --- | --- |
| D | `GET /healthz`; `GET /public/{htx}/assets/{name}`; `GET /public/{htx}/media/{id}-{variant}.jpg`; `GET /assets/{name}`; `GET /guide/assets/{name}`; `GET /media/{id}-{variant}.jpg` |
| S | spec §5 table, all under `/public/{htx}` |
| B1 | `GET /tours`; `GET /tours/new`; `POST /tours`; `GET /tours/{id}`; `GET /tours/{id}/edit`; `POST /tours/{id}`; `POST /tours/{id}/status`; `POST /tours/{id}/photos`; `POST /tours/{id}/photos/{media_id}/{cover\|up\|down\|remove}`; `GET /departures`; `POST /departures`; `POST /departures/bulk`; `GET /departures/{id}`; `POST /departures/{id}`; `POST /departures/{id}/status`; `POST /departures/{id}/checkin`; `GET /departures/{id}/guests/export.csv`; `GET /departures/{id}/print`; `GET /settings`; `POST /settings`; `POST /settings/cover` |
| B2 | `GET /`; `GET /bookings`; `GET /bookings/new`; `POST /bookings`; `GET /bookings/export.csv`; `GET /bookings/{id}`; `POST /bookings/{id}/{confirm\|payments\|cancel\|move\|resize\|note}`; `GET /payments`; `GET /payments/export.csv`; `GET /customers`; `GET /customers/export.csv`; `GET /reviews`; `POST /reviews/{id}/{publish\|hide\|reply}`; `POST /inquiries/{id}`; `GET /reports` |
| G | `GET /guide`; `GET /guide/departures/{id}`; `POST /guide/departures/{id}/checkin` |

---

### Task P: Web proxy — read/write limits, cache-control, body cap, version 1.13.0

**Files:**
- Modify: `apps/web/src/application/apps/forward-to-app.ts`, `apps/web/src/app/apps/[id]/[[...path]]/route.ts`
- Modify: `apps/web/package.json`, `apps/web/package-lock.json` (version `1.13.0`) and any test or file that pins `1.12.0`
- Modify: every place that passes `DXOS_APP_PUBLIC_LIMIT` to the web container (`docker/docker-compose.yml`, `.github/workflows/ci.yml`): pass `DXOS_APP_PUBLIC_READ_LIMIT` the same way
- Modify: `docs/miniapps.md` (limits section), `CHANGELOG.md` `[Unreleased]`
- Test: `apps/web/src/__tests__/application/apps/forward-to-app.test.ts`

**Interfaces — Produces:**
- `createPublicLimiter()` — write limiter, default 30 per minute, `DXOS_APP_PUBLIC_LIMIT`.
- `createPublicReadLimiter()` — read limiter, default 300 per minute, `DXOS_APP_PUBLIC_READ_LIMIT`.
- `ForwardToAppDeps.isPublicReadLimited: (ip: string) => boolean` next to the existing `isPublicLimited` (writes).
- `MAX_BODY_BYTES = 10 * 1024 * 1024`.

- [ ] **Step 1: failing tests** in `forward-to-app.test.ts` (keep every existing test; change only those that assert the old shared limit of 10):
  - `public GET uses the read limiter only`, `public POST uses the write limiter only`, `read limit answers 429 with the same message`.
  - `default write limit is 30 and read limit is 300`; `DXOS_APP_PUBLIC_READ_LIMIT overrides the read limit`.
  - `cache-control is kept on a public GET 200`; dropped on a public POST, a public 404, a public 303 and on any protected response.
  - `content-length above 10 MiB answers 413 without calling the app`; exactly 10 MiB is forwarded.
- [ ] **Step 2:** run `npx jest forward-to-app` → the new tests fail.
- [ ] **Step 3:** implement. A `HEAD` counts as a read. The 413 uses `appResponse('Tệp gửi lên quá lớn.', 413)`. `cache-control` is copied only when `tenant.kind === 'public'`, method is `GET` or `HEAD`, and `upstream.status === 200`.
- [ ] **Step 4:** bump the version to `1.13.0`; run `make test`, `make lint`, `npx tsc --noEmit` → all pass; report counts against `v1.12.0` (`make test` 1706 passed, 3 skipped, plus the new tests).
- [ ] **Step 5:** docs and CHANGELOG (`Changed`: limits; `Added`: read limit variable, body cap). Commit `feat(web): separate read and write limits for public mini-app pages`.

### Task D: Foundation — schema, domain, booking core, media, scaffolding

**Files:** the D rows of the File Structure table; `miniapps/tea-tour/app.yaml` (version, `requires.core`), `requirements.txt`, `Dockerfile` (copies `tea_tour` as today; add nothing that needs a writable root).

**Interfaces — Produces** (final signatures are written to `.superpowers/sdd/2026-11-15-tea-tour-system/task-D-interfaces.md`; the names below are fixed):

```python
# domain/money.py
def total_vnd(adults: int, children: int, price_adult_vnd: int, price_child_vnd: int) -> int
def deposit_vnd(total: int, deposit_percent: int) -> int          # rounded up to 1.000 ₫, never above total
def payment_state(status: str, total: int, paid: int) -> str      # UNPAID | DEPOSITED | PAID | REFUND_DUE
def amount_due_now(total: int, deposit: int, paid: int) -> int    # what the VietQR asks for
def refund_due(status: str, total: int, paid: int) -> int
# domain/policy.py
def hold_until(created_at, starts_at, hold_hours: int, deposit: int) -> datetime | None
def guest_can_cancel(status: str, starts_at, cancel_free_hours: int, now) -> bool
def checkin_window(starts_at, duration_minutes: int) -> tuple[datetime, datetime]
# domain/vietqr.py
BANKS: tuple[Bank, ...]                                            # Bank(bin: str, name: str), spec Appendix A
def payload(bank_bin: str, account: str, amount_vnd: int, content: str) -> str
# domain/text.py
def slugify(title: str) -> str
def normalise_phone(raw: str) -> str | None                        # 0 + 9 digits, as 0.2.0
def default_display_name(guest_name: str) -> str
# domain/tour_templates.py
TEMPLATES: dict[str, TourTemplate]                                 # four keys, spec Appendix B
# media.py
def process_image(data: bytes) -> ProcessedImage | ImageRefusal    # .large, .thumb (JPEG bytes), .width, .height
# qr.py
def qr_data_uri(text: str) -> str
def ticket_text(htx_code: str, code: str) -> str                   # "OPENTEA-TOUR:<htx>:<code>"
# store/core.py — each call is one transaction on the given connection; refusals are returned, never raised
@dataclass(frozen=True)
class Actor: kind: str; name: str; user_id: str | None             # kind: GUEST | MANAGER | GUIDE | SYSTEM
def create_booking(conn, new: NewBooking, actor: Actor) -> Booking | Refusal
def confirm_booking(conn, htx_code, booking_id, actor) -> Booking | Refusal
def record_payment(conn, htx_code, booking_id, amount_vnd, method, note, actor) -> Booking | Refusal
def report_paid(conn, htx_code, booking_id) -> Booking | Refusal
def cancel_booking(conn, htx_code, booking_id, reason, actor) -> Booking | Refusal
def move_booking(conn, htx_code, booking_id, departure_id, actor) -> Booking | Refusal
def resize_booking(conn, htx_code, booking_id, adults, children, actor) -> Booking | Refusal
def check_in(conn, htx_code, booking_id, count, actor, guide_user_id=None) -> Booking | Refusal
def undo_check_in(conn, htx_code, booking_id, actor, guide_user_id=None) -> Booking | Refusal
def cancel_departure(conn, htx_code, departure_id, reason, actor) -> int | Refusal
def set_departure_seats(conn, htx_code, departure_id, seats) -> Refusal | None
def sweep(conn, htx_code, departure_id=None) -> int                # cancels expired holds and stale PENDING
def add_review(conn, htx_code, booking_id, rating, comment, display_name) -> Review | Refusal
def get_booking(conn, htx_code, booking_id) -> Booking | None
def find_booking(conn, htx_code, code, access_key) -> Booking | None
def lookup_booking(conn, htx_code, code, phone) -> Booking | None
# web.py
templates; theme_of(request); href(path, theme="", **params); site_href(htx, path, theme="", **params)
page(request, name, status=200, **context); redirect(request, path, **params)   # 303
signed_in; role(name); db; public_htx(htx); actor_of(claims, kind); static_url(name)
```

`Refusal` is an enum whose `.message` is the Vietnamese sentence shown to the user. The SQL view `departure_load (htx_code, departure_id, seats_used, confirmed_guests)` encodes the "holding" rule of spec §7.1 once; every seat count in every task reads it.

- [ ] **Step 1: migration.** Write `tests/test_migration.py::test_upgrade_from_0_2_0_keeps_every_booking` first: apply `001` alone, insert the 0.2.0 rows listed in the test (an open future tour with PENDING and CONFIRMED bookings, a cancelled tour with active bookings, a past tour with a PENDING and a CONFIRMED booking, two cooperatives), apply `002`, assert spec §8 "Chuyển dữ liệu" items 1–4 row by row and that every table has `htx_code NOT NULL`. Then write `002_tour_system.sql`. Composite foreign keys include `htx_code`.
- [ ] **Step 2: domain.** Tests first, one file per module: money (rounding up to 1.000, 0 % and 100 %, free tour is `PAID`, overpaid and cancelled-with-money are `REFUND_DUE`), policy (hold capped at departure, no hold without deposit, cancel boundary exactly at `cancel_free_hours`, check-in window in Vietnam time across midnight UTC), vietqr (the Appendix A vector; `crc16("123456789") == "29B1"`; every BIN is six digits and unique), text (`slugify("Một ngày làm người hái chè") == "mot-ngay-lam-nguoi-hai-che"`, `đ`, collisions handled by the store; phone forms of 0.2.0), templates (four keys, each within the limits of spec §8). Cross-check the BIN table against VietQR's public bank list; report any difference and use the official value.
- [ ] **Step 3: booking core.** Tests in `tests/test_core.py`, one per rule of spec §7.1–§7.6 and §7.9, including the Review Focus items 1 and 4, plus: auto-confirm on reaching the deposit; auto-confirm at booking when `auto_confirm` and no deposit; reported-paid bookings survive the hold; stale PENDING cancelled at departure; payment may not exceed the total nor go below zero; payment on a cancelled booking gives `REFUND_DUE`; guest cancel refused after the deadline while manager cancel works; cancelling a departure cancels its holding bookings; move only within the same tour and only with seats; resize recomputes total and deposit and keeps unit prices; check-in only for CONFIRMED, only inside the window, guide only on own departure, count 1..party; one review per checked-in booking; every change writes one `booking_events` row with the actor; `paid_vnd` equals the ledger sum after every operation; another cooperative's id is `NOT_FOUND` for every function.
- [ ] **Step 4: media and QR.** `process_image` tests (Review Focus 3; PNG with alpha becomes JPEG on white; EXIF orientation applied; output sizes ≤ 1600 and ≤ 640 on the long edge). `qr_data_uri` returns a `data:image/` URI with no `style` attribute inside. `store/media.py`: insert, attach, order, cover, remove, the 12-per-tour and 200-per-cooperative limits.
- [ ] **Step 5: settings.** `store/settings.py`: `get` returns defaults for a cooperative with no row; `save` validates every field of spec §8 and §7.3 (bank holder upper-case ASCII, `map_url` https only).
- [ ] **Step 6: scaffolding.** `web.py`, `main.py`, `routes/assets.py`, the three base templates, `tokens.css`, `admin.css`, fonts with `OFL.txt`, `icons.html` (Lucide paths as Jinja macros, ISC notice in the file). The admin shell renders the nine tabs of spec §6 with `kit.tabs`. Each of the four feature routers exists as a stub registered in `main.py` with one placeholder page so the app starts. Tests: `/healthz`; a static file is served with the immutable cache header under a hashed name and 404 otherwise; public media rules (Review Focus 2); the protected media route serves any image of the manager's own cooperative only; an unknown path gives the Vietnamese not-found page; the 503 "Hệ thống đang bận" when the connection gate is full.
- [ ] **Step 7: preview server.** `tests/preview.py`: starts a throwaway database (the test fixture's mechanism), applies both migrations, seeds a demo cooperative (settings with a bank account, four tours from the templates with generated gradient test images, departures in the past and future, bookings in every state, payments, reviews, inquiries), and serves the app at `http://127.0.0.1:<port>/apps/tea-tour/` with `/dxos-app.css` from `apps/web/public/`, the production CSP header on every response, and a query switch `?as=manager|farmer` remembered by path prefix (no cookies) that injects the matching token. Document the command and a headless screenshot recipe (Playwright from `apps/web/node_modules`, 1280×800 and 390×844, light and dark) in the interfaces file.
- [ ] **Step 8:** remove the 0.2.0 store, templates and tests; `python -m pytest tests -q -W error` passes; `python -m dxos_cli validate miniapps/tea-tour` passes once web is `1.13.0` (run it against a tree that has Task P's version bump, or note it for Task I); `bash scripts/appkit-sync.sh --check` clean. Commits: `feat(tea-tour): tour, departure and booking schema with data move from 0.2.0`, `feat(tea-tour): booking rules, VietQR and image processing`, `feat(tea-tour): app scaffolding, assets and preview server`.

### Task S: Customer site

**Files:** the S rows. **Consumes:** everything Task D produced (read `task-D-interfaces.md` first).

Design brief (write it into `miniapps/tea-tour/DESIGN.md` before the first template, in the google-labs `design.md` format, as a delta of the root `DESIGN.md`):
- Mobile first. Sticky top bar: cooperative name, "Tour", "Tra cứu", primary button "Đặt tour". Mobile navigation in a `<details>`.
- Home hero: full-bleed cover image (`<img>` with `object-fit: cover`, gradient overlay from a wrapper class), display heading, tagline, two calls to action. Sections with 48–64 px rhythm: featured tours, "Đặt tour trong 3 bước", reviews, contact card, footer with policy links.
- Tour card: 4:3 photo or the category illustration, category chip on the photo, title, duration and "giá từ", star rating, next departure with seats left.
- Tour page: scroll-snap gallery with a thumbnail strip; on desktop two columns with a sticky booking card (price, next departures, button); on mobile a bottom bar with the price and "Chọn ngày". Itinerary as a vertical timeline. Includes and excludes with check and cross icons. FAQ in `<details>`.
- Booking: three-step indicator, large inputs (48 px), a summary card, the review step with the total, deposit and hold deadline.
- My booking: status timeline, a payment card with the QR, bank name, account, holder, amount and transfer content as selectable text, then ticket, cancel and review blocks. Ticket page styled as a boarding pass with a perforated edge and the QR; it prints cleanly.
- Five category illustrations as SVG files (layered tea hills, own work) used when a tour has no photo.
- Light and dark from `prefers-color-scheme` and `?theme=`; hover transitions only, off under `prefers-reduced-motion`.

- [ ] **Step 1:** `DESIGN.md`, `site.css`, illustrations, `site/base.html` blocks.
- [ ] **Step 2: catalogue.** Tests then code for `/`, `/tours` (filters, the three sorts of spec §5 rule 5, paging 12, empty states), `/tours/<slug>` (draft, archived and other cooperative's tours are 404; seats left come from `departure_load`; only published reviews and their average show).
- [ ] **Step 3: booking flow.** Tests then code: step 1 validation re-renders with 422 and keeps values; a valid step 1 renders step 2 with 200 and writes nothing; `POST /bookings` creates through `core.create_booking` and redirects to `/booking?code=&key=&booked=1`; Review Focus 4; a full, closed or past departure is refused with the message of the refusal; 21 guests refused; zero adults refused.
- [ ] **Step 4: my booking.** `/booking` with a valid key shows the state, the QR only while money is due and the bank is configured (otherwise the hotline line), the ticket link only when confirmed; `POST /booking/lookup` with the right code and phone redirects to the key URL and with wrong input shows one message; report paid, cancel (deadline), review (eligibility) go through `core`; `/ticket` 404 unless confirmed; Review Focus 2 and 5; no page shows another guest's name or phone; every page has the `no-referrer` meta.
- [ ] **Step 5: inquiry and policy pages.**
- [ ] **Step 6: visual pass.** With the preview server, capture every page at 1280×800 and 390×844, light and dark, into your scratchpad folder; look at each image; fix overflow, overlap, contrast and empty states. List the image paths in the report. `pytest` passes. Commit `feat(tea-tour): customer site with booking, VietQR payment, ticket and reviews`.

### Task B1: Back office — tours, photos, departures, settings

**Files:** the B1 rows. **Consumes:** Task D.

- [ ] **Step 1: tours.** Tests then code: list with status filter and paging; create blank or from a template (`/tours/new?template=<key>` prefills); every field limit of spec §8 with the form re-rendered on error (422, values kept); slug generated once and unique within the cooperative; publish, unpublish, archive with the confirmation page of spec §7.9; itinerary, includes, excludes, bring and FAQ edited as repeated rows in plain forms (no script); Review Focus 5.
- [ ] **Step 2: photos.** Upload one image per request through `media.process_image`; refusal messages; cover, order up and down, remove; the limits of spec §7.7; thumbnails come from the protected media route.
- [ ] **Step 3: departures.** List and month calendar (a 7-column grid on desktop, an agenda list at 390 px, month navigation by links); create one; bulk creation with every rule of spec §7.9 (refusal above 60 creates nothing); edit seats through `core.set_departure_seats`, prices, guide (households from the core as in 0.2.0, with the same failure behaviour); close, reopen, cancel through `core.cancel_departure` with the confirmation page; departure page with guests, check-in by button and by code, CSV (BOM, CRLF, formula guard, file name via `appkit.csv_filename`), print sheet with `kit.print_bar`.
- [ ] **Step 4: settings.** Form for every field, cover upload, a sample VietQR preview when the bank is set.
- [ ] **Step 5: visual pass** as in Task S for every B1 page inside the kit's look; `pytest` passes. Commit `feat(tea-tour): tour, photo, departure and settings management`.

### Task B2: Back office — overview, bookings, payments, customers, reviews, reports

**Files:** the B2 rows. **Consumes:** Task D.

- [ ] **Step 1: overview.** Tests then code: the six figures of spec §6, departures of the next 7 days, the to-do list (pending, reported paid, refund due, reviews to moderate, new inquiries) with links; opening it runs `core.sweep`.
- [ ] **Step 2: bookings.** List with the filters and literal search of spec §6 and paging 25; booking page with the event history and every action through `core` (confirm, payment and refund, cancel with reason, move, resize, internal note); manager booking form (`source = MANAGER`, up to the seats left); CSV; Review Focus 2 and 5.
- [ ] **Step 3: payments and customers.** Ledger with filters, totals and CSV; customers grouped by phone with search and CSV.
- [ ] **Step 4: reviews and inquiries.** Moderation, reply, inquiry status and note.
- [ ] **Step 5: reports.** Twelve months of guests, bookings and money received with `kit.chart`; by tour; occupancy of past departures; cancellation rate; each figure has a test with a small fixed data set.
- [ ] **Step 6: visual pass** as in Task S; `pytest` passes. Commit `feat(tea-tour): booking desk, payments ledger, customers, reviews and reports`.

### Task G: Guide pages

**Files:** the G rows. **Consumes:** Task D.

- [ ] **Step 1:** tests then code: `/guide` lists only departures assigned to the caller (upcoming, then past) with confirmed guests from `departure_load`; the departure page shows confirmed bookings with name, adults, children, guest note, amount still to collect and check-in state, and never a phone or email (assert the seeded phone is absent from the HTML); check-in and undo by button and by code through `core` with `guide_user_id`; Review Focus 2; outside the window the buttons are replaced by the reason.
- [ ] **Step 2: visual pass**; `pytest` passes. Commit `feat(tea-tour): guide schedule, guest list and check-in`.

### Task I: Integration, smoke, browser stories, docs, two clean rounds

Runs after P, D, S, B1, B2 and G are merged into `feat/tea-tour-pro`. Its brief is written at that point from the merged tree. Scope (spec §10, §11):

- Manifest `store` block and four screenshots; `README.md` of the app; root `README.md`, `docs/miniapps.md`, `DEPENDENCIES.md` (Pillow, segno, Be Vietnam Pro, Lucide paths), `CHANGELOG.md`.
- `platform/tests/smoke-apps.sh`: the tea-tour blocks rewritten to the new pages, every gateway and lifecycle check kept, plus an upgrade from 0.2.0 with data.
- Playwright: `story/tea-tour.spec.ts` and the tea-tour part of `story/app-kit.spec.ts` rewritten to the full story of spec §11; `visual/screens.spec.ts` tea-tour screens; `tools/store-screenshots.spec.ts`; `.github/workflows/ci.yml` steps.
- Photo upload verified in the real container (read-only root).
- Two clean rounds on `dxos-clean`; `make build`, `make test`, `make lint`; counts reported against `v1.12.0`.
