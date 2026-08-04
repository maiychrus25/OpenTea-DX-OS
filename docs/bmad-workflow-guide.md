# 🚀 Hướng Dẫn Quy Trình Làm Việc Với BMAD (BMAD Workflow Guide)

Tài liệu này hướng dẫn chi tiết từng bước (step-by-step) cách vận hành luồng phát triển phần mềm bằng phương pháp **BMAD (Build, Measure, Adapt, Deploy)** kết hợp với hệ thống AI Agents. Đọc kỹ tài liệu này để đảm bảo toàn bộ team (bao gồm cả Human và AI Agents) phối hợp nhịp nhàng, tránh conflict.

---

## 1. Tổng Quan BMAD Loop

BMAD chia dự án thành các lớp (Layers) rõ ràng:
1. **Lớp Kiến trúc & Phân tích (Architecture & PRD):** Do `bmad-agent-architect` (Winston) và `bmad-agent-pm` (John) đảm nhiệm.
2. **Lớp Kịch bản (Epics & Stories):** Chia nhỏ các tính năng thành các task nguyên tử (atomic), lưu tại `_bmad-output/implementation-artifacts/`.
3. **Lớp Kiểm thử (Test Plans):** Thiết kế bởi `bmad-tea` (Murat), lưu tại `_bmad-output/test-artifacts/`.
4. **Lớp Thực thi (Dev Loop):** Do `bmad-agent-dev` (Amelia) và Developer (Human) thực hiện.
5. **Lớp Theo dõi:** Mọi trạng thái được quản lý tập trung tại `sprint-status.yaml`.

---

## 2. Hướng Dẫn Thực Thi Một Issue Bằng BMAD Loop

Quy trình chuẩn để chuyển một task từ trạng thái **`ready-for-dev`** sang **`done`**.

### Bước 1: Khởi động Dev Loop
Khi bạn sẵn sàng làm một task, KHÔNG code chay. Hãy gọi lệnh:
```bash
/bmad-dev-story
```
Hoặc nếu muốn hệ thống tự làm tuần tự không cần hỏi:
```bash
/bmad-dev-auto
```

### Bước 2: Agent (Amelia) sẽ tự động làm gì?
1. Đọc file `sprint-status.yaml`, tìm story đầu tiên có trạng thái `ready-for-dev`.
2. Đọc file Story (ví dụ `1-1-project-setup-nextjs-prisma.md`) để hiểu yêu cầu và dependencies.
3. Đọc file Test Plan (ví dụ `test-plan-1-1...md`) để hiểu các điều kiện Pass.
4. **Thay đổi trạng thái:** Tự động sửa `sprint-status.yaml` thành `in-progress`.
5. Bắt đầu viết Code và viết Tests.

### Bước 3: Kiểm duyệt (Review & TDD)
- Agent sẽ tự động chạy các test cases (Jest / Playwright) theo chuẩn Test Driven Development.
- Nếu Pass: Agent commit code (theo Conventional Commits) và đổi status thành `review` hoặc `done`.
- Nếu Fail: Agent tự động debug (Fix Bug Loop) cho đến khi Pass.

### Bước 4: Chuyển sang Task tiếp theo
Sau khi Agent thông báo hoàn thành (Done), bạn tiếp tục gọi `/bmad-dev-story` để làm task tiếp theo.

---

## 3. Quy Trình Xử Lý Lỗi (Fix Bug Workflow)

Khi gặp lỗi (Bug), tuyệt đối không sửa lắt nhắt không có cấu trúc. Hãy làm theo quy trình:

1. **Bug Sinh ra từ Test Plan (Dev Loop):**
   - Agent tự động xử lý. Nếu Agent bế tắc, hãy dùng lệnh `/bmad-help` hoặc gọi chuyên gia test: `/bmad-tea` để yêu cầu phân tích lại Test Plan xem có sai sót không.

2. **Bug do Developer phát hiện (Sau khi đã Done):**
   - Không được âm thầm tự sửa.
   - Gọi lệnh `/bmad-create-story` để yêu cầu tạo một story nhỏ dạng `fix/tên-lỗi` (Ví dụ: `fix-leaflet-ssr-hydration`).
   - Yêu cầu `/bmad-tea` viết test case cho Bug này (Tái hiện lỗi).
   - Gọi `/bmad-dev-story` để Agent sửa nó.

3. **Gặp lỗi cấu hình môi trường hoặc Dev/Ops:**
   - Sử dụng lệnh `/bmad-quick-dev` (đây là chế độ fix nóng, không qua story board) với prompt: *"Hãy fix lỗi Prisma không connect được DB ở môi trường Docker này."*

---

## 4. Làm Việc Song Song (Parallel Development)

Để nhiều người (hoặc nhiều luồng Agents) làm việc song song mà không bị conflict, hãy tuân thủ nguyên tắc **"Dependency Tracking"**:

### Rule 1: Không dẫm chân lên Dependency
Trong file Story, mục `## Dependencies` định nghĩa rất rõ. 
- **Ví dụ:** Story 4.2 (Tạo Lô Hàng) ghi rõ `Depends on: 3.2 (Thửa Đất), 4.1 (Safety API)`.
- **Hành động:** Bạn TUYỆT ĐỐI KHÔNG làm Story 4.2 nếu 3.2 và 4.1 chưa ở trạng thái `done`.

### Rule 2: Phân chia theo Epic (hoặc Sub-domain)
- **Developer A (hoặc Agent 1):** Gọi `/bmad-dev-story` và assign cụ thể một Story không bị block. (Ví dụ: *"Hãy implement story 5.6"* vì 5.6 không phụ thuộc ai).
- **Developer B (hoặc Agent 2):** Xử lý Story 4.6 (Python FastAPI) hoàn toàn độc lập với Next.js.
- **Cách lock trạng thái:** Ngay khi một người nhận task, người đó (hoặc Agent) PHẢI đổi trạng thái trong `sprint-status.yaml` thành `in-progress`. Người thứ 2 nhìn thấy `in-progress` sẽ bỏ qua task đó.

### Rule 3: Merge Code thường xuyên
- Sử dụng chiến lược *Squash & Merge* PRs liên tục.
- Không giữ code ở branch cá nhân quá 1 ngày. Hoàn thành 1 Atomic Story (rất nhỏ) -> Commit -> Merge ngay lập tức.

---

## 5. Các Lệnh BMAD Thường Dùng Nhất

- `/bmad-dev-story`: Code story tiếp theo trong backlog. (Dùng nhiều nhất)
- `/bmad-quick-dev`: Fix lỗi nhanh, làm tính năng nhỏ mà không cần lập Story rườm rà.
- `/bmad-party-mode`: Gọi tất cả Agents (Dev, PM, Architect, QA) vào họp để giải quyết một kiến trúc phức tạp hoặc brainstorm.
- `/bmad-tea`: Gọi Master QA Murat để viết Test Plan hoặc review lại chất lượng test.
- `/bmad-retrospective`: Chạy sau khi hoàn thành một Epic để rút kinh nghiệm.

---

## Tổng kết

Tôn chỉ của BMAD là **"Chậm lại để Nhanh hơn"**. 
Chúng ta dành 80% thời gian để viết PRD, Architecture, Stories và Test Plans rất chi tiết. Khi 20% thời gian cuối cùng dành cho việc Code (`/bmad-dev-story`), tốc độ sẽ diễn ra cực nhanh, chính xác và không có bug architecture.
