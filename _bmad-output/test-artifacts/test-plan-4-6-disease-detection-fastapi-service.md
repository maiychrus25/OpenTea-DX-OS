# 🧪 Test Plan — Story 4.6: Disease Detection FastAPI Service

**Authored by:** Murat
**Story:** 4.6

---

## Detailed Test Cases

### TC-4.6-01: Invariant Enforcement (Integration)
**Type:** Integration
**Tool:** Pytest
**Execution:** Send image to `/predict`. Assert JSON keys exactly match `["disease_name", "confidence_score"]`. Assert `treatment` key does not exist.
