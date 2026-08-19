# Test Plan — Story 8.3: Lot List Page

**Story:** 8-3-lot-list-page
**Test Architect:** Murat (bmad-tea)
**Risk Level:** MEDIUM — Table pagination, filter tabs, click-through navigation
**Test Strategy:** Smoke + Component + Interaction

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Filter tabs do not filter | Medium | Medium | Active tab filters visible rows |
| QR icon column misaligned | Low | Low | Visual check |
| Row click does not navigate | Medium | High | Playwright click + URL assertion |
| Status pills wrong tone | Low | Low | Explicit class checks |

---

## Test Cases

### T1: Page Renders (Smoke)
**Given:** Manager navigates to /manager/lots
**Then:** h1 = San sang giao thuong, table present

### T2: 3 Lot Rows in Table
**Then:** 3 .lot-row or .table-row elements, correct lot codes (LH-260813, LH-260810, LH-260806)

### T3: Filter Tab Counts Correct
**Then:**
- Tab Tat ca shows count 3
- Tab San sang shows count 1
- Tab Da xuat QR shows count 1

### T4: Status Pill Tones
**Then:**
- San sang row has pill-green
- Da xuat QR row has pill-blue
- Nhap row has pill-amber

### T5: Create Lot Button Visible
**Then:** Button + Tao lo hang exists and is clickable

### T6: Row Click Navigates to Detail
**Given:** User clicks LH-260813 row
**Then:** URL changes to /manager/lots/LH-260813 (or lot_code equivalent)

### T7: Search Input Accepts Text
**Then:** Search input accepts typing and does not error

### T8: QR Icon in Last Column
**Then:** Each row has QrCode icon (data-testid or svg aria-label)

---

## Definition of Done

- [ ] T1 Smoke
- [ ] T2 3 rows with correct codes
- [ ] T3 Filter tab counts
- [ ] T4 Pill tones
- [ ] T5 Create button
- [ ] T6 Row navigation
- [ ] T7 Search input
- [ ] T8 QR icon column
