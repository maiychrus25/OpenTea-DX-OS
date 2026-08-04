# 🧪 Test Plan — Story 4.4: Public QR Scan Page

**Authored by:** Murat
**Story:** 4.4

---

## Detailed Test Cases

### TC-4.4-01: Draft Protection (Integration)
**Type:** Integration
**Tool:** Jest
**Execution:** Call `GetPublicLotDetailsUseCase` for a `DRAFT` lot. Assert it throws.
