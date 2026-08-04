# 🧪 Test Plan — Story 4.3: Lot Review & QR Export

**Authored by:** Murat
**Story:** 4.3

---

## Detailed Test Cases

### TC-4.3-01: Publish State Transition (Integration)
**Type:** Integration
**Tool:** Jest
**Execution:** Attempt to publish an already `PUBLISHED` lot. Must throw an error preventing re-publishing.

### TC-4.3-02: QR Render (Unit)
**Type:** Unit
**Tool:** RTL
**Execution:** Render `QRGenerator` with ID `123`. Assert SVG or Canvas renders correctly with the correct URL embedded.
