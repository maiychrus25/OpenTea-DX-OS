# Test Plan — Story 8.7: Journal Manager Approval

**Story:** 8-7-journal-manager-approval
**Test Architect:** Murat (bmad-tea)
**Risk Level:** MEDIUM — Approve/reject state toggle, AI warning banner
**Test Strategy:** Component + Interaction + State

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Approve action crashes | High | High | Click test with state assertion |
| AI warning shows when no disease | Low | Medium | Only show if flagged mock |
| Wrong domain terms (record vs JournalEntry) | Low | Medium | Code review check |
| Table row count wrong | Low | Low | Count assertion |

---

## Test Cases

### T1: Page Renders (Smoke)
**Given:** Manager navigates to /manager/journal
**Then:** h1 includes Duyet nhat ky, table present

### T2: 3 Journal Rows
**Then:** 3 .table-row elements, containing TP-014, TP-021, TP-008

### T3: Status Pills Correct
**Then:**
- TP-014 row has amber Cho duyet pill
- TP-021 row has green Da duyet pill

### T4: Approve Action Changes Status
**Given:** Click Duyet on TP-014 row
**Then:** Row pill changes from amber Cho duyet to green Da duyet

### T5: AI Disease Warning Banner
**Given:** At least one row has disease flag
**Then:** .notice amber banner visible with text AI phat hien dau hieu

### T6: Notice Banner Content
**Then:** Banner has strong + span structure, icon present

### T7: Domain Terms Compliance (Code Review)
**Then:** Code uses JournalEntry not record/log/diary (per AGENTS.md glossary)

---

## Definition of Done

- [ ] T1 Page renders
- [ ] T2 3 rows with correct parcels
- [ ] T3 Status pill tones
- [ ] T4 Approve state toggle
- [ ] T5 AI warning banner shows
- [ ] T6 Banner structure correct
- [ ] T7 Domain terms compliance
