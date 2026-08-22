# Phân tích Issue #62: [Epic 3][3.6] Batch Journal Approval Officer Weekly Review

## 1. Yêu cầu của Issue
- **Mục tiêu:** Xử lý logic Backend và Integration cho chức năng "Batch Journal Approval" (Duyệt nhật ký hàng loạt) dành cho Officer.
- **Vấn đề (Conflict):** Theo BA/PRD mới nhất, "Officer" là người có thẩm quyền (canonical authority) duyệt nhật ký canh tác của Farmer. Tuy nhiên, tài liệu cũ (`rules-and-limits.md` phần 3.3 và 4.2) lại ghi rằng "Only manager can APPROVE or REJECT". Cần phải "reconcile" (đồng bộ hóa/hòa giải) sự mâu thuẫn này trước khi implement.
- **Scope:** Tập trung vào Backend (API/Domain/Integration). Phần UI (Epic 8-7) chỉ là visual mock.

## 2. Hiện trạng Dự án (As-Is)
- File `apps/web/src/app/api/journal/batch-approve/route.ts` đã cho phép cả `manager` và `officer` gọi API này (kiểm tra `role !== 'manager' && role !== 'officer'`).
- File `rules-and-limits.md` đang chứa thông tin cũ, mâu thuẫn với PRD:
  - Mục 3.3 ghi: `- Only manager can APPROVE or REJECT (pending_approval → approved/rejected)`
  - Mục 4.2 (Authorization Matrix) ghi: `Approve journal entries | ✅ (manager) | ❌ (officer) | ❌ (farmer)`
- Giới hạn Batch approve (max 50 entries) chưa được validate chặt chẽ trong Backend (`journalBatchApproveSchema` trong `src/lib/validations/journal.schema.ts` cần được kiểm tra xem có limit `max(50)` chưa).

## 3. Đề xuất Giải pháp (To-Be)
1. **Cập nhật tài liệu (Reconcile Docs):**
   - Sửa `rules-and-limits.md` mục 3.3 thành: `- Officer and manager can APPROVE or REJECT (pending_approval → approved/rejected)`
   - Sửa `rules-and-limits.md` mục 4.2: Cột `officer` ở dòng "Approve journal entries" chuyển từ `❌` thành `✅`.
2. **Cập nhật Code & Validation:**
   - Kiểm tra file `src/lib/validations/journal.schema.ts`: Đảm bảo schema `journalBatchApproveSchema` giới hạn `entry_ids` tối đa 50 phần tử. (Nếu chưa có, thêm `.max(50)`).
   - Kiểm tra lại logic UseCase/Repository xem có bất kỳ cản trở nào về quyền Officer không.
   - Viết Integration Test cho API Batch Approve bằng role `officer` để chứng minh BE đã hoạt động đúng theo rule mới.

## 4. Các bước Triển khai
1. Đọc và kiểm tra schema Zod (`journal.schema.ts`).
2. Thực hiện cập nhật docs (`rules-and-limits.md`).
3. Bổ sung validation giới hạn 50 records (nếu thiếu).
4. Viết test case integration (API level hoặc UseCase level) chứng minh logic phê duyệt hàng loạt của Officer.
