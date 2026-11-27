<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — GĐ0: Thanh lọc nhiễu, khoá rủi ro uy tín và chuẩn hoá ngôn ngữ chè

> **Trạng thái:** Đã triển khai trên nhánh `feat/phase0-trust-cleanup`, chưa gộp vào `main` (2026-11-28). Xem "Ghi chú sau triển khai" ở cuối.
> **Căn cứ:** [product-roadmap.md](../product-roadmap.md) §4, §5 (GĐ0), §6; [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md); [deviation-register.md](../deviation-register.md) DEV-007 đến DEV-016.
> **Yêu cầu của chủ dự án (2026-11-28):** "em thực hiện nhận làm giai đoạn 0 cho anh"; "thực hiện như bình thường, không cần quan tâm tới ngày đóng băng, dốc sức làm đạt kết quả tốt và nhanh".

## 1. Mục đích

Đưa hệ thống về trạng thái **trung thực 100%** trước người dùng thật của HTX chè. Có 4 việc:

1. Không còn màn hình, khối hay dữ liệu giả nào trên giao diện chính thức của 3 vai.
2. Vá các lỗ hổng tenant và bảo mật đã biết.
3. Đóng băng các phần ngoài luồng chuỗi giá trị chè mà không xoá mã.
4. Bỏ thuật ngữ lúa.

**Định nghĩa xong (DoD của roadmap):** 0 màn hình giả trên giao diện sản xuất, và kiểm thử tenant và bảo mật xanh 100%.

## 2. Mục tiêu, ngoài phạm vi, điều cấm

**Mục tiêu**
- G1. Gỡ mọi màn hình và khối mẫu khỏi 3 vai. Danh sách đầy đủ ở §4.1.
- G2. Gỡ dữ liệu thị trường giả và lệch miền (§4.2).
- G3. Vá DEV-007, DEV-008 (phần GĐ0) và lỗi nhật ký `REJECTED` trong DEV-010 (§4.3).
- G4. Hành động an toàn thực phẩm và tiền luôn cần người ký (`never`), và đóng băng 5 tính năng ngoài luồng (§4.4).
- G5. Gỡ 4 mẫu sổ trùng lõi khỏi `custom-books` (§4.5).
- G6. Thay thuật ngữ lúa bằng thuật ngữ chè (§4.6).
- G7. Tài liệu đi cùng mã (§4.7).

**Ngoài phạm vi (để các giai đoạn sau)**
- `cycle_id` trên nhật ký và lô, tự mở lứa mới, danh mục thuốc BVTV: GĐ1.
- Vai `accountant`, `platform_admin`, `htx_memberships`; chuyển cấu hình provider và ngân sách AI khỏi giao diện trưởng HTX: GĐ1.
- Gộp `/q` với `/lot`, chứng nhận lưu thật: GĐ2. GĐ0 chỉ gỡ tham số giả mạo `?status=` và gỡ khối chứng nhận giả.
- Gộp hai bảng điều hành, nối `tea-shop` với tồn kho `Lot`: GĐ3.
- Zalo, mô hình sâu bệnh chè Việt Nam: GĐ4.
- Không đổi enum `ParcelStatus` (`SOWING`...) trong CSDL. GĐ0 chỉ đổi nhãn hiển thị.

**Điều cấm (làm thế này là hỏng, dù chạy được)**
- Thay dữ liệu giả bằng dữ liệu giả khác, hoặc giấu nhãn "Mẫu" mà vẫn giữ nội dung giả.
- Xoá mã của tính năng **đóng băng**. Đóng băng nghĩa là tắt, không phải xoá.
- Làm hỏng chức năng đang chạy thật: nhật ký, duyệt, lịch thu hái, lô và QR, chẩn đoán, bản tin thật, thông báo, Kho ứng dụng, mini-app đang dùng, lớp đề xuất AI có người duyệt, Telegram.
- Để lại mục menu chết, link chết hoặc route trả lỗi 500 ở chỗ vừa gỡ.

## 3. Các cách đã cân nhắc

| Việc | Cách chọn | Cách khác và lý do không chọn |
|---|---|---|
| "Gỡ bỏ" (KILL) | **Xoá hẳn mã**: trang, component, test, tài sản tĩnh không còn ai dùng. Git giữ lịch sử. | Chỉ ẩn khỏi menu: route vẫn mở, mã chết vẫn phải bảo trì. |
| "Đóng băng" (FREEZE) | **Một công tắc môi trường `DXOS_LABS`, mặc định tắt.** Khi tắt: ẩn mục menu và tab, route web trả 404, agent bỏ qua job tương ứng. | (a) Chỉ không chạy container: menu và API trong web vẫn còn. (b) Mỗi tính năng một cờ: nhiều cấu hình mà không ai cần bật lẻ. |
| An toàn và tiền | **Sửa mức `autonomy` thành `never` ngay trong catalogue mã**, không đặt sau công tắc. | Chỉ tắt autopilot: trưởng HTX vẫn mở lại được; roadmap coi đây là luật bất biến. |
| Lỗ hổng | **Sửa ở gốc trong route hoặc use case, mỗi lỗ có test chặn tái phát.** | Chặn ở giao diện: không phải là bảo mật. |

Chủ dự án giao phần cách làm cho em ("dốc sức làm đạt kết quả tốt và nhanh"). Các lựa chọn trên là của em.

## 4. Thiết kế

### 4.1. Gỡ màn hình và khối giả (G1)

Tiêu chí kiểm được: thư mục `apps/web/src/components/features/sample/` không còn; `grep -r "features/sample\|SampleTag" apps/web/src` không còn kết quả; không màn hình nào của 3 vai hiện nhãn "Mẫu", "ví dụ" hay "demo".

| Vai | Hạng mục | Việc làm |
|---|---|---|
| Cả 3 vai | Reels (`app/{farmer,officer,manager}/reels`, `components/features/reels/`, `public/videos/shorts/`) | Xoá; bỏ mục menu "Reels" ở 3 layout. |
| Cán bộ KT | 6 trang Gian hàng/Tour: `app/officer/{products,orders,orders/[code],payments,tours,bookings}`, `components/features/officer-web/sample.ts`, `public/images/officer/products/*` | Xoá. Bỏ nhóm menu "Gian hàng & tour" (Sản phẩm, Đơn hàng, Tour, Lượt đặt tour, Doanh thu). Bỏ khối "Gian hàng & Tour" và các nhãn mẫu trên `/officer/dashboard`. Ghi chú mẫu trong `officer-web/parts.tsx` cũng đi theo. |
| Cán bộ KT | Hai chatbot rời ("Trợ lý TT" `/officer/assistant` và "Chatbot" `/officer/chat`) | Giữ **một** mục "Chatbot" (`/officer/chat`). Xoá route `/officer/assistant` và mục menu "Trợ lý TT", vì trợ lý thị trường đọc dữ liệu thị trường sẽ bị gỡ ở §4.2. |
| Nông dân | `CameraWatch` (4 camera giả) và `components/features/disease/sample-detections.ts` | Xoá; trang Chẩn đoán chỉ còn luồng chụp ảnh thật. |
| Nông dân | `TodayTasks` (việc cần làm mẫu) và khối "Báo cáo sâu bệnh" mẫu trên `/farmer/dashboard` | Xoá cả hai khối. |
| Nông dân | Bản tin: nhãn "Mẫu" trên tiêu đề, khối "Giá chè hôm nay" và "Đọc nhiều nhất" mẫu, bài mẫu `/farmer/bulletin/[id]` | Chỉ hiện bản tin thật (bảng `bulletins`); có trạng thái trống khi chưa có bản tin. Xoá khối giá và "đọc nhiều" mẫu. Xoá hoặc viết lại `[id]` để chỉ đọc bản tin thật; id không có trả 404. |
| Nông dân | Cẩm nang (`farmer/handbook`): nội dung là tài liệu tham khảo thật có nguồn PDF | Giữ nội dung và nguồn. Bỏ nhãn "Mẫu" và câu "biên soạn bởi cán bộ HTX" (không đúng sự thật), thay bằng câu nêu rõ nguồn. Khối lời khuyên theo tháng chỉ hiện khi có nội dung của tháng đó. |
| Nông dân | Mục menu "Chatbot" (`/farmer/ai`, API trả 403 với nông dân) và các lời mời dùng chatbot | Xoá route, mục menu và mọi nút hoặc link mời dùng chatbot trên màn hình nông dân. |
| Trưởng HTX | `SampleYieldChart` trên `/manager/dashboard` | Xoá. |
| Trưởng HTX | Nút "Tạo lô hàng" trên `/manager/dashboard`, dẫn tới `/manager/lots` không tạo được lô | Bỏ nút. Giữ link "In tem QR". |
| Trưởng HTX | `CertificateManager` (chứng nhận chỉ giữ trong bộ nhớ trình duyệt) trên `/manager/lots/[lot_code]` và `/manager/profile` | Gỡ khỏi hai trang cho tới GĐ2. Xoá component nếu không còn ai dùng. |
| Trưởng HTX | Ứng dụng mẫu (`SampleApps`) trong Kho ứng dụng | Xoá; khối "Ứng dụng do HTX tự tạo" có trạng thái trống thật. |
| Trưởng HTX | `PartnerFallback` (đối tác mẫu khi danh sách rỗng) trên Bản đồ đối tác | Xoá; hiện trạng thái trống. |
| Trưởng HTX | "Sơ đồ thửa minh hoạ" trong `FarmZoneReadOnly` | Khối này vẽ từ thửa thật: giữ, đổi tên thành "Sơ đồ thửa", bỏ nhãn "Mẫu", bỏ `style={{...}}` nội dòng. Nếu người làm thấy khối có dữ liệu bịa thì xoá. |
| Thông báo (mọi vai) | `SampleNotices` trong `NotificationInbox` | Xoá; dùng trạng thái trống đang có. |
| Công khai | `/forgot-pin` (form demo, OTP giả) | Xoá trang và form; bỏ khỏi danh sách đường dẫn công khai trong `middleware.ts`. Ở trang đăng nhập và `/unauthorized`, thay link bằng câu chữ: "Quên mã PIN? Hãy liên hệ cán bộ HTX để được đặt lại." |

**Tài sản tĩnh:** chỉ xoá ảnh hoặc video khi `grep` cho thấy không còn chỗ nào dùng. Ví dụ `public/images/officer/tour-*.jpg` đang được Cẩm nang dùng thì giữ.

**Test:** test của các phần bị xoá thì xoá theo. Test e2e hoặc visual đi qua các trang bị xoá phải sửa lại để không còn đi qua chúng. Không được xoá hay bỏ qua test của chức năng còn giữ.

### 4.2. Gỡ dữ liệu thị trường giả và lệch miền (G2)

- **Xoá workflow:**
  - `workflows/vietnam_market_sync.json` (`Math.random()`, source `Mô phỏng (Toàn quốc)`).
  - `workflows/worldbank_sync.json` (ngũ cốc).
  - `workflows/faostat_sync.json` (chỉ số sản xuất cây trồng và lương thực của World Bank).
  - `workflows/nasa_power_sync.json` (ghi cứng `28.5`).
  - `workflows/wto_tariffs.json` (thuế MFN).
- **`workflows/comtrade_export_sync.json`:** dữ liệu thật của Liên Hợp Quốc nhưng chủ yếu là lúa, cà phê, tiêu. Thu hẹp còn mã HS `0902` (chè).
- **Xoá dòng cũ:** thêm một migration Prisma xoá các dòng `market_data` do 5 workflow trên đã ghi. Lọc theo đúng giá trị `source` mà từng workflow ghi (người làm đọc trong từng tệp workflow), cộng các dòng comtrade không phải chè. Migration chỉ xoá theo `source` và `commodity` đã liệt kê, không xoá gì khác.
- **Xoá nhãn giá mô phỏng** (không còn dữ liệu mô phỏng): `apps/web/src/domain/market/simulated-price.ts` và mọi chỗ dùng nó, kể cả test `simulated-price.test.ts`.
- **Hiển thị:** `MarketSummaryWidget` và khối giá trên `/manager/dashboard` hiện số liệu còn lại hoặc trạng thái trống rõ ràng. Công cụ `market` trong chat Telegram và agent A5 `bulletin` vốn đã có nhánh "không có dữ liệu thì không chạy hoặc báo trống": kiểm tra lại, không cần sửa nếu đúng.
- **Không đổi:** `MARKET_REPORTS_ROOT` trong `document-namespace.ts` (tệp báo cáo cũ vẫn đọc được), `fx-rates-sync`, `weather-sync`, `bulletin-synthesis`, `officer-reminder`, `mattermost-push`, `system-error-alert`.

### 4.3. Vá lỗ hổng (G3)

| Lỗ hổng | Sửa | Test chặn tái phát |
|---|---|---|
| `GET /api/members` gọi được bằng vai nông dân, lộ danh sách và số điện thoại thành viên (DEV-007) | Chỉ `manager` và `officer`; nông dân nhận 403 `FORBIDDEN`. Rà mọi route `app/api/members/**` và ghi rõ vai được phép của từng route. | Farmer gọi được 403; manager và officer của HTX TC chỉ thấy thành viên TC. |
| `GET /api/search` cho nông dân tìm toàn HTX (DEV-007) | Nông dân nhận 403. Ẩn ô tìm kiếm toàn cục (`GlobalSearchInput` trong `TopBar`) với vai nông dân. | Farmer gọi được 403; TopBar của nông dân không có ô tìm kiếm. |
| `partners` không có tenant; `POST`/`PUT` chỉ kiểm tra phiên đăng nhập (DEV-007) | Migration thêm `htx_profile_id String?` (FK tới `htx_profiles`, có index). Mọi lần đọc và ghi lọc theo `htxProfileId` lấy từ `requireTenant()`, không bao giờ lấy từ body. Đọc: `manager`, `officer`. Ghi (tạo, sửa, xoá, geocode): chỉ `manager`. Dòng có `htx_profile_id` rỗng coi như không tồn tại (404). Seed gán 3 đối tác sẵn có cho HTX `TC`. Công cụ `partners` trong chat Telegram dùng cùng phạm vi. | Bảng test cross-tenant: officer TC đọc hoặc sửa đối tác của LB thì 404, không ghi gì; farmer thì 403; officer tạo thì 403. |
| `/q/[lot_code]` nhận `?status=` từ URL để đè trạng thái lô (DEV-008) | Xoá tham số. Trạng thái chỉ lấy từ dữ liệu lô. | `/q/<lô hợp lệ>?status=revoked` hiện đúng trạng thái thật. |
| Nhật ký `REJECTED` vẫn tính vào ngày cách ly (DEV-010) | Quy tắc chung: **một hoạt động tính vào ngày cách ly khi nhật ký của nó không ở trạng thái `DRAFT` hoặc `REJECTED`**. Nhật ký chờ duyệt vẫn tính. Áp dụng ở mọi chỗ đang tính: `approve-harvest-usecase.ts`, `CreateLotUseCase.ts`, `PrismaCropCycleRepository.ts` (trạng thái lịch thu hái), `app/farmer/dashboard/page.tsx` (số ngày cách ly còn lại), `PrismaCampaignCandidateSource.withdrawalRows`. Đưa quy tắc vào một hàm hoặc hằng dùng chung thay vì lặp 5 lần. Agent Python (A1, A4) nếu có tự tính thì áp cùng quy tắc. | Nhật ký phun bị từ chối không chặn duyệt thu hoạch hay tạo lô; nhật ký chờ duyệt vẫn chặn. |

### 4.4. An toàn và tiền luôn cần người ký; đóng băng 5 tính năng (G4)

**a) `never` (không có công tắc nào mở lại được)**
- `actions/harvest-approve.action.ts`: `autonomy: 'never'`.
- `actions/journal-approve.action.ts`: `autonomy: 'never'`. Đây là lựa chọn của em: nhật ký là hồ sơ an toàn thực phẩm.
- `app-actions/AppActionCatalog.ts`: hành động có `money: true` thì mức `'never'` (hiện là `'unlockable'`).
- Test mới khoá luật: mọi kind có `money` và hai kind trên phải là `never`. Sửa các test hiện dùng `harvest.approve` làm ví dụ kind mở khoá được (eligibility, autopilot service, tick, route, `AutopilotSection`) sang một kind còn `unlockable`.

**b) Công tắc `DXOS_LABS`**
- **Bật:** khi `DXOS_LABS` là `1` hoặc `true`. Giá trị trống hoặc khác thì tắt; tắt là mặc định.
- **Nơi đọc:** web, phía server, qua một hàm dùng chung duy nhất; và `dxos-agent` (Python).
- **Truyền cấu hình:** compose truyền biến cho `web` và `dxos-agent`. `.env.example` có dòng `DXOS_LABS=` kèm chú thích.

| Tính năng đóng băng | Khi tắt |
|---|---|
| Xưởng mini-app (A12/M13) | Ẩn tab và trang `/manager/ai/apps*` và nhãn "App do AI xây" trong Kho ứng dụng. Route `/api/agent/app-requests*` và `/api/internal/agent/app-builder/*` trả 404. Ý định chat `app.request` trả lời "chưa mở". Agent `app-builder` không chạy. |
| Tự vận hành (M12) | Ẩn mục "Tự vận hành" trong `/manager/ai/settings`. Route `/api/agent/autopilot*` và `/api/internal/autopilot/tick` trả 404. Agent không gọi tick. Lệnh Telegram `/tuvanhanh` trả lời "chưa mở"; `/dung` vẫn dừng được để an toàn. |
| Agent chiến lược (A11) | Route `/api/internal/agent/strategy/*` trả 404; agent `strategy` không chạy. |
| MCP (M14) | Route `/api/mcp/*` trả 404. |
| Nhân sự (A8/M10, `staff-desktop`, `staff-mobile`) | Route `/api/internal/staff/*` trả 404; agent `staff-tasks` không chạy. |

- **`apps/hub-mobile`:** đóng băng bằng tài liệu, không có trong cấu hình triển khai chuẩn.
- **Không đóng băng ở GĐ0** (roadmap chưa phân xử): chiến dịch ngày (A9) và cải tiến tuần (A10).
- **Test:**
  - Unit: khi tắt, từng route trên trả 404 và menu không có mục đóng băng; khi bật, hành vi như cũ.
  - Các test sẵn có của tính năng đóng băng chạy với `DXOS_LABS=1`, để mã đóng băng vẫn được kiểm.
  - CI: các job smoke đang kiểm tính năng đóng băng (Builder Smoke, Platform Smoke) đặt `DXOS_LABS=1`.

### 4.5. Gỡ 4 mẫu sổ trùng lõi khỏi `custom-books` (G5)

- **Gỡ khỏi `TEMPLATES`** (`miniapps/custom-books/custom_books/book_templates.py`) 4 khoá: `picking`, `spraying`, `fertilising`, `pest`. Còn lại: `cashbook`, `meeting`, `handover`, `visitors`, `blank`.
- **Cập nhật mọi chỗ còn nhắc 4 khoá đó:**
  - enum `template` của hành động `book.create` và câu mô tả, `store.about` trong `miniapps/custom-books/app.yaml`;
  - `miniapps/custom-books/README.md`;
  - hằng `BOOK_TEMPLATES` trong `apps/web/src/application/appbuilder/AppBuilderAgentService.ts`;
  - test Python của app và của `platform/agent` (app builder);
  - `platform/tests/smoke-apps.sh` (đang tạo sổ từ `picking`: đổi sang `meeting`);
  - các spec e2e và visual dùng "Chấm công hái chè".
- **Ảnh chụp cửa hàng:** chụp lại bằng `apps/web/tests/tools/store-screenshots.spec.ts` nếu ảnh hiện có cho thấy một trong 4 mẫu đã gỡ.
- **Phiên bản:** `version: 0.3.0`.
- **Sổ đã tạo từ 4 mẫu:** vẫn chạy như sổ thường, vì mẫu chỉ là thiết kế ban đầu và không lưu vào sổ. Không xoá dữ liệu của HTX.
- **Đề xuất AI cũ:** đề xuất `book.create` còn mở với khoá đã gỡ sẽ bị từ chối khi duyệt (lỗi kiểm tra payload). Đó là hành vi chấp nhận được.

### 4.6. Thuật ngữ chè (G6)

- **Đổi nhãn hiển thị:**
  - `SOWING`: từ "Gieo sạ" sang **"Trồng mới"**, ở mọi bảng nhãn trong `apps/web/src` và `platform/agent`, nếu có.
  - "thửa ruộng" sang **"nương chè"**.
  - Ví dụ địa chỉ "Ấp 3, Xã Long Hòa" sang **"Xóm Hồng Thái, xã Tân Cương"**.
- **Mở rộng test nội dung `no-rice-copy`:** cấm thêm `Gieo sạ`, `thửa ruộng`, `Ấp ` trong mã nguồn (không tính test và tài liệu lịch sử).

### 4.7. Tài liệu đi cùng mã (G7)

Làm thành một việc riêng sau khi gộp các nhánh việc, để các nhánh không cùng sửa một tệp tài liệu.

- `CHANGELOG.md` (mục Unreleased).
- `docs/deviation-register.md`: cập nhật trạng thái DEV-007, DEV-008 (phần GĐ0), DEV-009, DEV-010 (phần `REJECTED` và thuật ngữ), DEV-014, DEV-016 (phần đóng băng).
- `docs/rules-and-limits.md`:
  - §3.2 thêm quy tắc `REJECTED`;
  - §4.2 thêm các dòng members, search, partners;
  - ghi §3.14, §3.15, §3.17, §3.20, §3.21 là đóng băng sau `DXOS_LABS`;
  - ghi luật `never` cho an toàn thực phẩm và tiền.
- `docs/database-schema.md`: thêm cột `partners.htx_profile_id`.
- `docs/api-contract.md`: ghi vai của members, search, partners và các route đóng băng.
- `docs/miniapps.md` và README của `custom-books`: danh sách mẫu mới.
- `docs/dev-setup.md`: biến `DXOS_LABS`; bỏ các workflow đã xoá khỏi danh sách import, nếu có.
- `docs/timelines/2026-11-28.md`: thêm một mục nhật ký.

## 5. Ràng buộc

- **Quy tắc dự án** (`AGENTS.md`, `docs/rules-and-limits.md`): định danh tiếng Anh, chữ tiếng Việt chỉ ở nội dung hiển thị; không `style` nội dòng mới; màu qua token; sáng và tối nhất quán; không tràn ngang ở 390 px; không chồng chữ.
- **Migration:** chỉ thêm, không mất dữ liệu ngoài các dòng `market_data` đã liệt kê. Viết cả SQL init nếu bảng có trong `platform/postgres/init` (không áp cho `partners`, `market_data`, vốn là bảng Prisma). Không chạy migration trên stack của chủ dự án khi chưa được đồng ý.
- **Kiểm toán:** không bỏ trigger `audit.events` hay kiểm tra tenant nào. `partners` hiện không có trigger kiểm toán; GĐ0 không thêm.
- **Hasura:** không đổi metadata (`partners` vẫn không được expose).
- **Commit:** Conventional Commits tiếng Anh, danh tính `maiychrus25`, không có dòng đồng tác giả AI. Commit nhỏ theo từng việc.

## 6. Kiểm chứng trước khi báo xong

1. `make build`, `make test`, `make lint` xanh; `bash scripts/validate-structure.sh` báo `[OK]`; `bash scripts/appkit-sync.sh --check` sạch; test Python của `custom-books` và `platform/agent` xanh.
2. `grep` theo §4.1, §4.6: không còn `features/sample`, `SampleTag`, "Gieo sạ", "thửa ruộng", nhãn "demo"; không còn route `reels`, `forgot-pin`, `officer/{products,orders,payments,tours,bookings,assistant}`, `farmer/ai`.
3. Hai vòng kiểm tra giao diện bằng trình duyệt headless:
   - ở 1366 px và 390 px, nền sáng và tối;
   - đi hết các trang trong menu của 3 vai;
   - không còn lỗi 500, không tràn ngang, không còn mục menu chết, không còn nhãn "Mẫu".
4. CI của PR xanh 10/10 trên đúng commit được gộp.
5. Đo RAM của stack chuẩn (`make up-core` và `make platform-up` rồi `make stop-extras`) và ghi vào nhật ký. Roadmap đặt đích 6–8 GB.

## 7. Quyết định bổ sung sau lượt đọc thử

Một lượt đọc thử với vai người làm đã nêu 7 câu hỏi. Tất cả đều trả lời được từ dự án hoặc là lựa chọn của em; không câu nào phải hỏi chủ dự án.

1. **Đối tác đã có trên các stack đang chạy:**
   - Migration gán `htx_profile_id` cho mọi dòng `partners` đang rỗng: gán cho HTX có `htx_code = 'TC'` nếu HTX đó tồn tại; nếu không có `TC` mà CSDL chỉ có đúng một HTX thì gán cho HTX đó; còn lại để rỗng, tức là ẩn.
   - Lý do: đến nay chỉ có dữ liệu demo, chưa có HTX thật nào nhập đối tác.
   - Cột vẫn cho phép rỗng, giống `households.htx_profile_id`. (Lựa chọn của em.)
2. **Kind đã mở khoá trước đó:** sau khi chuyển `never`, `autoEligibility` và route bật autopilot đều từ chối kind đó. Thêm một câu lệnh idempotent trong `platform/postgres/init/08-agent.sql` gỡ `harvest.approve`, `journal.approve` và mọi kind `app.%` có `money` khỏi `platform.autopilot.unlocked_kinds`, để dữ liệu không còn trạng thái thừa. Test mẫu thay `harvest.approve` bằng `miniapp.install` (vẫn `unlockable`, không bị đóng băng). Test của `AutopilotSection` chạy với `DXOS_LABS=1`.
3. **Công tắc `DXOS_LABS` và trạng thái đã có:**
   - Chỉ ẩn **xưởng** (giao diện, route tạo yêu cầu, agent `app-builder`). Mini-app đã xây và đã cài vẫn chạy bình thường trong Kho ứng dụng. Nhãn hoặc link "App do AI xây" trỏ tới báo cáo build (trang bị 404) thì ẩn.
   - Trạng thái autopilot đã lưu bị bỏ qua khi tắt, vì không có tick nào chạy. `/dung` vẫn trả lời và ghi dừng như cũ.
   - Agent đóng băng **không được lên lịch**, thay vì lên lịch rồi chạy rỗng.
4. **Trạng thái nhật ký:** chuỗi tự do, có các giá trị `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `REQUEST_CHANGES`. Quy tắc giữ như §4.3: chỉ `DRAFT` và `REJECTED` không tính. `REQUEST_CHANGES` vẫn tính, vì lần phun có thể đã xảy ra. Phía Python chỉ `agents/harvest_ready.py` tự tính (đang lọc `status != DRAFT`); thêm loại `REJECTED` ở cả truy vấn GraphQL lẫn vòng lọc.
5. **Phạm vi tenant:** `requireTenant()` luôn trả đúng một HTX lấy từ claim `htx_code` của token; mỗi tài khoản thuộc một HTX. Không có quan hệ cán bộ nhiều HTX ở GĐ0.
6. **Xoá `market_data`:**
   - Chỉ xoá dòng có `source` riêng của 5 workflow bị xoá, cộng các dòng comtrade có `commodity` không phải chè.
   - Không xoá dòng nào của workflow còn giữ.
   - Xoá không hoàn tác được là chấp nhận được, vì dữ liệu này giả hoặc lệch miền.
   - Chỉ chạy trên stack của chủ dự án khi được đồng ý.
7. **Phạm vi kiểm tra nhãn ở §4.1 và §4.6:** chỉ mã nguồn hiển thị trong `apps/web/src`, không tính `__tests__`, test e2e và tài liệu lịch sử trong `docs/`. `FarmZoneReadOnly` và Cẩm nang bỏ nhãn như §4.1, nên `grep` vẫn phải sạch.

## 8. Phần để người làm tự quyết

Người làm tự quyết các chi tiết sau, miễn đúng các quy tắc trên:
- Tên và vị trí của hàm đọc `DXOS_LABS` và của quy tắc trạng thái tính cách ly.
- Câu chữ trạng thái trống.
- Cách chia commit.

## Ghi chú sau triển khai

Mã khác đặc tả ở các điểm sau; mã là căn cứ:

- Route tick của autopilot là `/api/internal/agent/autopilot/tick` (đặc tả §4.4 ghi `/api/internal/autopilot/tick`).
- Không có route geocode riêng cho đối tác; việc geocode nằm trong `POST /api/partners` (phía server, qua Nominatim), chỉ `manager`.
- Trang `/farmer/bulletin-notifications` được giữ, chỉ còn thẻ liên kết sang `/farmer/bulletin`.
- `/forgot-pin` không còn là trang riêng, và người chưa đăng nhập vào đường dẫn này được chuyển về `/login`.
- Liên kết trong kết quả tìm kiếm theo vai của người tìm.
- Cán bộ KT chỉ giữ một chatbot (`/officer/chat`), đúng §4.1.
- `custom-books` lên 0.3.0 và `htx-dashboard` lên 0.3.1 (bỏ phần còn lại của giá mô phỏng, dùng thuật ngữ chè).
- Hai migration Prisma mới: `20261128100000_partners_tenant` và `20261128110000_purge_market_data`.
- `DXOS_LABS` khoá 21 route (xưởng mini-app 9, tự vận hành 4, chiến lược 2, MCP 2, nhân sự 4), cùng các trang và tab nêu ở §4.4.
- Ảnh cửa hàng `miniapps/custom-books/store/*.png` chưa chụp lại vì cần stack đang chạy; ghi trong `docs/dev-setup.md` như việc còn lại.
