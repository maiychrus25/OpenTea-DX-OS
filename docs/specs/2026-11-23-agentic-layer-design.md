<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Lớp AI vận hành có người duyệt

> **Trạng thái:** Bản định hướng (2026-11-23), chưa triển khai, chưa giao người làm.
> **Yêu cầu của chủ dự án (2026-11-23):** thêm một lớp AI vận hành trên hệ thống, luôn còn người phê duyệt. Làm đầy đủ, không cắt phạm vi theo hạn nộp bài. Được gọi provider bên ngoài như Claude và Codex. Báo cáo, hỏi đáp và phê duyệt được qua Telegram, để không phụ thuộc hoàn toàn vào website.
> **Người đọc:** người sẽ xây lớp này (thành viên nhóm hoặc một phiên AI lập trình). Tài liệu nói cần gì, vì sao, và chốt các quyết định kiến trúc. Chi tiết cài đặt do người làm quyết, trong khuôn khổ ở đây. Mỗi lần gộp vào `main` vẫn hỏi chủ dự án.

## 1. Mục tiêu

AI theo dõi dữ liệu của hợp tác xã, phát hiện việc cần làm và soạn sẵn hành động. Người có thẩm quyền duyệt trên web hoặc Telegram. Hệ thống thực thi bằng các chức năng đã có và ghi vào sổ audit.

Lớp này coi là xong khi:

1. Mỗi ngày ban quản trị nhận một bản tóm tắt hợp tác xã qua Telegram mà không cần mở web.
2. Mọi hành động AI đề xuất đều có lý do và bằng chứng có nguồn, và chỉ chạy sau khi một người đủ quyền bấm duyệt.
3. Tắt hết provider bên ngoài thì hệ thống vẫn chạy đủ bằng Ollama nội bộ, chỉ chậm hơn hoặc kém hơn.
4. Không có đường nào để AI tự ghi vào dữ liệu nghiệp vụ.
5. Mỗi đề xuất, quyết định và lần thực thi đều tra được trong `audit.events`.

## 2. Quyết định của chủ dự án (không đổi nếu chưa hỏi lại)

| # | Quyết định |
|---|---|
| D1 | Luôn có người duyệt. Không có chế độ tự duyệt, kể cả với hành động rủi ro thấp. |
| D2 | Làm đầy đủ các phần trong tài liệu này, theo thứ tự các mốc ở §14. |
| D3 | Được gọi provider bên ngoài: Anthropic (Claude) và OpenAI (Codex và các model GPT). Ollama nội bộ vẫn là mặc định. |
| D4 | Telegram là kênh thứ hai, ngang hàng với web: nhận báo cáo, hỏi đáp, phê duyệt. |
| D5 | Nhóm viết tài liệu, người khác xây. |

Cách hiểu cần xác nhận: "Codex" ở D3 được hiểu là API của OpenAI. Nếu chủ dự án muốn chạy chính công cụ Codex CLI hoặc Claude Code như một tác tử làm việc trên hệ thống thì đó là phạm vi khác, ghi ở §16.

## 3. Hệ quả với quy tắc hiện hành

Hai bất biến trong `docs/rules-and-limits.md` mâu thuẫn trực tiếp với D1 và D3. Sửa hai bất biến này là việc đầu tiên của mốc M0, cùng với ADR (§15).

| Bất biến hiện tại | Sửa thành |
|---|---|
| §1.1 "AI KHÔNG ra quyết định thay người dùng. AI KHÔNG khuyến nghị hành động cụ thể." | AI được đề xuất hành động nằm trong danh mục (§6). AI không bao giờ tự thực thi. Mọi đề xuất kèm lý do và nguồn. Người duyệt chịu trách nhiệm quyết định. Quy tắc "chỉ tổng hợp sự thật có trích dẫn" giữ nguyên cho chatbot, bản tin và phần hỏi đáp. `/predict` vẫn không trả cách chữa. |
| §1.2 "KHÔNG sử dụng API keys trả phí ở bất kỳ đâu." | Không có phụ thuộc bắt buộc nào vào dịch vụ trả phí. Provider trả phí là tuỳ chọn, mặc định tắt, bật theo từng hợp tác xã. Dựng và chạy thử từ mã nguồn không cần khoá nào. |

Chatbot hiện đã tự chuyển sang Groq khi có `GROQ_API_KEY`, tức là đã lệch §1.2 từ trước tài liệu này. Khi lớp provider ở §8 xong, chatbot chuyển sang dùng chung lớp provider và chính sách dữ liệu ở §8.3.

## 4. Hiện có gì (dùng lại, không viết lại)

| Thành phần | Ở đâu | Dùng cho |
|---|---|---|
| Sổ audit có chuỗi băm | `platform/postgres/init/02-audit.sql`, `03-audit-triggers.sql` | ghi đề xuất, quyết định, thực thi |
| Hasura chỉ đọc, lọc theo `htx_code` | `platform/hasura/metadata` | agent đọc dữ liệu |
| Keycloak realm `agrimarket`, vai trò `manager`, `officer`, `farmer` | `docker/keycloak/realm-agrimarket.json` | danh tính người duyệt, tài khoản dịch vụ |
| Gateway APISIX với tuyến LLM duy nhất `/api/ai/llm/v1/chat/completions` tới Ollama | `platform/gateway/apisix.yaml` | provider nội bộ |
| Thông báo trong web và đẩy sang Mattermost | model `Notification`, `/api/notifications/announce`, `workflows/mattermost-push.json` | kênh web |
| Duyệt nhật ký, duyệt thu hoạch, duyệt bệnh | `/api/journal/batch-approve`, `/api/parcels/[id]/approve-harvest`, `/api/officer/diseases/[id]/review` | hành động trong danh mục |
| Bản tin AI lúc 04:00 | `workflows/bulletin-synthesis.json`, bảng `bulletins` | agent bản tin (§9) |
| Bảng điều hành HTX | `miniapps/htx-dashboard` | chỉ số cho báo cáo; tab chỉ số của lớp AI (§12) |
| Khuôn dịch vụ Python của lõi | `platform/dataops`, `platform/scanner` (gói `dxos_*`, Dockerfile, requirements, tests) | khuôn cho hai dịch vụ mới |
| Gói `openai` trong web | `apps/web/package.json` | chatbot hiện tại |

Mô hình nội bộ đang cài chỉ có `qwen2.5:0.5b`. Bản này đủ cho chatbot đơn giản nhưng không đủ để chọn hành động (§8.4).

## 5. Kiến trúc

### 5.1 Ba vùng tin cậy

```
              đọc (Hasura, vai agent)                   đề xuất, báo cáo (API nội bộ)
Dữ liệu lõi ─────────────────────▶  dxos-agent  ──────────────────────────────▶  web (thẩm quyền)
                                    (gọi LLM)                                     danh mục, đề xuất, duyệt,
                                                                                  thực thi, audit, hộp duyệt
Telegram ◀──── long polling ─────  dxos-telegram  ◀──── hộp thư đi ────────────────  │
         ───── bấm duyệt, hỏi ───▶  (kênh chat)   ───── quyết định, câu hỏi ───────▶  │
```

- **Web (`apps/web`) là nơi có thẩm quyền duy nhất.** Web giữ danh mục hành động, lưu đề xuất, nhận quyết định, thực thi, ghi audit, và có giao diện hộp duyệt cùng phần cài đặt.
- **`dxos-agent` (`platform/agent`, mới)** chạy các agent theo lịch và theo sự kiện, đọc dữ liệu, gọi LLM, rồi gửi đề xuất và báo cáo cho web. Dịch vụ này không có quyền ghi dữ liệu nghiệp vụ và không có quyền duyệt.
- **`dxos-telegram` (`platform/telegram`, mới)** nói chuyện với Telegram: gửi tin từ hộp thư đi của web, chuyển nút bấm và câu hỏi của người dùng về web. Dịch vụ này không gọi LLM.

Lý do tách ba vùng: phần gọi LLM là phần dễ bị dụ, vì nó đọc chữ do người dùng nhập (ghi chú nhật ký, mô tả bệnh). Nếu bị dụ, tệ nhất nó chỉ sinh ra đề xuất rác. Nó không thể tự duyệt, vì web chỉ nhận quyết định từ phiên đăng nhập web của người thật hoặc từ `dxos-telegram`.

### 5.2 Danh tính và quyền

| Danh tính | Loại | Quyền |
|---|---|---|
| `dxos-agent-<htx>`, mỗi hợp tác xã một client | Keycloak client credentials, claim `htx_code` cố định, vai trò `agent` | đọc Hasura bằng vai `agent`; gọi `/api/internal/agent/*` |
| `dxos-telegram` | Keycloak client credentials | gọi `/api/internal/telegram/*` |
| Người duyệt | tài khoản Keycloak sẵn có | duyệt đúng loại hành động mà vai trò của mình được phép (§6) |

- Hasura có thêm vai `agent`: chỉ được `select`, cùng bộ lọc `htx_code` như `manager`, và **không thấy cột cá nhân**: `households.name`, `households.phone`, `households.address`, cùng các cột tương tự ở bảng khác. Agent nhắc tới nông hộ bằng mã (`id`). Khi hiện cho người duyệt, web thay mã bằng tên.
- Mỗi hợp tác xã một client, để token của agent không đọc được dữ liệu của hợp tác xã khác (Hasura lấy `htx_code` từ token). Client được tạo khi hợp tác xã bật lớp AI (§13).
- `/api/internal/*` chỉ mở trong mạng Docker, không đi qua gateway công khai. Web kiểm token và kiểm đúng client: client agent không gọi được API của Telegram và ngược lại.

### 5.3 Vì sao không chạy agent trong n8n hay trong web

- **n8n:** giấy phép fair-code (ADR 0001 đã ghi lối thoát), khó kiểm thử đơn vị, và khó giữ ranh giới quyền ở §5.1.
- **Web:** một lượt agent có thể kéo dài vài phút vì chờ LLM, không hợp với route handler. Web lại là vùng có thẩm quyền, không nên chứa phần dễ bị dụ.
