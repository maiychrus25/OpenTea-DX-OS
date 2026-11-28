# Hướng dẫn Cài đặt Môi trường Phát triển (Local Dev Setup)

Dự án **OpenTea DX-OS** sử dụng kiến trúc Monorepo và Docker Compose để đồng bộ môi trường phát triển cho tất cả các thành viên (xem thêm mục lục tài liệu tại [docs/README.md](./README.md) và hướng dẫn chạy stack nhẹ tại [README.md](../README.md)).

## Yêu cầu Hệ thống
- Docker & Docker Compose
- Node.js (phiên bản 20 trở lên)
- Python (phiên bản 3.11 trở lên)

## Bước 1: Khởi tạo Cấu hình

Sao chép file biến môi trường mẫu và điền các giá trị thích hợp nếu cần:
```bash
cp .env.example .env.local
cp docker/.env.local.example docker/.env.local
```

## Bước 2: Khởi chạy các Service với Docker Compose

Tại thư mục gốc của dự án, chạy lệnh:
```bash
docker compose -f docker/docker-compose.yml up -d
```
Lệnh này sẽ khởi chạy 8 services: `web`, `postgres`, `keycloak`, `n8n`, `ollama`, `piper`, `seaweedfs` (S3 tương thích, cổng 9000), `disease-api`.

Mini-app chỉ có route trên gateway khi khởi chạy bằng `make platform-up` hoặc `make up`; lệnh `docker compose` ở trên chạy lõi mà không có route app nào.

## Bước 3: Cài đặt Thủ công (Manual Setup)

### Cài đặt Ollama Model
Ollama container khởi chạy trống. Bạn cần tự pull các models theo cấu hình trong `.env`:
```bash
docker exec -it agrimarket-ollama ollama pull phi3:mini
```
*Lưu ý: Tên model phải khớp với biến `OLLAMA_MODEL` trong `.env.local`.*

### Lưu trữ S3 (SeaweedFS)
SeaweedFS cung cấp S3 tại `http://localhost:9000` (không có console web). Bucket `agrimarket-docs` được ứng dụng web tự tạo ở lần dùng đầu tiên, không cần khởi tạo thủ công; khoá truy cập lấy từ `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` trong `docker/.env.local`.

### Import n8n Workflows
Để cài đặt các workflow cho n8n, chạy các lệnh sau để copy file JSON vào container và import:
```bash
docker cp workflows/officer-reminder.json agrimarket-n8n:/tmp/
docker cp workflows/mattermost-push.json agrimarket-n8n:/tmp/
docker exec -it agrimarket-n8n n8n import:workflow --input=/tmp/officer-reminder.json
docker exec -it agrimarket-n8n n8n import:workflow --input=/tmp/mattermost-push.json
# Every workflow sends its failures to this one (settings.errorWorkflow), which records them in platform.system_alerts.
docker cp workflows/system-error-alert.json agrimarket-n8n:/tmp/
docker exec -it agrimarket-n8n n8n import:workflow --input=/tmp/system-error-alert.json
```

### Công tắc `DXOS_LABS`

`DXOS_LABS` (trong `.env`, mẫu ở `.env.example`) mặc định trống, tức tắt. Đặt `1` hoặc `true` để mở các tính năng đóng băng theo ADR 0005: xưởng mini-app, tự vận hành, agent chiến lược, MCP và đồng bộ nhân sự. Compose truyền biến cho `web` và `dxos-agent`; web đọc giá trị lúc gọi nên không cần dựng lại ảnh, chỉ cần tạo lại container `web` và `dxos-agent` sau khi đổi `.env`. Khi tắt, các route đó trả 404 và agent không lên lịch job tương ứng. Workflow đã xoá ở GĐ0 (`vietnam_market_sync`, `worldbank_sync`, `faostat_sync`, `nasa_power_sync`, `wto_tariffs`) không còn trong danh sách import.

### Việc còn lại đã biết

Ảnh cửa hàng của `custom-books` (`miniapps/custom-books/store/*.png`) vẫn chụp một mẫu sổ đã gỡ ở GĐ0. Cần chụp lại bằng `apps/web/tests/tools/store-screenshots.spec.ts` khi có stack đang chạy.

### Tài khoản quản trị nền tảng và TOTP (Keycloak)

Vai `platform_admin` không thuộc HTX nào và không có thuộc tính `htx_code`. Môi trường thật tạo tài khoản bằng `kcadm` (thay `<mật khẩu>`; lệnh chạy trong container Keycloak, sau khi đăng nhập `kcadm.sh config credentials`):

```bash
kcadm.sh create users -r agrimarket -s username=quantri -s enabled=true
kcadm.sh set-password -r agrimarket --username quantri --new-password '<mật khẩu>'
kcadm.sh add-roles -r agrimarket --uusername quantri --rolename platform_admin
```

TOTP là tuỳ chọn: tài khoản mới không bị ép cấu hình. Người dùng đang chạy thật còn treo yêu cầu `CONFIGURE_TOTP` thì không tự bị sửa; khi chủ dự án muốn gỡ:

```bash
kcadm.sh update users/<user-id> -r agrimarket -s 'requiredActions=[]'
```

## Bước 4: Kiểm tra Sức khỏe Hệ thống (Smoke Test)

Chạy script kiểm thử tự động để đảm bảo môi trường đã sẵn sàng:
```bash
bash scripts/smoke-test.sh
```
Script sẽ kiểm tra biến môi trường, cấu trúc thư mục, và ping tới các health endpoint của các services.

## Demo sân khấu 10 phút

Bộ dữ liệu kín cho buổi trình diễn, chỉ của HTX Tân Cương (TC). Chạy sau khi stack lên (`make platform-up`) và đã có dữ liệu nền `npm run seed` (trong `apps/web`).

```bash
make demo-seed                 # dữ liệu demo: giá lá hôm nay, phiếu cân 10 ngày, mẻ sao, lô có đủ bốn lớp, chứng nhận, một kỳ quyết toán
./dxos demo accounts           # đưa năm tài khoản demo về dạng dùng được (xem dưới)
./dxos agent enable TC         # một lần, nếu chưa bật lớp AI
```

`make demo-seed` chạy trong ảnh `migrate` (không cần Node trên máy; cần mạng cho `npm ci`) và có thể chạy lại: mọi dòng có khoá tự nhiên cố định nên lần sau không thêm gì, kỳ quyết toán đã có thì để nguyên (sổ cái chỉ ghi thêm). Ngày tính tương đối theo lần chạy đầu. Không chạy lại `npm run seed` sau `demo-seed` trên cùng cơ sở dữ liệu: `seed` xoá và dựng lại lô A3 nên sẽ vướng mẻ sao và chứng nhận đã nối; muốn dựng lại từ đầu thì làm lại cơ sở dữ liệu.

### Tài khoản demo

`./dxos demo accounts [--reset-otp] [--password <mật khẩu>] [tên...]` chỉ tác động lên `platform_admin`, `manager_tc`, `accountant_tc`, `officer_tc`, `farmer_tc` (tên khác bị từ chối). Với từng tài khoản lệnh tạo nếu thiếu, đảm bảo vai realm và `htx_code` (người dùng TC), xoá `requiredActions` đang treo (ví dụ `CONFIGURE_TOTP`) và in từng thay đổi. Mật khẩu chỉ đổi khi có `--password`; thiết bị OTP chỉ bị gỡ khi có `--reset-otp`. Lệnh không tự chạy; anh chạy khi cần. Mật khẩu mặc định của realm là `Test1234!`.

### Kịch bản theo vai

- **Quản lý (`manager_tc`)**: Tổng quan, mục giá lá (`/manager/leaf-prices`) thấy giá hôm nay của ba hạng; Mẻ sao (`/manager/processing`) mở mẻ đã xong, tỉ lệ 4,75 trong dải 4,5 đến 5,0; Lô (`/manager/lots`) mở `TC-CHE-A3-001`; Chứng nhận (`/manager/certificates`) thấy VietGAP mẫu còn hạn; Quyết toán (`/manager/settlements`) mở kỳ đã chốt, xem phiếu của hộ Hoàng Văn Tâm có mã VietQR và khoản ứng phân NPK đã trừ.
- **Kế toán (`accountant_tc`)**: Cân lá (`/accountant/weighing`) cân thử một phiếu mới trên TC-A1, rồi cân trên TC-A3 để thấy khối đỏ vì đang trong thời gian cách ly (phun 3 ngày trước, cách ly 7 ngày); Vật tư (`/accountant/inputs`) thấy hai khoản ứng; Quyết toán (`/accountant/settlements`) mở lại kỳ đã chốt; tạo kỳ mới cho các phiếu sau ngày chốt.
- **Cán bộ (`officer_tc`)**: Nhật ký chờ duyệt (`/officer/journal`); Mẻ sao (`/officer/processing`); Lô (`/officer/lots`), mở `TC-CHE-A3-001`; mở trang công khai `/q/TC-CHE-A3-001` (không cần đăng nhập) để thấy bốn lớp: vùng trồng, an toàn cách ly, mẻ sao, chứng nhận (bấm xem tệp PDF mẫu).
- **Nông dân (`farmer_tc`, hộ Hoàng Văn Tâm)**: Phiếu cân (`/farmer/leaf-tickets`), Sổ tài khoản (`/farmer/ledger`) có số dư sau quyết toán; phiếu quyết toán có mã VietQR (số tài khoản demo, tên có chữ DEMO).
- **Quản trị nền tảng (`platform_admin`)**: `/platform` để xem các HTX và lớp AI.
- **Cảnh báo A13 (lớp AI kiểm tra chéo)**: dữ liệu demo có sẵn hai tình huống, hộ Đỗ Thị Hạnh nhận thuốc BVTV 15 ngày trước mà không có nhật ký phun (R1), và thửa TC-B2 (0,27 ha, định mức 656 kg một lứa) đã cân hơn 700 kg (R2). Chạy ngay thay vì chờ 05:45 mỗi ngày:

  ```bash
  docker compose -f docker/docker-compose.yml exec dxos-agent python -m dxos_agent --once cross-check --htx TC
  ```

  Lệnh dùng đúng hàm mà lịch hằng ngày gọi (cùng ngưỡng cài đặt của HTX), không kiểm tra lịch. Mỗi khoản ứng và mỗi bậc vượt định mức chỉ được báo một lần, nên chạy lại không tạo thêm đề xuất. Xem đề xuất ở `/manager/ai` hoặc `/officer/ai`.
