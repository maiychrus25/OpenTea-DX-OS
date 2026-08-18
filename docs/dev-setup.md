# Hướng dẫn Cài đặt Môi trường Phát triển (Local Dev Setup)

Dự án DX-AgriMarket sử dụng kiến trúc Monorepo và Docker Compose để đồng bộ môi trường phát triển cho tất cả các thành viên.

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
Lệnh này sẽ khởi chạy 8 services: `web`, `postgres`, `keycloak`, `n8n`, `ollama`, `piper`, `minio`, `disease-api`.

## Bước 3: Cài đặt Thủ công (Manual Setup)

### Cài đặt Ollama Model
Ollama container khởi chạy trống. Bạn cần tự pull các models theo cấu hình trong `.env`:
```bash
docker exec -it agrimarket-ollama ollama pull phi3:mini
```
*Lưu ý: Tên model phải khớp với biến `OLLAMA_MODEL` trong `.env.local`.*

### Khởi tạo MinIO Bucket
MinIO cần được khởi tạo bucket lưu trữ tài liệu:
```bash
docker exec -it agrimarket-minio mc alias set local http://localhost:9000 minio minio123
docker exec -it agrimarket-minio mc mb local/agrimarket-docs
```

### Import n8n Workflows
Để cài đặt các workflow cho n8n, chạy các lệnh sau để copy file JSON vào container và import:
```bash
docker cp workflows/weekly-officer-reminder.json agrimarket-n8n:/tmp/
docker cp workflows/mattermost-push.json agrimarket-n8n:/tmp/
docker exec -it agrimarket-n8n n8n import:workflow --input=/tmp/weekly-officer-reminder.json
docker exec -it agrimarket-n8n n8n import:workflow --input=/tmp/mattermost-push.json
```

## Bước 4: Kiểm tra Sức khỏe Hệ thống (Smoke Test)

Chạy script kiểm thử tự động để đảm bảo môi trường đã sẵn sàng:
```bash
bash scripts/smoke-test.sh
```
Script sẽ kiểm tra biến môi trường, cấu trúc thư mục, và ping tới các health endpoint của các services.
