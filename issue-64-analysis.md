# Phân tích Issue #64: [Epic 4][4.1] Pre-Harvest Withdrawal Period Inspection

## 1. Yêu cầu của Issue
- **Mục tiêu:** Xử lý domain logic cho thời gian cách ly (withdrawal period) và phê duyệt thu hoạch (harvest approval).
- **Scope:** Server-side calculation, Authorization (Manager/Officer), Persistence, và Manager Notification. Giao diện (Epic 8-4/8-12) không nằm trong scope này.

## 2. Hiện trạng Dự án (As-Is)
- Tài liệu `docs/database-schema.md` có định nghĩa `safe_harvest_date` trong `journal_activities`, nhưng file **`apps/web/prisma/schema.prisma` hiện tại đang THIẾU field `safe_harvest_date`**.
- Trong `ParcelStatus` (Prisma schema) có status `HARVEST_APPROVED` và `HARVESTED`.
- Trong `Parcel` model có các field `harvest_approved_by` và `harvest_approved_at`.
- Chưa có API endpoint để Approve Harvest cho một Parcel.
- Chưa có UseCase cho `ApproveHarvest`.

## 3. Đề xuất Giải pháp (To-Be)

1. **Cập nhật Database Schema:**
   - Bổ sung `safe_harvest_date DateTime?` vào model `JournalActivity` trong `schema.prisma`.
   - Tạo DB Migration (`npx prisma migrate dev`).

2. **Cập nhật Domain / Business Logic (Calculation):**
   - Khi tạo/cập nhật `JournalEntry` (đặc biệt là hành động phun thuốc/SPARYING), nếu có truyền lên `withdrawal_days`, server bắt buộc phải tính toán: `safe_harvest_date = entry_date + withdrawal_days` và lưu vào DB. (Tuyệt đối không tin tưởng ngày do Client gửi lên theo rule 3.2).

3. **Tạo `ApproveHarvestUseCase`:**
   - Input: `parcel_id`, `officer_id`.
   - Lấy toàn bộ `safe_harvest_date` lớn nhất của các activity liên quan đến Parcel này trong vụ mùa hiện tại.
   - Kiểm tra: `now() >= max(safe_harvest_date)`? Nếu chưa qua thời gian cách ly -> `throw Error('WITHDRAWAL_NOT_PASSED')`.
   - Nếu thỏa mãn: 
     - Update `Parcel.status = HARVEST_APPROVED`.
     - Lưu `harvest_approved_at = now()`, `harvest_approved_by = officer_id`.
   - Gửi Notification (`type = HARVEST_APPROVED`) tới role Manager.

4. **Thêm API Route:**
   - Tạo route `POST /api/parcels/[id]/approve-harvest` (hoặc tương tự).
   - Kiểm tra Auth: Chỉ cho phép `officer` hoặc `manager`.
   - Gọi `ApproveHarvestUseCase`.

5. **Viết Tests:**
   - Test Server-side calculation của `safe_harvest_date`.
   - Test `ApproveHarvestUseCase` (pass / block).

## 4. Kế hoạch Triển khai
1. Sửa `schema.prisma` và chạy Prisma migrate.
2. Viết UseCase `ApproveHarvestUseCase` + Unit Tests.
3. Cập nhật `JournalUseCase` hoặc Hook Prisma để tự động tính `safe_harvest_date`.
4. Tạo API endpoint và tích hợp Notification.
