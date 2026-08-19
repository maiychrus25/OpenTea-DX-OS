# Test Plan — Story 8.4: Lot Detail 6-Step Workflow

**Story:** 8-4-lot-detail-6step-workflow
**Test Architect:** Murat (bmad-tea)
**Risk Level:** MEDIUM — Step tracker state, QR preview, action buttons
**Test Strategy:** Component + Interaction + State

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Step tracker does not highlight active step | Medium | Medium | class assertion |
| QR placeholder not shown | Low | Low | Visual check |
| Xuat QR button broken | High | High | Click test + no JS error |
| Review grid data missing fields | Medium | Medium | Field-by-field check |

---

## Test Cases

### T1: Page Renders at Step 5 (Smoke)
**Given:** /manager/lots/TP-CN-20260812-001
**Then:** h2 = Buoc 5 - Pre-review & hoan thien

### T2: 6-Step Tracker Shows Correct Steps
**Then:**
- 6 .step elements rendered
- Steps 1-4 have .step.done class
- Step 5 is active (current)
- Step 6 is pending

### T3: Review Grid Has All 9 Fields
**Then:** dt/dd pairs for: Ma lo, Nong san, Ngay thu hoach, Ngay dong goi, Cach ly, HTX, Ho nong dan, Thua dat, Nguoi duyet

### T4: QR Preview Panel Shows Placeholder
**Then:** .qr-preview-side exists, .qr-visual.placeholder or .qr-visual present, caption text Ma QR se duoc sinh

### T5: Luu Nhap Button Renders
**Then:** Button Luu nhap (secondary-button) visible bottom-left

### T6: Xuat QR Button Renders and Clickable
**Then:** Button Xuat QR (primary-button) visible bottom-right, click does not throw

### T7: Back Link Navigates to Lot List
**Then:** Link Quay lai... href points to /manager/lots

---

## Definition of Done

- [ ] T1 Step 5 view renders
- [ ] T2 6-step tracker correct states
- [ ] T3 Review grid 9 fields
- [ ] T4 QR preview placeholder
- [ ] T5 Luu Nhap button
- [ ] T6 Xuat QR clickable
- [ ] T7 Back navigation
