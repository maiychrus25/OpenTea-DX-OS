<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Tầng 2b: Chuyển sang HTX chè (nghiệp vụ, mô hình bệnh chè, giao diện)

> **Trạng thái:** Đã phát hành `v1.7.0` (2026-11-11). Xem "Ghi chú sau triển khai 2b" ở cuối.
> **Phạm vi:** Đợt 2b của Tầng 2 (milestone `v1.7.0`, issue #19). Tiếp nối đợt 2a (`docs/specs/2026-11-09-tier2a-core-integration-design.md`).
> **Căn cứ:** Kế hoạch dự thi OLP 2026 (HTX chè Thái Nguyên, câu chuyện demo "Một ngày của lô chè A3"); tiêu chí chấm trải nghiệm người dùng và trình diễn trực tiếp.

## 1. Mục tiêu

1. Ứng dụng nói ngôn ngữ của HTX chè: dữ liệu mẫu, từ ngữ, nhiều lứa hái mỗi năm.
2. Nhận diện bệnh trên lá chè bằng một mô hình huấn luyện từ dữ liệu có giấy phép mở, kết quả không chắc chắn được chuyển cho cán bộ xác nhận.
3. Câu chuyện "Một ngày của lô chè A3" chạy trọn trên trình duyệt thật.
4. Giao diện thống nhất theo `DESIGN.md`, có chế độ sáng và tối nhất quán trên mọi màn hình.
5. Toàn bộ chức năng đang chạy được giữ nguyên.

## 2. Hiện trạng liên quan

- **Từ vựng:** khoảng 60 dòng chữ lúa/gạo trong giao diện; dữ liệu mẫu `apps/web/prisma/seed.ts` tạo một HTX `MD2` trồng lúa; tài khoản Keycloak `manager1`, `officer1`, `farmer1` thuộc `MD2`. Fixture smoke `two-htx.sql` đã dùng chè.
- **Thời gian cách ly:** đã có. `JournalActivity.safe_harvest_date` được tính khi ghi nhật ký. Duyệt thu hoạch, tạo lô và xuất QR đều chặn khi chưa qua thời gian cách ly.
- **Mô hình dữ liệu:** loại cây, mùa vụ, mặt hàng đều là chuỗi tự do. Thửa đi theo trạng thái một chiều kết thúc ở `HARVESTED`; ghi nhật ký thu hoạch đặt `harvested_at` cho lứa mới nhất. Xuất QR đòi mọi thửa của lô đang ở `HARVESTED` hoặc `HARVEST_APPROVED`.
- **Nhận diện bệnh:** `apps/disease-api` dùng mô hình 46 lớp (MIT, CuongKenn/ICTU-OpenAgri), không có lớp nào cho chè; phụ thuộc `tensorflow-cpu` không ghim phiên bản và không có bản arm64. Cán bộ chỉ duyệt hoặc từ chối, chưa ghi được tên bệnh đã xác nhận dù cột `confirmed_diagnosis` đã có.
- **Ảnh nhật ký:** `FarmerJournalForm` gọi `/api/journal/upload`, route này chưa tồn tại.
- **Giao diện:** Tailwind v4 với token trong `globals.css`; chưa có chế độ tối; 375 mã màu cứng trong 62 file CSS module, 72 trong TSX và 241 class màu Tailwind cố định; tên "DX-AgriMarket" nằm rải rác; icon PWA là file giữ chỗ.

## 3. Quyết định đã chốt

| Chủ đề | Quyết định | Lý do |
| --- | --- | --- |
| Bệnh chè | Huấn luyện mô hình chè riêng bằng học chuyển tiếp | Mô hình hiện có không có lớp chè; giữ nguyên mô hình cũ |
| Dữ liệu huấn luyện | Ba bộ CC BY 4.0 trên Mendeley (§4.1) | Giấy phép xác nhận qua API chính thức của Mendeley |
| Nhiều lứa hái | Mỗi lứa là một `ParcelCropCycle`; không đổi schema | Mô hình hiện có đã hỗ trợ nhiều lứa trên một thửa |
| Chế độ tối | Mọi màu đi qua token | Yêu cầu sáng/tối nhất quán trong AGENTS.md |
| Tên sản phẩm | OpenTea DX-OS | Thống nhất với repo và hồ sơ dự thi |

## 4. Mô hình bệnh chè

### 4.1. Dữ liệu

| Bộ dữ liệu | DOI | Ảnh | Nơi thu |
| --- | --- | --- | --- |
| Tea sickness dataset (Kimutai, Förster) | 10.17632/j32xdt2ff5.2 | 885 | Kenya |
| Tea leaf disease Dataset (Islam) | 10.17632/mz598gxfw9.1 | 5.180, có khung đánh dấu | Bangladesh |
| Real-Life Dataset of Tea Plant Leaf Disease Classification (Billah và cộng sự), bản nén | 10.17632/rrff4vb35m.2 | 967 | Bangladesh |

Cả ba đều CC BY 4.0. `ATTRIBUTION.md` ghi tên tác giả, tên bộ dữ liệu, DOI và giấy phép.

### 4.2. Huấn luyện (`ai-models/tea/`)

- `datasets.json`: từng nguồn với DOI, URL tải, SHA-256 của file, giấy phép và bảng gộp tên lớp về một bộ tên chung.
- `train.py`: chạy trong `python:3.12.15-slim-bookworm` với `tensorflow==2.21.0`; tải dữ liệu, kiểm SHA-256, cắt ảnh theo khung với bộ có annotation, rồi học chuyển tiếp MobileNetV2 (trọng số ImageNet), ảnh 224×224, seed cố định.
- Lớp dự kiến: đốm tảo (algal leaf spot), brown blight, chấm xám (gray blight), đốm đỏ (red leaf spot), bọ xít muỗi (Helopeltis), đốm mắt chim (bird's eye spot), đốm trắng (white spot), lá khoẻ. Lớp có dưới 100 ảnh sau khi gộp bị bỏ.
- Chia 70/15/15 theo từng lớp; thêm kiểm tra chéo: huấn luyện trên hai nguồn, kiểm tra trên nguồn còn lại.
- Dữ liệu tải về nằm ngoài repo; không commit ảnh.

### 4.3. Kết quả commit vào repo

- `ai-models/tea_leaf_model.keras`, `ai-models/tea_class_names.txt`.
- `ai-models/tea_class_names_vi.json`: tên tiếng Việt từng lớp, đánh dấu là nhãn AI cần cán bộ xác nhận. Không tự đặt tên khi chưa chắc; "brown blight" và "anthracnose" dễ nhầm vì đều hay gọi là thán thư.
- `ai-models/tea/MODEL_CARD.md`: dữ liệu, số ảnh từng lớp, độ chính xác và F1 từng lớp trên tập kiểm tra, kết quả kiểm tra chéo, ngưỡng tin cậy, giới hạn (ảnh từ Kenya và Bangladesh; chưa có bệnh phồng lá chè).
- Nếu độ chính xác tổng thể trên tập kiểm tra dưới 0,80, dừng lại báo chủ dự án trước khi đưa vào ứng dụng.

### 4.4. Phục vụ (`apps/disease-api`)

- `POST /predict?model=tea|general`; mặc định `general`, lời gọi cũ không đổi. Tên mô hình khác trả 400.
- Mô hình chè nạp khi khởi động cùng mô hình cũ.
- Độ tin cậy dưới ngưỡng (mặc định 0,6, chỉnh theo kết quả kiểm tra, ghi trong model card) trả kết quả "không xác định".
- `requirements.txt` ghim phiên bản tất cả thư viện; `tensorflow-cpu` đổi thành `tensorflow==2.21.0`. Kiểm tra đầu tiên: mô hình 46 lớp hiện có phải mở và cho cùng kết quả trên một ảnh mẫu. Không được thì ghim phiên bản cũ cho mô hình đó và báo chủ dự án.

### 4.5. Ứng dụng web

- `DiseaseApiAdapter` chọn `model=tea` khi `crop_type` của thửa chứa "chè" hoặc "tea" (không phân biệt hoa thường), ngược lại `general`.
- Kết quả "không xác định" vẫn tạo báo cáo bệnh và vào hàng chờ cán bộ; nông hộ thấy "Đã gửi cán bộ kỹ thuật xem".
- Màn hình duyệt bệnh của cán bộ có ô **tên bệnh đã xác nhận**, lưu vào `confirmed_diagnosis`; khi có, mọi nơi hiển thị dùng tên đã xác nhận thay cho tên AI.

## 5. Nghiệp vụ chè

### 5.1. Nhiều lứa hái

- Mỗi lứa là một `ParcelCropCycle`, `season` dạng `Lứa <n>/<năm>`.
- Ghi nhật ký thu hoạch đóng lứa hiện tại như hôm nay.
- Thao tác mới **Bắt đầu lứa mới** cho cán bộ trên thửa ở `HARVESTED`: tạo lứa kế tiếp với `n` tăng dần trong năm và đưa thửa về `TENDING`. Có `TenantGuard`.
- Điều kiện xuất QR đổi thành: mỗi thửa của lô có một lứa có `harvested_at` khác null và không muộn hơn `harvest_date` của lô.

### 5.2. Thời gian cách ly

Giữ nguyên các chặn hiện có, thêm test cho duyệt thu hoạch, tạo lô và xuất QR. Bảng điều khiển của nông hộ hiện "Thửa <mã> còn <N> ngày cách ly" khi `safe_harvest_date` muộn nhất còn ở tương lai.

### 5.3. Tải ảnh nhật ký

`POST /api/journal/upload` cho `farmer` và `officer`: nhận `{filename, contentType}`, chỉ chấp nhận `image/jpeg`, `image/png`, `image/webp`; trả `{data:{uploadUrl, key}}` với URL tải lên hạn 900 giây và key `para/<htxCode>/Areas/Journal/<yyyy>/<uuid>-<tên đã làm sạch>`. Dùng lại `MinioDocumentAdapter.generateUploadUrl`.

### 5.4. Dữ liệu mẫu và tài khoản

- `npm run seed` tạo HTX Tân Cương (`TC`) và La Bằng (`LB`), mỗi HTX vài hộ và thửa có toạ độ trong khu vực hai vùng chè (không phải ranh giới đất thật), giống Trung du, LDP1, Kim Tuyên. Chạy lại được nhiều lần.
- **Thửa A3** của `TC` có lịch sử tính theo ngày chạy seed: bón phân, phun thuốc cách ly 7 ngày còn hiệu lực, một lô của lứa trước đã xuất QR, một ảnh bệnh chờ duyệt.
- Realm có `manager_tc`, `officer_tc`, `farmer_tc`, `manager_lb`, `officer_lb`, `farmer_lb`, thay `manager1`, `officer1`, `farmer1`. Cán bộ vẫn bắt buộc TOTP; README hướng dẫn cài TOTP trước buổi demo. Tên `manager_tc`, `manager_lb` trùng với người dùng smoke tạo ra: smoke phải dùng tài khoản của chính nó hoặc chịu được việc tài khoản đã tồn tại.

### 5.5. Thị trường và từ vựng

- Comtrade thêm HS 0902; `vietnam_market_sync` thêm chè; giao diện ghi "giá mô phỏng" cho nguồn giả lập.
- Mặc định mặt hàng của bản tin, chatbot và dashboard chuyển sang chè.
- Thay chữ lúa, gạo, Hè Thu trong giao diện, dữ liệu mẫu và test; "Lịch vụ mùa" thành "Lịch thu hái".

## 6. Giao diện

### 6.1. `DESIGN.md` (gốc repo)

Theo định dạng google-labs-code/design.md: YAML token cho màu sáng và tối, chữ, khoảng cách, bo góc, đổ bóng, chuyển động, breakpoint; phần giải thích lý do; tiêu chuẩn tương phản WCAG AA (4,5:1 cho chữ thường). Màu chính giữ `#176c4b`; thêm một màu hổ phách cho điểm nhấn; nền tối là xanh rất đậm. Font Be Vietnam Pro.

### 6.2. Chế độ tối

- Theo `prefers-color-scheme`, có nút chuyển sáng/tối lưu trong `localStorage`, không nhấp nháy khi tải trang.
- Mọi màu dùng token trong `globals.css`; chuyển toàn bộ mã màu cứng và class màu Tailwind cố định sang token.
- Test tự động fail khi có mã màu cứng trong `src/**/*.module.css` hoặc `src/**/*.tsx`, ngoài file token và các ngoại lệ được liệt kê kèm lý do (ví dụ màu trên bản đồ Leaflet).

### 6.3. Thương hiệu và trang chủ

- Tên OpenTea DX-OS gom trong một file cấu hình; tiêu đề, sidebar, topbar, manifest, theme Keycloak dùng chung.
- Icon PWA thật 192 và 512 px.
- Trang chủ: giới thiệu ngắn, nút đăng nhập, ô nhập mã lô dẫn tới trang truy xuất.

### 6.4. Màn hình ưu tiên

Nông hộ (điện thoại): bảng điều khiển, nhật ký, chẩn đoán. Cán bộ: duyệt nhật ký, duyệt bệnh, tạo lô. Ban quản trị: bảng điều khiển. Công khai: trang truy xuất QR. Các màn hình còn lại chỉ chuyển sang token và không vỡ bố cục.

## 7. Kiểm thử

| Lớp | Nội dung |
| --- | --- |
| `disease-api` | Chọn mô hình, ngưỡng tin cậy, tên mô hình sai trả 400, lời gọi cũ không đổi; dùng mô hình nhỏ giả lập, chạy trong CI |
| Mô hình | Độ chính xác, F1 từng lớp, kiểm tra chéo giữa nguồn, ghi vào model card |
| Web | Lứa mới; xuất QR theo lứa; chặn cách ly ở duyệt, tạo lô, xuất QR; tải ảnh nhật ký: sai vai trò, sai loại file, key trong đúng HTX; tên bệnh đã xác nhận |
| Dữ liệu mẫu | Chạy hai lần liên tiếp không lỗi; `TC` không thấy dữ liệu `LB` |
| Trình duyệt | Câu chuyện A3: nông hộ ghi nhật ký có ảnh, thu hoạch bị chặn khi còn cách ly, cán bộ duyệt bệnh chè, xuất lô, mở trang QR công khai |
| Giao diện | Ảnh chụp các màn hình ưu tiên ở 1280px và 390px, sáng và tối; không tràn ngang trang; không chữ đè; test chặn mã màu cứng |

**Chống hồi quy:** 870 test web, 122 khẳng định smoke, 5 test trình duyệt của 2a, 78 test dataops, 39 test scanner và toàn bộ job CI phải xanh. Test e2e `8.11` "Officer sees household details" đang hỏng từ trước được sửa theo dữ liệu mẫu mới.

## 8. Tiêu chí hoàn thành

1. Không còn chữ lúa, gạo, Hè Thu trong giao diện và dữ liệu mẫu.
2. Câu chuyện A3 chạy trọn trên trình duyệt thật.
3. Mô hình chè có model card với số liệu thật.
4. `make build` qua được, kể cả trên arm64.
5. CI xanh; đóng #19; phát hành `v1.7.0`.

## 9. Thứ tự, điểm cắt và ngoài phạm vi

**Thứ tự:** ghim TensorFlow và kiểm tra mô hình cũ → huấn luyện mô hình chè → phục vụ và màn hình duyệt → nhiều lứa và điều kiện xuất QR → tải ảnh nhật ký → dữ liệu mẫu, tài khoản, thị trường, từ vựng → `DESIGN.md`, token, thương hiệu, trang chủ → chuyển màu cứng sang token → ảnh chụp, CI, tài liệu. Mục tiêu xong trước **20/11**.

**Điểm cắt nếu trễ, theo thứ tự:** icon và theme Keycloak; chè trong dữ liệu thị trường; độ hoàn thiện của màn hình không ưu tiên (vẫn chuyển sang token). Mô hình chè và câu chuyện A3 không cắt.

**Ngoài phạm vi:** thiết bị cảm biến thật; quyền `farmer` trên dữ liệu cảm biến; ranh giới đất thật; giá chè thật; mini-app và `dxos` CLI (Tầng 3).

**Giới hạn đã biết:** độ chính xác mô hình trên ảnh chè Thái Nguyên chưa được đo; giá chè trong dữ liệu thị trường là mô phỏng.

## 10. Rủi ro

| Rủi ro | Biện pháp |
| --- | --- |
| Mô hình 46 lớp không mở được bằng TensorFlow 2.21 | Kiểm tra đầu tiên; ghim phiên bản cũ cho mô hình đó nếu cần |
| Độ chính xác mô hình chè thấp | Ngưỡng tin cậy và hàng chờ cán bộ; dừng báo chủ dự án nếu dưới 0,80 |
| Tải dữ liệu 0,9 GB chậm hoặc link thay đổi | SHA-256 trong `datasets.json`; báo lỗi rõ; không commit ảnh |
| Chuyển màu sang token làm lệch giao diện | Ảnh chụp trước và sau; test chặn mã màu cứng |
| Đổi tài khoản Keycloak làm hỏng hướng dẫn và test cũ | Cập nhật README, test e2e và smoke cùng lúc |

## Ghi chú sau triển khai 2b

Phần này ghi chỗ code khác đặc tả và các số đo được khi hoàn tất đợt 2b (nhánh `feat/tier2b-tea-domain`, 2026-11-10). Thân đặc tả ở trên giữ nguyên.

**Mô hình bệnh chè (§4).**
- Độ chính xác trên tập kiểm tra **0,8683** (1.025 ảnh), qua ngưỡng dừng 0,80. Ngưỡng tin cậy **0,60** (giá trị sàn đã cho precision ≥ 0,90 trên tập kiểm định). File mô hình 9,2 MB.
- Kiểm tra chéo giữa các nguồn (huấn luyện hai nguồn, kiểm tra nguồn thứ ba) chỉ đạt **0,12 đến 0,35**; một ảnh nhiễu ngẫu nhiên được trả `healthy` với độ tin cậy 0,988. Vì vậy **mọi kết quả, kể cả `healthy`, đều vào hàng chờ cán bộ**, không chỉ kết quả dưới ngưỡng như §4.5 viết. Chi tiết ở `ai-models/tea/MODEL_CARD.md`.
- `brown_blight` giữ tên "Brown blight" trong `tea_class_names_vi.json` (không tự đặt tên tiếng Việt khi chưa chắc, theo §4.3).
- Thiếu mô hình chè thì `disease-api` vẫn khởi động, `model=tea` trả **503**; web coi đó là dịch vụ tạm gián đoạn (`AI_UNAVAILABLE`), không tạo báo cáo và không tự chuyển sang mô hình 46 lớp.

**Nghiệp vụ và dữ liệu (§5).**
- **R4:** image `web` không build được trên arm64 (thiếu `@next/swc-linux-arm64-musl` trong lớp npm cache của BuildKit), lỗi có từ trước; đã sửa trong Dockerfile để đạt tiêu chí 4 (`make build` trên arm64).
- **R5 (chờ chủ dự án quyết):** kiểm tra cách ly khi xuất QR tính mọi nhật ký đã duyệt của thửa so với hôm nay, nên khi lứa mới đang cách ly thì không xuất được lô của lứa trước. Giữ nguyên như §5.2. Lô `TC-CHE-A3-001` được seed sẵn ở trạng thái đã xuất; câu chuyện trên trình duyệt xuất một lô mới của thửa `TC-A2` (không có thuốc trong thời gian cách ly).
- **R6:** snapshot lưu khi xuất QR từng giữ `status: 'READY'`, nên trang công khai không hiện trạng thái đã xuất; nay lưu `QR_EXPORTED` và ảnh QR vừa tạo. Snapshot cũ không được ghi lại.
- **Khoá ảnh nhật ký:** `POST /api/journal` chỉ nhận key dưới `para/<htxCode>/Areas/Journal/` (hẹp hơn "trong đúng HTX" ở §7), và danh sách nhật ký chỉ ký URL cho các key đó, để nông hộ không gắn được tài liệu khác của HTX vào nhật ký.
- Duyệt thu hoạch chưa có nút trên giao diện, chỉ có `POST /api/parcels/[id]/approve-harvest`; câu chuyện kiểm tra lời từ chối qua route này, và lời từ chối hiện trên form tạo lô.
- `MINIO_ENDPOINT` trong `.env.local.example` có dạng `minio:9000` trong khi adapter lưu trữ của web chỉ nhận tên máy, nên mọi thao tác lưu trữ của web (tải ảnh nhật ký, chẩn đoán, màn hình bệnh của cán bộ, tài liệu, xuất QR) đều lỗi `Invalid endPoint`. Nay nhận cả `host` và `host:port`. CORS của SeaweedFS đã cho phép `PUT` từ `http://localhost:3000`, không cần đổi cấu hình nền tảng.
- Báo cáo bệnh có ảnh không còn trong kho (báo cáo seed của A3, hoặc ảnh bị bộ quét cách ly) hiện thông báo "Không tải được ảnh" thay cho ảnh vỡ, ở hàng chờ và trang duyệt của cán bộ và lịch sử chẩn đoán của nông hộ.
- Service worker của PWA lưu đệm mọi `GET /api/` bằng NetworkFirst, kể cả luồng sự kiện `/api/notifications/stream` vốn không bao giờ kết thúc; mỗi trang để lại một kết nối mở, sau vài trang trình duyệt hết 6 kết nối cho mỗi máy chủ và các yêu cầu bị treo. Câu chuyện A3 hỏng khoảng một lần trong sáu lần chạy vì lỗi này; luồng sự kiện nay đi thẳng ra mạng (NetworkOnly) và 25 lần chạy liên tiếp đều qua.
- Tài khoản `smoke_officer_tc` (do smoke tạo) dùng cho câu chuyện, vì cán bộ demo phải cài TOTP; nông hộ trong câu chuyện là `farmer_tc` (không có bước TOTP, đăng nhập không đổi tài khoản).

**Kiểm thử (§7).**
- **R7:** 20 test e2e cũ (không chạy trong CI) hỏng vì dev server của Playwright không có `AUTH_SECRET` và cookie giả thiếu `htxCode`. `playwright.config.ts` đặt sẵn một `AUTH_SECRET` chỉ dùng cho e2e; một helper chung `tests/e2e/helpers/forged-session.ts` (HTX `TC`) thay các bản chép. Kết quả: không spec nào còn bị đưa về `/login` hay gặp thông báo NO_HTX. Trên toàn bộ các spec dùng dev server, số test qua tăng từ 24 lên 54; các test còn hỏng là do khẳng định cũ không còn khớp giao diện hoặc dữ liệu giả (không sửa, không nới khẳng định). Ba test của story 9-1 (`TC-9.1-04`, `N1`, `N2`) trước đây chỉ qua nhờ nhận 401 khi phiên không hợp lệ; nay phiên hợp lệ nên `page.request` gọi thẳng API thật (không đi qua `page.route`) và nhận 404/400/403. Danh sách chi tiết trong báo cáo Task 11.
- Số đo khi hoàn tất (hai vòng database sạch, `COMPOSE_PROJECT_NAME=dxos-clean`):
  - `make test`: 1.287 test web qua, 3 bỏ qua (1.290); `disease-api` 17; `scanner` 39; `dataops` 78; realm 13; `seed-test.sh` 19 PASS.
  - `make platform-smoke`: 124 PASS, 0 FAIL.
  - Trình duyệt: `core-tenant` 5, câu chuyện A3 1, ảnh chụp 36.
  - Ảnh lá chè tổng hợp trong câu chuyện được mô hình chè trả về qua gateway (`POST /predict?model=tea` trong log của `disease-api`) và vào hàng chờ cán bộ.
- Ảnh chụp 8 màn hình ưu tiên của §6.4 (duyệt bệnh tách thành hàng chờ và trang duyệt, nên 9 màn hình) ở 1280×800 và 390×844, sáng và tối: 36 ảnh, không tràn ngang, không chữ đè. CI chạy câu chuyện A3 và ảnh chụp trong job `platform-smoke` và tải ảnh lên thành artifact `priority-screens`.
