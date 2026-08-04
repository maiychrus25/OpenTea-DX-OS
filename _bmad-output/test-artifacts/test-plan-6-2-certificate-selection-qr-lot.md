# 🧪 Test Plan — Story 6.2: Certificate Selection for QR Lot

**Authored by:** Murat (Master Test Architect — bmad-tea)
**Story:** 6.2 — Certificate Selection for QR Lot
**Date:** 2026-08-05
**Risk Level:** 🟢 LOW — Standard data fetching and UI updates.

---

## Test Cases

### TC-6.2-01: Public Route Pre-signed URL (Integration)

**Type:** Integration
**Tool:** Jest
**Priority:** P0

**Test Concept:**
Mock `IStoragePort.generateDownloadUrl` to return `"https://minio.local/cert.pdf?sig=..."`.
Execute `GetPublicLotDetailsUseCase`. Assert that the returned payload contains the pre-signed URL instead of the raw object key.

### TC-6.2-02: Wizard UI Render (Unit)

**Type:** Unit
**Tool:** Jest + RTL
**Priority:** P1

**Test Concept:**
Render Step 4 of the Wizard. Assert that it calls the `/api/documents` endpoint and renders a list of checkboxes for the certificates.

---

## Definition of Done

- [ ] `TC-6.2-01` PASS: Pre-signed URLs correctly attached to public payload.
- [ ] `TC-6.2-02` PASS: Wizard fetches available docs.
- [ ] Committed with: `feat(traceability): integrate minio documents into lot creation`
