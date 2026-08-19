# TEA Test Plan — Story 4.6a: Diagnosis Proxy API

**Risk:** P0 — AI invariant, privacy and notification fan-out

- `4.6a-UNIT-001`: invalid file type/size returns structured validation error.
- `4.6a-UNIT-002`: adapter strips treatment/recommendation fields and returns disease name/confidence only.
- `4.6a-SEC-001`: approved Farmer/Officer roles are enforced and parcel/household ownership is checked.
- `4.6a-INT-001`: successful inference persists report/photo metadata using a presigned/storage boundary.
- `4.6a-INT-002`: Officer and Manager notification recipients are resolved correctly without null-recipient loss.
- `4.6a-OPS-001`: FastAPI unavailable returns 503 and does not create a false confirmed report.
- `4.6a-E2E-001`: Farmer submit → Officer notification → Officer confirmation → Farmer history.
