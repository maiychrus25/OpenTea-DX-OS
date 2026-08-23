# Phân tích Issue #77: [Epic 5][5.8] n8n Weekly Officer Reminder

Dựa trên việc đối chiếu nội dung **Story 5.8**, **BA_Document.md**, **database-schema.md**, và file workflow thực tế **`workflows/officer-reminder.json`**, dưới đây là phân tích chi tiết về trạng thái "partial" của tính năng này và các điểm sai lệch cần khắc phục.

## 1. Mâu thuẫn về Data Schema (Database Query)
File n8n workflow hiện đang query Postgres bằng câu lệnh:
```sql
SELECT submitted_by_id as officer_id, count(*) as pending_count 
FROM journal_entries 
WHERE status = 'PENDING_APPROVAL' AND created_at < NOW() - INTERVAL '7 days' 
GROUP BY submitted_by_id;
```
**Các lỗi/sai lệch so với schema:**
- **Sai tên cột:** Cột `submitted_by_id` **không tồn tại** trong bảng `journal_entries` (theo `database-schema.md`, cột lưu người tạo là `recorded_by`, cột người duyệt là `approved_by`).
- **Sai Case của ENUM:** Postgres ENUM trong schema được định nghĩa chữ thường: `pending_approval`, nhưng query đang dùng chữ in hoa `'PENDING_APPROVAL'`. Điều này sẽ gây lỗi Type/Enum mismatch khi n8n query DB.
- **Thiếu đối tượng chẩn đoán bệnh:** Story 5.8 yêu cầu đếm cả `DiseaseReport` (báo cáo bệnh) có `status = 'PENDING'`, nhưng Node thứ 2 của workflow hoàn toàn không query bảng `disease_reports`.
- **Recipient Resolution (Xác định người nhận):** Nếu Farmer tạo nhật ký, `recorded_by` sẽ là Farmer ID. Nhưng workflow lại group theo người tạo và gọi đó là `officer_id`. Việc gán `recipient_id` cho Web Bell Notification bằng ID của người tạo (có thể là Farmer) thay vì Officer (người có quyền duyệt) là sai logic nghiệp vụ (BA yêu cầu nhắc nhở Cán bộ KT đi duyệt).

## 2. Kênh phân phối (Delivery Mechanism)
- **Yêu cầu (Story 5.8 & BA Doc):** Gửi một thông báo tổng hợp (Weekly summary) vào **Mattermost Webhook** (Channel-agnostic / n8n notification engine).
- **Thực tế đang cài đặt:** Workflow lại thực hiện lệnh `INSERT INTO notifications ...` (Web Bell / Chuông thông báo trên Web) cho từng user.
- **Hệ quả:** Sai kênh giao tiếp đã thoả thuận trong PRD/Story, mất đi tính chất "tổng hợp" (Summary) cho cả team trên Mattermost.

## 3. Quản lý trùng lặp (Duplicate Prevention)
- Issue có đề cập: "...until its actual recipient resolution, duplicate prevention...". 
- Hiện tại, luồng n8n chỉ đơn giản chạy vào mỗi chiều Thứ Sáu. Nếu dùng Web Bell (như code n8n hiện tại) thì mỗi tuần sẽ tạo ra 1 thông báo mới (rác notification). Nếu chuyển sang Mattermost, n8n cần query gom nhóm chính xác số liệu tồn đọng (những record đã tồn tại qua nhiều tuần không được tính lặp thành nhiều cảnh báo riêng lẻ mà chỉ là 1 con số tổng pending hiện tại). Logic `created_at < NOW() - INTERVAL '7 days'` đang cố gắng lấy các record cũ, nhưng chưa xử lý đủ triệt để.

## 4. Kế hoạch đề xuất (Hành động sửa lỗi)
Để giải quyết Issue #77 (đạt tiêu chí Story 0.2 và 5.8), cần phải:
1. **Sửa lại n8n Workflow (`workflows/officer-reminder.json`):**
   - **Node 1 (Postgres):** Sửa query cho `journal_entries`: đếm số lượng bản ghi `status = 'pending_approval'` (chữ thường).
   - **Node 2 (Postgres):** Bổ sung thêm query đếm số lượng `disease_reports` cần xử lý.
   - **Node 3 (Logic):** Gom nhóm số liệu thành 1 thông báo tổng (Summary).
   - **Node 4 (HTTP Request):** Thay thế Node `Create Web Bell Notification` (Insert DB) bằng `HTTP Request Node` để POST json payload sang Mattermost Webhook URL.
2. **Cập nhật Test Plan & Artifacts:**
   - Cung cấp minh chứng (Execution Evidence) cho luồng gửi tới Mattermost (hoặc webhook test) thay vì DB insert.

> [!WARNING]
> Workflow hiện tại bị lỗi truy vấn Database (cột `submitted_by_id` không tồn tại). Nếu n8n kích hoạt, luồng này sẽ đi vào **Error Trigger**.
