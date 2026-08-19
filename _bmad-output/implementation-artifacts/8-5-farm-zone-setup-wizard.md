# Story 8.5: Farm Zone Setup Wizard — 3-Step (Ho -> Thua -> Cay trong)

**Status:** ready-for-dev
**Epic:** 8 — FE Prototype Reconstruction (Phase 2)
**Source:** Video 2026-08-19 (timestamps 1:33-1:36/2:42)

## Story
As an Officer, I want a 3-step wizard to set up a farm zone (chon/them ho -> ve thua dat tren ban do -> gan cay trong), so I can quickly onboard new households and parcels into the system.

## Acceptance Criteria

### AC-1: Wizard Header + Back Link
- Back link: <- Quay lai ban do
- eyebrow: THIET LAP VUNG TRONG
- h1: Ho -> Thua dat -> Cay trong
- Subtitle: Thuc hien tuan tu: them ho, khoanh thua tren ban do, sau do gan cay trong.

### AC-2: Step Progress Tabs (3 tabs)
Tab 1: [1] Chon / them ho (active: green border, green number circle)
Tab 2: [2] Ve thua dat (pending: grey)
Tab 3: [3] Gan cay trong (pending: grey)
Done steps show checkmark icon in green circle

### AC-3: Step 1 — Chon/Them Ho
Left panel: list of registered households (household-list class)
- Each household: person icon + name + parcel count (e.g., Nguyen Van Binh - 3 thua)
- Selected household has green border + bold
Right panel: Them ho moi form
- Ten chu ho (text input)
- So dien thoai (numeric input)
- + Them ho button (primary-button full-width)
Bottom: Tiep theo -> button (primary)

### AC-4: Step 2 — Ve Thua Dat (Map Drawing)
Left panel: map canvas with draw hint at bottom
- Draw hint: Ve polygon quanh khu vuc canh tac cua [name] - dien tich se tu tinh bang Turf.js
- Polygon preview shown when drawn: green polygon labeled Dang ve
Right panel: Dien tich tu tinh form
- Ma dinh danh thua: TP-045 (auto-generated)
- Dien tich m2: 2.400 (auto-calculated)
- Chu thua: Nguyen Van Binh (from step 1)
- Note: Toa do lay tu dong tu polygon ve tren ban do
Bottom: Truoc | Tiep theo buttons

### AC-5: Step 3 — Gan Cay Trong
Left panel: form for parcel assignment
- Cay trong: dropdown (e.g., Cai ngot)
- Mua vu: text (e.g., He Thu 2026)
- Thanh vien chiu trach nhiem: Nguyen Van Binh
- Nang suat uoc tinh (tan/ha): numeric input
Right panel: Tom tat summary card
- Ho: Nguyen Van Binh
- Thua: TP-045 - 2.400 m2
- Cay trong: Cai ngot
- Trang thai: Dang gieo (green pill)
Bottom: Truoc | Hoan tat thiet lap button (primary with checkmark)

### AC-6: Mock Data + License Header

## Tasks
- [ ] Create (officer)/farm-zone/setup/page.tsx [NEW]
- [ ] Create SetupWizard component with 3-step state management (use client)
- [ ] Implement Step1: household list + new household form
- [ ] Implement Step2: map canvas mock + area form
- [ ] Implement Step3: crop assignment form + summary panel
- [ ] Step navigation with Tiep theo / Truoc buttons
- [ ] npm run build passes

## Scope Boundary

This is FE prototype work only. Household, polygon, GPS, Turf.js, crop-cycle persistence and authorization are implemented by the farm-domain and integration stories; the wizard must not call external APIs directly.

## Dev Notes


### 🚀 KHAI THÁC TỪ PROTOTYPE (D:\FE)
- **JSX/Mock data**: Copy trực tiếp function `LandSetupView()` dòng 310-337 trong `D:\FE\components\agri-app.tsx`.
- **CSS**: Copy các class `.setup-steps`, `.household-list`, `.setup-canvas`, `.draw-hint` từ `D:\FE\app\globals.css`.
