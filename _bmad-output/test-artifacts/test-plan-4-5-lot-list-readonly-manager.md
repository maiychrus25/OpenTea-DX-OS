# 🧪 Test Plan — Story 4.5: Lot List Readonly Manager

**Authored by:** Murat
**Story:** 4.5

---

## Detailed Test Cases

### TC-4.5-01: Manager Access (Unit)
**Type:** Unit
**Tool:** Jest
**Execution:** Ensure `GetAllLotsUseCase` can be executed by Manager role but `CreateDraftLotUseCase` throws 403 Forbidden for Manager role.

### TC-4.5-02: Readonly Verification (Manual)
**Type:** E2E
**Tool:** Playwright
**Execution:** Assert no "Edit" or "Create" buttons exist on `/manager/lots`.
