# 🧪 Test Plan — Story 6.1: MinIO PARA Document Store

**Authored by:** Murat
**Story:** 6.1

---
## Detailed Test Cases
### TC-6.1-01: Pre-signed URL Generation
**Execution:** Assert `MinioAdapter.generateUploadUrl` returns a string URL containing the bucket name and an auth signature query param.
