
# Story 8.7: Officer Journal Approval (Nhat ky canh tac)

**Status:** ready-for-dev
**Epic:** 8 -- FE Prototype Reconstruction (Phase 2)
**Role:** OFFICER (Can bo KT/CL) -- sidebar menu: Nhat ky canh tac
**CORRECTION:** Previously wrongly assigned to Manager. Journal approval is Officer function.

## Correct Sidebar Reference
Manager: Tong quan hom nay | Ban tin nong nghiep | Hoi dap thi truong | Vung trong & doi tac | Lo hang & truy xuat | Tai lieu HTX | Ho so HTX & tai khoan
Officer: Cong viec hom nay | Quan ly vung trong | Nhat ky canh tac [THIS PAGE] | Nghiem thu & lo hang | Nhat ky benh | Tai lieu P.A.R.A | Tro ly ky thuat | Tai khoan cua toi
Farmer: Hom nay | Ghi nhat ky | Chan doan benh | Thua cua toi | Ban tin & thong bao | Tai khoan cua toi

## Story
As an Officer, I want a journal review page at /officer/journal (Nhat ky canh tac) with pending entries, approve/reject actions, and an AI disease warning, so I can validate field records.

This FE prototype follows the BA/PRD authority model: Officer reviews farmer entries. It does not change the approval authority in the API contract until the contract reconciliation story is completed.

## Acceptance Criteria

### AC-1: Page at /officer/journal
- eyebrow: NHAT KY CANH TAC
- h1: Kiem tra va phe duyet nhat ky
- Top-right: + Tao nhat ky (primary-button)
- Officer sidebar: Nhat ky canh tac is active

### AC-2: Work Table
Columns: Ma thua | Cay trong - Hoat dong | Ngay | Trang thai
3 mock rows:
- TP-014 | Cai ngot - Phun thuoc BVTV | 10/08/2026 | Cho duyet (amber pill)
- TP-021 | Xa lach - Bon phan huu co | 11/08/2026 | Da duyet (green pill)
- TP-008 | Dua leo - Thu hoach | 12/08/2026 | Can xu ly (amber pill)

### AC-3: Approve/Reject Actions
Cho duyet rows: Duyet + Tu choi buttons. Click Duyet -> pill changes to green Da duyet (client useState).

### AC-4: AI Disease Warning Banner
If any row flagged: amber .notice banner visible.
Text: AI phat hien dau hieu sau toi. Kiem tra truoc khi phe duyet.

### AC-5: License Header + No Inline Styles

## Tasks
- [ ] Create apps/web/src/app/(officer)/journal/page.tsx [NEW]
- [ ] Work table with 3 mock JournalEntry rows
- [ ] Client-side approve toggle
- [ ] AI notice banner
- [ ] npm run build passes

## Scope Boundary

Mock approval state is presentation-only. It must not be treated as persistence, notification delivery, authorization, or journal status derivation. The integration story must bind this page to the canonical pending/reject/request-changes/batch-approve contract.

## Dev Notes


### 🚀 KHAI THÁC TỪ PROTOTYPE (D:\FE)
- **JSX/Mock data**: Copy function `OfficerJournalView()` (L131-159) và mảng `pendingEntries` (L124-129) trong `D:\FE\components\agri-app.tsx`.
- **CSS**: Copy các class `.work-table`, `.approval-table`, `.approval-head`, `.approval-row` từ `D:\FE\app\globals.css`.
- **Refactor**: Split Client Component cho phần approve (button + state), phần table cố gắng giữ Server Component (nếu được).
