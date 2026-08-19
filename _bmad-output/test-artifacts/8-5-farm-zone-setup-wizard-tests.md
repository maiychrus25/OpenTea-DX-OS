# Test Plan — Story 8.5: Farm Zone Setup Wizard

**Story:** 8-5-farm-zone-setup-wizard
**Test Architect:** Murat (bmad-tea)
**Risk Level:** MEDIUM — 3-step wizard state machine, form validation
**Test Strategy:** Interaction + State Machine + Form

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Step forward without selection crashes | High | High | Disable Tiep theo if no household selected |
| Step indicator does not update | Medium | Medium | Class assertion after step change |
| Form inputs do not clear between steps | Low | Low | Input value assertion |
| Map canvas SSR error (Leaflet) | High | High | Use static mock map, not real Leaflet |

---

## Test Cases

### T1: Wizard Loads at Step 1 (Smoke)
**Given:** Officer navigates to /officer/farm-zone/setup
**Then:** h1 = Ho -> Thua dat -> Cay trong, Step 1 tab is active (green border)

### T2: Step 1 - Household Selection
**Then:** Household list shows >= 1 items, Selecting Nguyen Van Binh highlights it (active class)

### T3: Step 1 - Add New Household Form
**Then:** Ten chu ho and So dien thoai inputs exist, + Them ho button renders

### T4: Forward Navigation Step 1 -> 2
**Given:** User selects household, clicks Tiep theo
**Then:** Step 2 tab becomes active, map canvas renders, step 1 shows checkmark

### T5: Step 2 - Map Canvas Mock Renders
**Then:** .setup-canvas element exists, draw hint text visible

### T6: Step 2 - Parcel Form Fields
**Then:** Ma dinh danh thua, Dien tich m2, Chu thua inputs present with mock values

### T7: Forward Navigation Step 2 -> 3
**Given:** User clicks Tiep theo on step 2
**Then:** Step 3 tab becomes active

### T8: Step 3 - Crop Form Fields
**Then:** Cay trong dropdown, Mua vu input, Thanh vien input, Nang suat input present

### T9: Step 3 - Summary Panel
**Then:** Tom tat panel shows Ho, Thua, Cay trong, Trang thai fields

### T10: Hoan Tat Thiet Lap Button
**Then:** Button exists, click does not throw (navigates back to map or shows success)

### T11: Back Navigation Works
**Then:** Truoc button on step 2 returns to step 1, step indicator reverts

---

## Definition of Done

- [ ] T1 Wizard initial state
- [ ] T2 Household selection
- [ ] T3 New household form
- [ ] T4 Step 1->2 navigation + indicator
- [ ] T5 Mock map renders
- [ ] T6 Parcel form fields
- [ ] T7 Step 2->3 navigation
- [ ] T8 Crop form fields
- [ ] T9 Summary panel
- [ ] T10 Complete button
- [ ] T11 Back navigation
