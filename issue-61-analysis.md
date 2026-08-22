# Phân tích Issue #61: [Epic 3][3.5] Weather Auto-Attach to Journal Entries

## 1. Yêu cầu của Issue
- **Mục tiêu:** Khi người dùng (Officer/Farmer) tạo một Nhật ký Canh tác (Journal Entry), hệ thống phải tự động đính kèm thông tin thời tiết vào nhật ký đó.
- **Quy tắc cốt lõi (Invariants):**
  - **n8n cache ownership:** Tuyệt đối không gọi API bên ngoài (như Open-Meteo) từ Next.js. Mọi truy vấn thời tiết phải đọc từ bảng `weather_cache` do n8n quản lý và cập nhật định kỳ.
  - **Historical/Backdate lookup:** Nếu nhật ký được ghi lùi ngày (backdate - ví dụ ghi cho 3 ngày trước), hệ thống phải lấy thời tiết của đúng ngày `entry_date` đó, chứ không phải thời tiết hiện tại.
  - **Cache-miss behavior:** Nếu bảng `weather_cache` không có dữ liệu của ngày đó, hệ thống không được crash mà phải lưu các trường thời tiết là `null` (silently skip).

## 2. Hiện trạng Dự án (As-Is)
- Bảng `weather_cache` đã tồn tại, được n8n ghi vào với khóa `parcel_id` và `recorded_at` (timestamp theo giờ).
- Code hiện tại trong `PrismaJournalRepository.ts` (hàm `create`) đang có logic:
  ```typescript
  const weatherCache = await prisma.weatherCache.findFirst({
    where: { parcel_id: data.parcel_id },
    orderBy: { recorded_at: 'desc' },
  })
  ```
- **Vấn đề của code hiện tại:** Nó luôn lấy thời tiết MỚI NHẤT của thửa đất (latest record), bất kể `entry_date` của nhật ký là ngày nào. Việc này vi phạm yêu cầu **Historical/Backdate lookup**.

## 3. Đề xuất Giải pháp (To-Be)
Để sửa Issue này, chúng ta cần cập nhật truy vấn Prisma trong `PrismaJournalRepository.create` như sau:
1. Lấy `entry_date` từ đầu vào (là một `Date`).
2. Tính toán `startOfDay` và `endOfDay` của `entry_date`.
3. Query `weatherCache` với điều kiện `recorded_at` nằm trong khoảng thời gian của ngày đó:
   ```typescript
   const start = startOfDay(data.entry_date)
   const end = endOfDay(data.entry_date)
   
   const weatherCache = await prisma.weatherCache.findFirst({
     where: { 
       parcel_id: data.parcel_id,
       recorded_at: {
         gte: start,
         lte: end
       }
     },
     orderBy: { recorded_at: 'desc' }, // Lấy bản ghi cuối cùng trong ngày đó
   })
   ```
4. Nếu `weatherCache` tồn tại -> gán data. Nếu không -> gán `null`.
5. Đảm bảo logic xử lý an toàn (Cache-miss behavior).

## 4. Các bước Triển khai
1. Cập nhật file `PrismaJournalRepository.ts` (Sửa lại query `findFirst` của `weatherCache` theo `entry_date`).
2. Viết / Cập nhật Test case trong `JournalUseCase.test.ts` hoặc tạo test riêng để chứng minh:
   - Ghi nhật ký ngày hôm nay -> lấy thời tiết hôm nay.
   - Ghi nhật ký backdate (ví dụ 1/1/2026) -> Lấy thời tiết ngày 1/1/2026 (nếu có cache).
   - Ghi nhật ký ngày không có cache -> Fallback về `null` thành công, không crash.
