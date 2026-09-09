<div align="center">

  <h1>🌾 OPEN DX-AGRIMARKET</h1>

  <p><strong>Nền tảng Chuyển đổi Số và Vận hành Đa năng cho Hợp tác xã Nông nghiệp</strong></p>

  <p><em>"Kết nối Nông hộ - Tối ưu Sản xuất - Minh bạch Thị trường"</em></p>

  <br>

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge&logo=github)](./CONTRIBUTING.md)
  [![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](./docker/docker-compose.yml)
  [![Next.js](https://img.shields.io/badge/Frontend-Next.js_14-000000?style=for-the-badge&logo=next.js&logoColor=white)](./apps/web)
  [![FastAPI](https://img.shields.io/badge/AI_Core-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](./apps/disease-api)
  [![Keycloak](https://img.shields.io/badge/Auth-Keycloak-4D4D4D?style=for-the-badge&logo=keycloak&logoColor=white)](https://www.keycloak.org)
  [![n8n](https://img.shields.io/badge/Workflow-n8n-FF6D5A?style=for-the-badge&logo=n8n&logoColor=white)](./workflows)

  <br>

</div>

---

<div align="center">
  <p><em>Sơ đồ Kiến trúc & Luồng Dữ liệu — Hexagonal Architecture & Feature-based Design</em></p>
</div>

## 🌟 Tầm nhìn & Sứ mệnh

**OPEN DX-AGRIMARKET** là một Hệ điều hành Nông nghiệp Số toàn diện (Agricultural Digital Operating System) dành riêng cho các Hợp tác xã (HTX) tại Việt Nam. Hệ thống đập bỏ rào cản thông tin giữa Ban quản trị HTX, Cán bộ Kỹ thuật và Nông dân, đồng thời nhúng Trí tuệ Nhân tạo (AI) vào mọi khâu của quá trình sản xuất.

Dự án được xây dựng hoàn toàn mã nguồn mở (100% Open Source), kết hợp kiến trúc **Hexagonal Architecture** mạnh mẽ ở Backend và thiết kế **Feature-based** linh hoạt ở Frontend.

### Tính năng cốt lõi:
- 🗺️ **Bản đồ Vùng trồng (Farm Zone Map):** Số hóa thửa đất nông hộ bằng công nghệ GIS (Leaflet.js).
- 📝 **Nhật ký Đồng ruộng Thông minh (Journal):** Theo dõi quy trình canh tác, phê duyệt nghiêm ngặt và tự động tính toán thời gian cách ly (Withdrawal Days).
- 🏷️ **Truy xuất Nguồn gốc (QR Lot):** Minh bạch toàn bộ vòng đời sản phẩm từ gieo trồng đến thu hoạch.
- 🤖 **Trợ lý AI & Nhận diện Bệnh hại (Disease AI):** Chuẩn đoán bệnh cây trồng bằng Computer Vision (FastAPI) và Chatbot thị trường bằng LLM (Groq Llama-3.1).
- 📰 **Bản tin Âm thanh (Audio Bulletin):** Tổng hợp tin tức nông sản tự động bằng n8n và phát qua Piper TTS.

## 🔬 Đột phá Công nghệ & Kiến trúc

Hệ thống được thiết kế theo tiêu chuẩn công nghiệp với các ràng buộc kỹ thuật khắt khe (Invariants):

1. **Hexagonal Architecture (Ports & Adapters):** Đảm bảo Domain Logic hoàn toàn độc lập với Framework (Next.js/Prisma). API Route chỉ làm nhiệm vụ giao tiếp HTTP (Inbound Adapter).
2. **AI Invariant (Zero-Hallucination Guard):** Trợ lý AI bị ràng buộc tuyệt đối: *Chỉ trình bày sự thật có trích dẫn nguồn, KHÔNG tự ra quyết định thay HTX, KHÔNG đưa ra khuyến nghị cảm tính.*
3. **Automated Data Pipelines (n8n):** Tự động hóa hoàn toàn việc cào dữ liệu thời tiết (Open-Meteo), giá nông sản và tin tức thị trường mà không làm nặng tải Next.js Core.

## 📚 Hệ thống Tài liệu (Documentation)

Toàn bộ tài liệu đặc tả, thiết kế kiến trúc và quy tắc kinh doanh (Business Rules) được lưu trữ công khai. Vui lòng đọc kỹ trước khi đóng góp:

- 📖 **[Project Context & Core Rules](./docs/project-context.md)** — Công nghệ, Thuật ngữ (Domain Glossary) và 10 Luật sống còn.
- 🏛️ **[Rules and Limits](./docs/rules-and-limits.md)** — Các ràng buộc Nghiệp vụ (Business Rules) và Tiêu chuẩn Code (Quality Rules).
- 🎨 **[Design System](./docs/DESIGN.md)** — Tokens màu sắc, typography và UI Patterns.
- 🗄️ **[Database Schema](./docs/database-schema.md)** — Cấu trúc dữ liệu PostgreSQL.
- 🤖 **[AI Agents Scope](./.agents/AGENTS.md)** — Bộ luật dành riêng cho các AI Agents đóng góp vào dự án.

## 🚀 Bắt đầu Nhanh (Quick Start)

Dự án hỗ trợ chạy toàn bộ môi trường (Full-stack + Infra) qua Docker Compose.

**Yêu cầu:** Docker & Docker Compose.

1. **Clone dự án & Cấu hình biến môi trường:**
   ```bash
   git clone https://github.com/maiychrus25/OpenTea-DX-OS.git
   cd OpenTea-DX-OS
   cp .env.example .env
   ```
   *(Cấu hình `GROQ_API_KEY` trong file `.env` nếu bạn muốn dùng LLM)*

2. **Khởi chạy hệ thống:**
   ```bash
   cd docker
   docker-compose up -d
   ```

3. **Truy cập các dịch vụ:**
   - 🌐 Web App: `http://localhost:3000`
   - 🔐 Keycloak Admin: `http://localhost:8080`
   - ⚙️ n8n Automation: `http://localhost:5678`
   - 🗄️ MinIO Console: `http://localhost:9001`

*(Tham khảo `docs/project-context.md` để lấy tài khoản đăng nhập mặc định)*

## 📂 Cấu trúc Thư mục

```bash
OpenTea-DX-OS/
├── apps/
│   ├── web/               # Next.js 14 Core Engine (Frontend + Backend)
│   └── disease-api/       # FastAPI Computer Vision Service
├── docs/                  # Hệ thống tài liệu kiến trúc & nghiệp vụ
├── docker/                # Cấu hình hạ tầng (Docker Compose)
├── workflows/             # File export cấu hình n8n Pipelines
└── prisma/                # Database Schema & Migrations
```

---
<div align="center">
  <p>Được phát triển với 💚 bởi đội ngũ OPEN DX-AGRIMARKET.</p>
</div>
