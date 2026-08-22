# Phân tích Issue #63: [Epic 3][3.7] Technical Announcement to Farmers Officer

## 1. Yêu cầu của Issue
- **Mục tiêu:** Cho phép Officer gửi thông báo kỹ thuật (Technical Announcement) hàng loạt (fan-out) tới các Farmers.
- **Scope:** Tập trung vào Backend (tạo notification integration & fan-out logic). Phần hiển thị UI (Epic 8-9) không nằm trong scope của issue này.

## 2. Hiện trạng Dự án (As-Is)
- Database schema (`schema.prisma`) đã có sẵn `NotificationType.ANNOUNCEMENT` và `NotificationType.BROADCAST`.
- Truy vấn lấy thông báo (`getRecentByUserId` trong `PrismaNotificationRepository`) đã hỗ trợ hiển thị các thông báo có `recipient_id: null` (tức là thông báo broadcast cho tất cả mọi người).
- Hiện tại API route `/api/notifications/route.ts` chỉ có `GET` (lấy danh sách), `PUT` (đánh dấu đã đọc), và `DELETE` (xóa). Chưa có API `POST` để tạo thông báo mới.

## 3. Đề xuất Giải pháp (To-Be)
Dựa trên cơ chế "recipient_id = null" để broadcast:
1. **Cập nhật Port & Repository:**
   - Thêm phương thức `broadcastAnnouncement(title: string, body: string, senderId: string): Promise<void>` vào `NotificationPort`.
   - Implement phương thức này trong `PrismaNotificationRepository` để tạo một bản ghi `Notification` với `type = NotificationType.ANNOUNCEMENT`, `recipient_id = null` và `sender_id = senderId`.
2. **Tạo UseCase:**
   - Tạo file `broadcast-announcement-usecase.ts` trong `application/notification/` để đóng gói logic gửi thông báo.
3. **Thêm API Route:**
   - Viết API `POST` tại `apps/web/src/app/api/notifications/announce/route.ts` (hoặc trực tiếp trong `POST` của `/api/notifications`).
   - Validate body request (`title`, `body`) bằng Zod.
   - Validate authorization: Chỉ cho phép role `officer` (hoặc `manager`) gọi API này.
4. **Viết Unit/Integration Test:**
   - Đảm bảo UseCase gọi đúng Repository và tạo ra notification có `recipient_id` là null.

## 4. Kế hoạch Triển khai
1. Định nghĩa schema Zod cho payload `{ title, body }`.
2. Cập nhật `NotificationPort` và `PrismaNotificationRepository`.
3. Khởi tạo `BroadcastAnnouncementUseCase`.
4. Tạo route `POST /api/notifications/announce` và tích hợp UseCase.
5. Viết test case xác minh logic fan-out.
