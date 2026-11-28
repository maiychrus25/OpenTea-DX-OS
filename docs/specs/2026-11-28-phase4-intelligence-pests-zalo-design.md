<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — GĐ4: AI trên dữ liệu thật, Nhận diện 5 sâu bệnh chè, Cổng Zalo OA/ZNS

> **Trạng thái:** Đã duyệt (2026-11-28). Chủ dự án chốt cả mười mục §7 (xem §8). GĐ4-A và GĐ4-C làm song song, phát hành chung v1.22.0; GĐ4-B làm sau, phát hành v1.23.0. Nhánh `feat/phase4-intelligence-zalo`, tách từ `main` sau GĐ3 (`70248ddc`).
> **Căn cứ:**
> - [product-roadmap.md](../product-roadmap.md): §3 `[I]` và `[H]`, §5 GĐ4 mục 1–3, rào chắn Poka-yoke 5 (an toàn và tiền luôn có người duyệt);
> - DEV-015 trong [deviation-register.md](../deviation-register.md);
> - [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md): `platform_admin` cấu hình AI và Zalo dùng chung;
> - yêu cầu ba phần của chủ dự án ngày 2026-11-28.

## 1. Mục đích

GĐ1–GĐ3 đã có dữ liệu vận hành thật: phiếu cân, vật tư ứng, nhật ký phun có mã thuốc, mẻ sao, lô, quyết toán. GĐ4 dùng chính dữ liệu đó:
- **A.** AI đối soát chéo và dự báo, chỉ để gợi ý cho người duyệt. Chatbot kỹ thuật đọc được PDF trong kho P.A.R.A, nạp bộ cẩm nang chè của PR #99. Nông dân nghe được hướng dẫn bằng giọng đọc.
- **B.** Mô hình nhận diện cho 5 dịch hại chủ lực của chè Việt Nam, xây từ ảnh thực địa đã được cán bộ xác nhận.
- **C.** Kênh Zalo OA/ZNS dùng chung cấp nền tảng, gửi tự động 4 loại tin cho xã viên, kèm stub để kiểm thử 100% không cần khoá OA thương mại.

## 2. Hiện trạng (khảo sát 2026-11-28, `origin/main`)

- **Agent:**
  - `platform/agent` đọc dữ liệu qua Hasura bằng vai `agent`, theo từng HTX, rồi gửi đề xuất qua `/api/internal/agent/*`. Đề xuất chỉ được thực thi khi người duyệt (hoặc chế độ tự vận hành với loại đề xuất đã mở).
  - Vai `agent` **chưa đọc được** `input_advances`, `input_items`, `fresh_leaf_tickets`, `processing_batches` hay `processing_batch_outputs`.
  - `journal_activities` và `input_items` đều có `pesticide_product_id`, nên ghép được lần phun với thuốc đã ứng theo mã thuốc.
  - Chưa có định mức kg búp/ha/lứa. `parcels.estimated_yield_per_ha` là định mức chung, không ghi đơn vị.
- **Chatbot kỹ thuật:**
  - Chỉ đọc `.md` và `.txt` trong `para/<htx>/Resources` và `Areas`.
  - Lấy 5 tệp mới nhất, không chọn theo câu hỏi, mỗi tệp cắt 2.000 ký tự.
  - Không đọc PDF, không có kho vector.
- **PR #99** (bộ cẩm nang chè, khoảng 100 tệp, 89 tệp `.md`):
  - đang xung đột, vì GĐ0 đã xoá thư mục gốc `Kho_Tai_Nguyen_HTX/` và chuyển mẫu sang `docs/templates/para-tea-cooperative/` với tên tiếng Anh kiểu kebab-case;
  - có một tệp cấm AI đọc (`thuoc-tham-khao-cho-can-bo.md`);
  - có script cần firecrawl (AGPL-3.0).
- **Piper TTS:**
  - một giọng `vi_VN-vais1000-medium`;
  - `POST /api/tts` nhận tối đa 2.000 ký tự, chưa có giới hạn tần suất;
  - mới dùng cho bản tin (web và Telegram).
- **Nhận diện bệnh:**
  - Mô hình chè có 8 lớp; trong 5 mục tiêu chỉ có Bọ xít muỗi (`helopeltis`).
  - Độ chính xác khi thử chéo nguồn chỉ 0,12–0,35.
  - Tên bệnh cán bộ xác nhận (`confirmed_diagnosis`) là chữ tự gõ, chưa dùng làm nhãn được.
  - Mô hình `.keras` nằm trong git, không có sổ phiên bản hay mã băm.
- **Zalo:**
  - chưa có dòng mã nào;
  - bốn sự kiện (giá ngày, phiếu cân, hết cách ly, chốt kỳ) hiện **không báo cho ai**;
  - chưa có trường đồng ý nhận tin.

  Mẫu để làm theo: `dxos-telegram`, một relay "vận chuyển thuần" bằng Python, trong khi web giữ outbox, mẫu tin và việc thử lại. Telegram có stub `stub_bot_api.py` và smoke `lib-telegram.sh`. Đặc tả agentic có quyết định D15 "chỉ Telegram, không làm Zalo", nay được lộ trình GĐ4 thay.

## 3. GĐ4-A — AI đối soát, dự báo, RAG PDF, TTS

### 3.1. Dữ liệu cho agent

- Thêm quyền đọc của vai `agent` trong Hasura cho các bảng `input_advances`, `input_items`, `fresh_leaf_tickets`, `processing_batches`, `processing_batch_outputs`. Lọc theo HTX như `parcels`.
- **Không** mở cột tiền (`amount_vnd`, `unit_price_vnd`, `price_vnd_per_kg`) và không mở tên hay số điện thoại.
- Agent gắn tên hộ bằng id, nên thông báo nội bộ do web điền tên lúc hiển thị.

### 3.2. Agent đối soát `cross-check` (A13)

Agent chạy mỗi ngày lúc 05:45 và chỉ dùng luật, không dùng LLM. Kết quả là đề xuất `notification.internal` gửi cán bộ và trưởng HTX, có bằng chứng (evidence) và khoá chống lặp theo đối tượng.

**R1 — Ứng thuốc mà không ghi phun.**
- Áp cho phiếu ứng `VALID` mà vật tư có `kind = PESTICIDE`, ứng ngày `d`.
- Báo khi tới hôm nay vẫn chưa có nhật ký `SPRAYING` (trạng thái khác `DRAFT` và `REJECTED`) trên **bất kỳ** thửa nào của hộ đó trong `[d, d + grace_days]`, cùng `pesticide_product_id` với vật tư. Nếu vật tư không gắn mã thuốc thì lần phun bất kỳ đều được tính.
- Chỉ báo sau khi đã qua `d + grace_days`.
- Mặc định `grace_days = 10`, sửa được trong cài đặt agent.
- Khoá chống lặp là id phiếu ứng: mỗi phiếu chỉ báo một lần.
- Lời: "Hộ {hộ} nhận {thuốc} ngày {d} nhưng chưa ghi nhật ký phun sau {grace} ngày. Cán bộ kiểm tra giúp."

**R2 — Cân búp vượt định mức diện tích.**
- Theo từng thửa và lứa (`cycle_id`), so Σ `net_kg` phiếu cân `VALID` với `area_ha × fresh_norm_kg_per_ha_flush × tolerance`.
- Mặc định định mức 1.800 kg búp tươi/ha/lứa, hệ số dung sai 1,35 (ngưỡng 2.430 kg/ha/lứa); cả hai sửa được theo HTX.
- Phiếu không gắn lứa thì gom theo cửa sổ 30 ngày.
- Khoá chống lặp theo (thửa, lứa): báo một lần mỗi lứa, và báo lại khi vượt thêm 20%.
- Lời: "Thửa {mã} ({ha} ha) đã cân {kg} kg trong lứa này, vượt định mức {định mức} kg. Kiểm tra búp gom từ thửa khác."

### 3.3. Dự báo búp lứa tới cho xưởng (không dùng LLM, tính ở lõi)

- Dùng `ForecastUseCase` thay cho agent, để số luôn tính lại được và kiểm thử được.
- Phạm vi là các thửa có lứa đang mở, với `estimated_harvest_date` trong 14 ngày tới.
- **Kg búp tươi dự kiến:**
  - trung vị Σ `net_kg` của 3 lứa đã đóng gần nhất của thửa;
  - thửa chưa có lịch sử thì dùng `area_ha × định mức`, và ghi rõ là ước tính theo định mức.
- **Kg chè khô dự kiến** = búp tươi chia 4,75 (giữa khoảng chuẩn 4,50–5,00).
- **Hiển thị:**
  - một khối "Dự báo 14 ngày tới" trên `/officer/processing` và `/manager/processing`, theo tuần, tổng và từng thửa, mỗi số ghi nguồn (lịch sử hay định mức);
  - một dòng tóm tắt trong khối tồn chè khô của bảng điều hành.

### 3.4. RAG đọc PDF trong P.A.R.A

- **Trích chữ:**
  - Khi tải lên một `.pdf` có chữ, server trích chữ và lưu tệp chữ đi kèm `<key>.txt` cạnh tệp gốc (cùng thư mục HTX).
  - Tệp đã có từ trước thì trích ở lần đọc đầu tiên.
  - PDF scan (không có lớp chữ) thì đánh dấu "không đọc được", không OCR.
  - Thư viện: `unpdf` (MIT, chỉ JS, chạy trên Node). Đây là phụ thuộc mới duy nhất của GĐ4-A (§7.3).
- **Chọn ngữ cảnh theo câu hỏi:**
  - Cắt tài liệu thành đoạn khoảng 1.200 ký tự, chồng nhau 150 ký tự.
  - Chấm điểm BM25 trên từ đã bỏ dấu, có từ điển đồng nghĩa nhỏ cho thuật ngữ chè (búp, lứa, đốn, cách ly…).
  - Lấy 4 đoạn tốt nhất; mỗi đoạn ghi tên tệp làm nguồn.
  - Không dùng kho vector, để giữ RAM của lõi ≤ 8 GB theo lộ trình.
  - Chỉ mục được lưu đệm trong bộ nhớ theo HTX, làm mới khi danh sách tệp đổi.
- **Loại trừ:**
  - tệp có front-matter `ai: false`;
  - mọi tệp trong thư mục có `.ai-ignore`.

  Tệp thuốc tham khảo cho cán bộ của PR #99 thuộc diện này.

### 3.5. Bộ cẩm nang chè từ PR #99

- Chuyển nội dung `.md` và `.csv` đã chọn lọc của PR #99 vào `docs/templates/para-tea-cooperative/` theo tên thư mục tiếng Anh kebab-case. Ví dụ: `3-resources/tea-cultivation-handbook/`, `3-resources/tea-pests-and-diseases/`, `3-resources/processing-and-sales/`, `2-areas/cooperative-law-and-governance/`.
- Nội dung giữ nguyên tiếng Việt, kèm ghi nguồn và giấy phép ở đầu mỗi tệp.
- Không đưa vào: script cần firecrawl, các tệp `.xlsx`, văn bản OCR lỗi chữ.
- Lệnh `./dxos para seed <htx>` chép mẫu vào `para/<htx>/` cho HTX mới, chỉ chép tệp chưa có, không ghi đè.

### 3.6. TTS cho nông dân

- Một nút "Nghe" dùng chung, tái dùng `ListenBulletinButton`. Nút đọc qua `/api/tts`, khi máy chủ không có thì dùng giọng của trình duyệt.
- Đặt nút trên bốn trang của nông dân:
  - Tổng quan: giá hôm nay và ngày được hái của từng thửa;
  - Nhật ký: hướng dẫn của hoạt động đang chọn;
  - Chẩn đoán: kế hoạch chăm sóc;
  - Sổ tiền: số dư.
- `/api/tts`:
  - giới hạn 20 lần mỗi phút cho mỗi người (429);
  - lưu đệm âm thanh theo băm (text, giọng) trong 7 ngày ở kho đối tượng.

## 4. GĐ4-B — Nhận diện 5 sâu bệnh chè Việt Nam (DEV-015)

Năm mục tiêu: Rầy xanh, Bọ cánh tơ, Nhện đỏ, Phồng lá chè, Bọ xít muỗi.

**Thực tế dữ liệu:** chưa có bộ ảnh công khai đủ tốt cho 4 trong 5 mục tiêu. Vì vậy GĐ4-B làm **đường ống** thu ảnh có nhãn từ thực địa, và chỉ phát hành mô hình mới khi dữ liệu đạt ngưỡng.

1. **Danh mục nhãn thống nhất.** Thêm bảng `disease_labels` (mã, tên Việt, tên khoa học, nhóm sâu/bệnh/khỏe/khác), gieo sẵn:
   - 5 mục tiêu: `green_leafhopper`, `tea_thrips`, `red_spider_mite`, `blister_blight`, `helopeltis`;
   - 8 lớp hiện có;
   - nhãn `healthy` và `other`.

   Thêm cột `disease_reports.confirmed_label_code`. Khi duyệt, cán bộ **chọn** nhãn trong danh sách, còn ô tên tự gõ vẫn giữ. Báo cáo cũ được gán nhãn theo tên nếu khớp, không khớp thì để trống.
2. **Thu ảnh có nhãn.**
   - Báo cáo `CONFIRMED` có nhãn và ảnh thì thành mẫu.
   - Lệnh `./dxos disease export --since <ngày> [--htx <mã>]` (chỉ `platform_admin`) xuất ảnh đã xoá EXIF và GPS, kèm `manifest.csv` (mã báo cáo, nhãn, HTX, ngày, băm ảnh).
   - Chỉ xuất ảnh của HTX đã bật "Cho phép dùng ảnh đã xác nhận để huấn luyện mô hình". Mặc định tắt (§7.6).
   - Sửa lỗi im lặng khi chép báo cáo sang P.A.R.A: ghi log cảnh báo và thử lại một lần.
3. **Huấn luyện v2.** `ai-models/tea/train.py` thêm nguồn `field` (thư mục xuất ở bước 2) cạnh các bộ công khai.
   - Một lớp chỉ vào mô hình khi có ít nhất 150 ảnh thực địa.
   - Cổng chất lượng của `evaluate`:
     - độ chính xác ≥ 0,80;
     - recall từng lớp mục tiêu ≥ 0,70;
     - độ chính xác trên tập thực địa riêng ≥ 0,75 (tách theo HTX);
     - không đạt thì in `BLOCKED`.
   - Thêm lớp "không phải lá chè" từ ảnh nhiễu, để ảnh ngẫu nhiên không còn bị gán `healthy`.
4. **Sổ mô hình.** `ai-models/tea/registry.json` ghi phiên bản, mã băm sha256 của `.keras`, danh sách lớp, ngưỡng, số liệu đánh giá và ngày.
   - `disease-api` từ chối nạp mô hình sai băm.
   - `/health` và mỗi kết quả trả `model_version`; web lưu phiên bản đó vào báo cáo.
   - CI kiểm băm khớp sổ.
5. **API và web.**
   - Lớp đọc từ cấu hình. Bản đồ tên Việt chỉ nằm ở một chỗ, là bảng `disease_labels`; `disease-labels.ts` và `treatment-plan.ts` đọc từ đó.
   - Kết quả ngoài 5 mục tiêu hoặc dưới ngưỡng vẫn chuyển cán bộ như hiện nay. AI **không** kê thuốc.
   - Kê đơn tiếp tục đi qua luồng S1: chọn thuốc trong danh mục, tạo nháp nhật ký phun và khoá cách ly.
   - Nối khoá cách ly tự động: khi nông dân bấm "Đã phun" trên nháp đó, mức sàn cách ly của thuốc áp như mọi lần phun.

## 5. GĐ4-C — Cổng Zalo OA/ZNS cấp nền tảng

**Kiến trúc giống Telegram.** Web giữ mọi logic; relay `dxos-zalo` chỉ vận chuyển.

1. **Dữ liệu** (`platform/postgres/init/10-zalo.sql`, lược đồ `platform`):
   - `zalo_outbox`:
     - `id`, `htx_code`, `event_kind` (PRICE_PUBLISHED | TICKET_RECEIPT | WITHDRAWAL_ENDED | SETTLEMENT_CLOSED);
     - `event_id`, `phone`, `template_key`, `params` (jsonb), `status` (pending | leased | sent | failed | skipped), `attempts`, `next_attempt_at`, `lease_until`, `zalo_msg_id`, `last_error`, `created_at`, `sent_at`;
     - duy nhất (`event_kind`, `event_id`, `phone`), để một sự kiện không gửi hai lần.
   - `zalo_templates`: `template_key` → `zns_template_id` và danh sách tham số. Do `platform_admin` khai báo sau khi Zalo duyệt mẫu.
   - `zalo_settings`: mỗi HTX có bật/tắt, các loại tin bật, giờ im lặng 21:00–06:00 và hạn mức tin mỗi tháng.
   - `zalo_consents`:
     - `household_id`, `phone`, `status` (OPTED_IN | OPTED_OUT), `source` (đăng ký, cán bộ ghi nhận, xã viên tự tắt), `recorded_by_id`, `at`;
     - chỉ thêm dòng; trạng thái hiện hành là dòng mới nhất;
     - có trigger kiểm toán.
2. **Sự kiện** (gắn vào use case, ghi outbox **trong cùng giao dịch** với việc gốc khi được; nếu không được thì ghi ngay sau, kèm khoá chống lặp):

   | Sự kiện | Người nhận | Nội dung |
   |---|---|---|
   | Trưởng HTX công bố giá ngày | Mọi xã viên đã đồng ý nhận tin | Giá các phẩm cấp. Công bố lại trong ngày chỉ gửi khi giá đổi, khoá là ngày + băm giá |
   | Lưu phiếu cân | Hộ của phiếu | Số phiếu, ngày, kg tịnh, thành tiền |
   | Hết cách ly | Hộ có thửa vừa hết cách ly | Mã thửa, ngày được hái. Một việc chạy mỗi ngày 06:00 tìm các thửa có ngày an toàn muộn nhất là hôm nay |
   | Chốt kỳ quyết toán | Từng hộ có dòng quyết toán | Mã kỳ, thực lĩnh hoặc còn nợ, đường dẫn tới phiếu. **Không** kèm số tài khoản |

3. **Relay** `platform/zalo` (Python thư viện chuẩn, giống `platform/telegram`):
   - Mỗi 2 giây thuê tối đa 20 dòng qua `GET /api/internal/zalo/outbox`.
   - Gửi qua ZNS API bằng access token của OA và báo kết quả qua `POST /api/internal/zalo/outbox/[id]/result`.
   - Thử lại theo backoff tối đa 10 lần. Các lỗi vĩnh viễn (sai mẫu, số không dùng Zalo, hết hạn mức) thì dừng ngay.
   - Token OA có refresh token, lưu trong volume bí mật do `./dxos zalo enable` tạo. `platform_admin` nhập token qua trang `/platform/zalo`.
4. **Stub** `dxos_zalo/stub_zns_api.py`:
   - giả các endpoint ZNS (gửi theo mẫu, làm mới token), ghi lại mọi lời gọi;
   - có API điều khiển `/control/calls|reset|fail-next` để giả lỗi hết hạn mức, sai mẫu và số không có Zalo;
   - compose service `dxos-zalo-stub` thuộc profile `zalo-test`;
   - `platform/tests/lib-zalo.sh` và `smoke-zalo.sh` kiểm trọn 4 sự kiện tới stub, giống smoke Telegram.

   Nhờ stub, CI chạy 100% luồng mà không cần khoá OA thương mại.
5. **An toàn:**
   - Không gửi tin khi HTX tắt kênh, loại tin bị tắt hoặc hộ chưa đồng ý. Khi đó dòng outbox ghi `skipped` kèm lý do.
   - Giờ im lặng dời tin sang 06:00. Tin hết cách ly và giá ngày có thể gửi từ 05:00.
   - Không đưa số tài khoản hay mã thuốc tham khảo vào tin.
   - Mỗi tin đi qua `zalo_templates`; không có văn bản tự do.

## 6. Kiểm chứng

- **A:**
  - test luật R1/R2 với dữ liệu cố định (biên `grace_days`, biên dung sai, lứa trống);
  - scenario của agent;
  - test dự báo (trung vị, thửa chưa có lịch sử);
  - test BM25 (chọn đúng đoạn, loại tệp `ai: false`);
  - test trích PDF (có chữ, scan);
  - test giới hạn `/api/tts`.
- **B:**
  - test migration nhãn và việc gán nhãn báo cáo cũ;
  - test xuất dữ liệu (xoá EXIF, chỉ HTX đã đồng ý);
  - test API nạp mô hình sai băm thì từ chối;
  - CI kiểm băm;
  - `evaluate` in `BLOCKED` khi dưới cổng.
- **C:**
  - test từng sự kiện ghi đúng outbox, khoá chống lặp và các trường hợp bỏ qua;
  - test relay với stub, kể cả lỗi vĩnh viễn và lỗi thử lại;
  - smoke `smoke-zalo.sh` trên stack thật với stub;
  - test không có số tài khoản trong mọi mẫu tin.
- Mỗi phần chạy hai vòng giao diện (desktop và mobile, sáng và tối) cho các trang có thay đổi.

## 7. Cần chủ dự án quyết

1. **Thứ tự và cách chia việc:** C và A chạy song song, B chạy sau cùng, vì cần ảnh thực địa tích luỹ. Em đề xuất phát hành A và C cùng một bản.
2. **Định mức R2:**
   - em tạm đặt 2.000 kg búp tươi/ha/lứa, dung sai 1,3, và `grace_days` của R1 là 14 ngày;
   - anh hoặc cán bộ kỹ thuật cho số thật của Thái Nguyên, sửa được theo HTX.
3. **Phụ thuộc mới `unpdf`** để đọc PDF có chữ, không OCR. Nếu anh muốn tránh phụ thuộc thì chỉ đọc PDF đã kèm tệp `.txt`.
4. **Bộ cẩm nang PR #99:**
   - em chuyển nội dung đã chọn lọc sang thư mục chuẩn trong một PR mới, giữ ghi công tác giả và nguồn, rồi đóng PR #99;
   - hoặc nhờ bạn Quyến tự rebase.

   Anh chọn cách nào?
5. **Dữ liệu dự báo:** chỉ dùng phiếu cân và định mức, chưa dùng thời tiết. Thời tiết làm ở vòng sau.
6. **Ảnh để huấn luyện mô hình:** mặc định **tắt** theo từng HTX, cần trưởng HTX bật. Ảnh xuất ra đã xoá vị trí GPS. Chỉ `platform_admin` được xuất.
7. **Ngưỡng 150 ảnh mỗi lớp** trước khi một lớp mới vào mô hình. Khi chưa đủ, ảnh vẫn chuyển cán bộ như hiện nay.
8. **Zalo:**
   - D15 cũ ("chỉ Telegram") được thay bằng quyết định này;
   - dùng một OA chung của nền tảng; mẫu ZNS đăng ký một lần cho cả nền tảng;
   - chi phí tin tính theo HTX, mỗi HTX có hạn mức tháng (mặc định 2.000 tin).
9. **Đồng ý nhận tin:** cán bộ ghi nhận đồng ý (có người ghi và thời điểm) khi đăng ký hoặc tại buổi họp, và xã viên tự tắt được. Không gửi cho hộ chưa có dòng đồng ý.
10. **Zalo Mini App** (lộ trình có nhắc): ngoài phạm vi GĐ4-C lần này.

## 8. Quyết định của chủ dự án (2026-11-28, chiều)

1. **Thứ tự:** GĐ4-A và GĐ4-C chạy song song, phát hành chung v1.22.0. GĐ4-B làm sau, phát hành v1.23.0.
2. **Định mức chè Thái Nguyên** (sửa được theo HTX):
   - `fresh_norm_kg_per_ha_flush = 1800` (khoảng 65 kg/sào Bắc Bộ 360 m², sát mức bình quân 14 tấn/ha/năm chia 7–8 lứa);
   - `norm_tolerance = 1.35` (cảnh báo R2 khi vượt 2.430 kg/ha/lứa, khoảng 87,5 kg/sào);
   - R1 `grace_days = 10`, để cán bộ kịp nhắc ghi nhật ký phun trước khi lứa vào kỳ hái và đụng khoá cách ly ở bàn cân.
3. **PDF:** thêm `unpdf` (MIT), pin cứng phiên bản và ghi vào `DEPENDENCIES.md`.
4. **PR #99:**
   - chuyển chọn lọc sang `docs/templates/para-tea-cooperative/` trong một PR mới;
   - bỏ script firecrawl (AGPL-3.0), tệp `.xlsx` và tệp OCR hỏng;
   - đặt `ai: false` cho bảng tra thuốc;
   - ghi công rõ tác giả Nguyễn Bá Quyến trong tài liệu;
   - đóng PR #99 với lời cảm ơn kèm đường dẫn tới PR mới.
5. **Dự báo 14 ngày:** chỉ dùng lịch sử phiếu cân và định mức diện tích, chưa dùng thời tiết.
6. **Ảnh huấn luyện:** mặc định tắt theo từng HTX, xoá sạch EXIF/GPS khi lưu, chỉ `platform_admin` được xuất.
7. **Ngưỡng GĐ4-B:** tối thiểu 150 ảnh thực địa mỗi lớp, bắt buộc có lớp `not_tea_leaf`, và kiểm SHA-256 trong `registry.json`.
8. **Zalo:** một OA chung của nền tảng (thay D15 cũ), hạn mức mặc định 2.000 tin/tháng mỗi HTX.
9. **Đồng ý nhận tin:** cán bộ ghi nhận OPTED_IN, xã viên tự tắt (OPTED_OUT) được, không gửi cho hộ chưa có dòng đồng ý.
10. **Zalo Mini App:** để ngoài phạm vi lần này.

Bốn chỉnh sửa kỹ thuật của chủ dự án cho kế hoạch:
- stub Zalo dùng cổng `127.0.0.1:8084`;
- nông dân tự tắt nhận tin trên đúng hộ của mình;
- `dxos-zalo` được nối vào Makefile và đứng chờ khoẻ mạnh khi chưa có token OA;
- cập nhật trạng thái DEV-008, DEV-010…DEV-015.

