# Story 8.4: Lot Detail — 6-Step Workflow + QR Preview Panel

**Status:** ready-for-dev
**Epic:** 8 — FE Prototype Reconstruction (Phase 2)
**Source:** Video 2026-08-19 (timestamp 1:09/2:42)

## Story
As a Manager, I want the read-only lot detail page to show the 6-step progress tracker and QR preview, so I can inspect exactly where an Officer-controlled lot is in the workflow. Mutation actions belong to the Officer lot workflow and are not authorized by this Manager prototype page.

## Acceptance Criteria

### AC-1: 6-Step Progress Tracker
Steps: 1.Thong tin co ban | 2.Nguon goc vung trong | 3.Phuong phap canh tac | 4.Ket qua nghiem thu | 5.Pre-review & hoan thien | 6.Xuat QR
- Done steps: green circle with checkmark, green text, green background
- Active step: numbered circle, dark text, highlighted background
- Pending steps: grey circle, muted text

### AC-2: Review Grid (Step 5 Content)
Pre-review table with 2-column grid layout:
- Ma lo: TP-CN-20260812-001 [check]
- Nong san: Cai ngot [check]
- Ngay thu hoach: 12/08/2026 [check]
- Ngay dong goi: 13/08/2026 [check]
- Cach ly: 15 ngay (dat >= 14) [check]
- HTX: HTX Rau an toan Tan Phu [check]
- Ho nong dan: Nguyen Van Binh [check]
- Thua dat: TP-014, TP-016, TP-019, TP-022 [check]
- Nguoi duyet: Tran Van B [check]
- Tong trong luong: 2.450 kg
- Quy cach dong goi: Bao 25kg

### AC-3: QR Preview Panel (Right Side)
- Side panel styled as .qr-preview-side
- Placeholder QR visual (11x11 grid of dots)
- Caption: Ma QR se duoc sinh sau khi xuat

### AC-4: Prototype Action Presentation (Bottom)
- Left: Luu nhap (secondary-button) and right: Xuat QR (primary-button with QR icon) may be rendered for visual reconstruction.
- Production Manager route must disable or replace both mutations with a link to the Officer workflow; export authorization is enforced server-side.

### AC-5: Navigation Back
- Back link: <- Quay lai danh sach lo

### AC-6: Mock Data + License Header

## Tasks
- [ ] Create (manager)/lots/[lot_code]/page.tsx [NEW]
- [ ] Add 6-step tracker component: StepTrack
- [ ] Add review grid with pre-filled mock data (Step 5 view)
- [ ] Add QR preview side panel
- [ ] Add Luu nhap + Xuat QR buttons
- [ ] npm run build passes

## Scope Boundary

This is an FE prototype story. It does not replace Stories 4.2, 4.3, 4.5, 6.2, or the critical-path integration story. The mock tracker and QR visual must be replaced by the canonical lot API and immutable snapshot contract before production export is considered complete.

## Dev Notes


### 🚀 KHAI THÁC TỪ PROTOTYPE (D:\FE)
- **JSX/Mock data**: Copy function `LotDetailView()` (L183-250) và `QrVisual()` (L176-181) trong `D:\FE\components\agri-app.tsx`.
- **CSS**: Copy các class `.step-track`, `.step`, `.step.done`, `.review-grid`, `.qr-preview-grid`, `.qr-preview-side`, `.qr-visual` từ `D:\FE\app\globals.css`.
- **Refactor**: Sửa `useState` của lotId thành sử dụng URL params (route `[lot_code]`).
