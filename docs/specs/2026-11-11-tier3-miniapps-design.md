<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Tầng 3: App Manifest, CLI `dxos` và mini-app

> **Trạng thái:** Bản thiết kế, chờ chủ dự án duyệt (2026-11-11).
> **Phạm vi:** Tầng 3 (milestone `v1.8.0`). Tiếp nối Tầng 2b (`docs/specs/2026-11-10-tier2b-tea-domain-design.md`, đã phát hành `v1.7.0`).
> **Căn cứ:** Kế hoạch dự thi OLP 2026 (DX-OS Open-Core): mô hình cắm thêm mini-app qua App Manifest và CLI là điểm độc đáo chính của bài dự thi.

## 1. Mục tiêu

1. Công bố một chuẩn App Manifest (`app.yaml`) để HTX hoặc nhà phát triển bên ngoài viết mini-app mà không sửa lõi.
2. CLI `dxos` cài, gỡ, liệt kê và kiểm tra mini-app. Cài hoặc gỡ không build lại lõi, lỗi giữa chừng được hoàn tác.
3. Mini-app "Đặt tour đồi chè" (`tea-tour`) chạy thật cho ba vai trò: khách du lịch, ban quản trị HTX, nông hộ dẫn tour.
4. Mini-app mẫu `hello` giúp người mới viết mini-app đầu tiên.
5. Toàn bộ chức năng đang chạy được giữ nguyên; lõi chạy bình thường khi không cài mini-app nào.

**Thước đo khi demo:** chạy `./dxos install miniapps/tea-tour`, mục "Tour đồi chè" hiện trong menu đúng vai trò. Ban quản trị tạo tour, khách đặt chỗ trên điện thoại, ban quản trị xác nhận, nông hộ thấy lịch dẫn. Chạy `./dxos remove tea-tour`, app biến mất và lõi vẫn chạy.

## 2. Hiện trạng liên quan

- **Cổng API:** APISIX 3.19 chạy chế độ khai báo từ `platform/gateway/apisix.yaml` (mount chỉ đọc). Route có đăng nhập dùng `openid-connect` với `bearer_only` và Keycloak realm `agrimarket`. Cổng nội bộ `9081` bỏ qua giới hạn theo IP.
- **Dữ liệu:** Hasura v2.51.4 đọc theo quyền từng dòng bằng claim `htx_code`. Metadata nằm ở `platform/hasura/metadata`. Web đọc qua các reader trong `apps/web/src/infrastructure/core/*`.
- **Token:** web giữ access token phía server và lấy qua `getCoreToken()` (`apps/web/src/lib/auth/core-token.ts`).
- **Compose:** mọi dịch vụ nằm trên mạng `agrimarket-net`. Các dịch vụ Python (`disease-api`, `dxos-scanner`, `dxos-dataops`) là mẫu cho mini-app.
- **Chưa có:** khái niệm mini-app, manifest, CLI hay bảng ứng dụng đã cài.

## 3. Quyết định đã chốt

| Chủ đề | Quyết định | Lý do |
| --- | --- | --- |
| Phạm vi | Một mini-app hoàn chỉnh (`tea-tour`) và một mẫu tối giản (`hello`) | Điểm chính là chuẩn manifest và màn cài/gỡ trực tiếp, không phải số lượng app; dành thời gian cho PoF |
| Người dùng `tea-tour` | Khách công khai, ban quản trị, nông hộ dẫn tour | Chứng minh manifest khai báo được cả route công khai và route theo vai trò |
| Kiến trúc | Mỗi mini-app là một service riêng (container, schema Postgres, route gateway) | Cắm–rút thật, không build lại lõi; dùng trọn lõi Tầng 1 |
| Đăng nhập | Web proxy gắn token phía server, APISIX kiểm `bearer_only` | Dùng lại cơ chế Tầng 2a; không cần client Keycloak riêng cho từng app |
| Dữ liệu app | Schema `app_<id>` với DB role riêng, không đọc bảng lõi; dữ liệu lõi lấy qua Hasura bằng token người dùng | Tách hẳn khỏi lõi; quyền theo HTX của lõi tự áp dụng |
| Giao diện app | Render phía server, chỉ HTML và form, không JavaScript; hiện trong iframe sandbox | App không đọc được cookie hay DOM của ứng dụng chính |
| Ngôn ngữ app và CLI | Python 3.12; app dùng FastAPI và Jinja2 | Cùng họ với `disease-api`, `dxos-scanner`, `dxos-dataops` |

## 4. App Manifest (`app.yaml`)

Chuẩn được công bố tại `platform/apps/manifest.schema.json` (JSON Schema). Ví dụ của `tea-tour`:

```yaml
apiVersion: dxos/v1
id: tea-tour                 # ^[a-z][a-z0-9-]{1,30}$, duy nhất
name: Đặt tour đồi chè
version: 0.1.0               # SemVer
license: MIT                 # SPDX, phải thuộc danh sách OSI của CLI
publisher: OpenTea Developers
requires: { core: ">=1.8.0" }
runtime:
  build: .                   # hoặc image: <ref>@sha256:<digest>
  port: 8080
  health: /healthz
database:                    # tuỳ chọn
  migrations: migrations/
routes:
  public: [/public/]         # → /apps/tea-tour/public/*, không đăng nhập
  protected:
    /: [manager, officer, farmer]
menu:
  - { label: Tour đồi chè, path: /, roles: [manager] }
  - { label: Lịch dẫn tour, path: /guide, roles: [farmer] }
```

**CLI từ chối manifest khi:**
- sai schema hoặc `id` đã được cài;
- giấy phép không thuộc danh sách OSI;
- phiên bản lõi không thoả `requires.core` (phiên bản lõi lấy từ `apps/web/package.json`);
- `image` không ghim digest;
- đường dẫn route hoặc menu có `..`, `//` hay ký tự ngoài `[a-z0-9/_-]`;
- vai trò ngoài `farmer`, `officer`, `manager`;
- manifest có trường nằm ngoài schema, ví dụ cổng ra máy chủ, volume hay quyền container (`additionalProperties: false`).

## 5. CLI `dxos`

**Vị trí:**
- Mã nguồn ở `platform/cli/` (Python 3.12, thư viện chuẩn, PyYAML, jsonschema, psycopg).
- Chạy trong container `dxos-cli` (profile `tools`) trên mạng compose.
- Script `./dxos` ở gốc repo gọi container rồi bật hoặc tắt container của app bằng `docker compose`.
- Script không cần mở thêm cổng và không mount docker socket vào container.

**Lệnh:**
- `dxos validate <dir>`: chỉ kiểm tra manifest; dùng được trong CI.
- `dxos install <dir>`: năm bước, theo thứ tự:
  1. **Kiểm tra manifest** (§4).
  2. **Database** (nếu khai `database`):
     - tạo schema `app_<id>` và role `app_<id>` chỉ có quyền trên schema đó;
     - chạy migration theo thứ tự tên tệp, ghi vào `app_<id>.schema_migrations`;
     - kiểm tra mọi bảng của app có cột `htx_code NOT NULL`.

     Mật khẩu role sinh ngẫu nhiên và ghi vào `docker/runtime/apps/<id>.env` (git-ignored, quyền 600).
  3. **Gateway:**
     - sinh đoạn route `docker/runtime/gateway/apps/<id>.yaml`;
     - ghép với `platform/gateway/apisix.yaml` thành `docker/runtime/gateway/apisix.yaml`, là tệp APISIX thực sự đọc;
     - APISIX nạp lại khi tệp đổi.

     Tệp đang được git theo dõi không bao giờ bị sửa.
  4. **Container:** sinh `docker/runtime/apps/<id>.compose.yml` từ manifest với các thiết lập cố định (§6), rồi `./dxos` chạy `up -d --wait`.
  5. **Đăng ký:** ghi một dòng vào `platform.installed_apps` (id, phiên bản, manifest dạng JSON, thời điểm cài).

  Mỗi bước idempotent. Một bước hỏng thì các bước trước được hoàn tác theo thứ tự ngược lại. Không hoàn tác dữ liệu: schema mới tạo trong lần cài hỏng thì bị xoá, schema có từ trước thì giữ nguyên.
- `dxos remove <id> [--purge]`:
  - tắt container, gỡ route và xoá dòng đăng ký;
  - mặc định giữ schema, role và tệp env;
  - `--purge` xoá cả ba.
- `dxos list`: liệt kê app đã cài cùng phiên bản và trạng thái container.

**Khi chưa cài app nào:** `make platform-up` sinh `docker/runtime/gateway/apisix.yaml` giống hệt tệp gốc, nên lõi chạy như trước.

## 6. Bảo mật mini-app

1. **Đăng nhập:**
   - Web proxy `/apps/<id>/...` gắn access token của người dùng (lấy bằng `getCoreToken()`) rồi gửi tới cổng nội bộ của APISIX.
   - APISIX kiểm token bằng `openid-connect` `bearer_only` và vai trò khai trong manifest, sau đó chuyển cho app.
   - App đọc claim (`sub`, `htx_code`, vai trò, tên) từ token đã được gateway kiểm.
2. **Mạng:**
   - Container của app chỉ nằm trên mạng `dxos-apps-net`, mạng này chỉ có `apisix` và `postgres`.
   - App không gọi được dịch vụ lõi nào khác và không nhận request từ dịch vụ nào ngoài gateway.
   - Ranh giới tin cậy: app tin token do gateway chuyển tới, vì chỉ gateway với tới được app.
3. **Container:**
   - `read_only`, `tmpfs: /tmp`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`;
   - giới hạn 256 MB RAM và 0,5 CPU;
   - không có cổng ra máy chủ;
   - chạy bằng user không phải root.
4. **Dữ liệu:**
   - Role của app chỉ có quyền trên schema `app_<id>`. Có test chứng minh role này không đọc được bảng lõi.
   - Mọi truy vấn của app lọc theo `htx_code` lấy từ token.
5. **Route công khai:**
   - không gắn token;
   - giới hạn 10 request/phút cho mỗi IP;
   - app tự validate dữ liệu vào.
6. **Giao diện:**
   - Trang có đăng nhập hiện trong `<iframe sandbox="allow-forms allow-same-origin allow-top-navigation-by-user-activation">`, không có `allow-scripts`.
   - Web gửi header CSP `script-src 'none'` cho mọi phản hồi dưới `/apps/`.
7. **Proxy của web:**
   - chỉ chuyển tiếp tới `id` có trong `platform.installed_apps`;
   - từ chối đường dẫn có `..` hoặc mã hoá tương đương;
   - bỏ các header `cookie`, `authorization` và `x-hasura-*` do trình duyệt gửi;
   - chỉ gắn token cho đường dẫn không thuộc `routes.public`.

## 7. Mini-app `tea-tour`

**Ban quản trị HTX (`manager`):**
- Tạo, sửa, huỷ tour. Mỗi tour có tên, ngày giờ, điểm hẹn, số chỗ (1–50), giá (VND), mô tả, và người dẫn tour.
- Người dẫn chọn trong danh sách nông hộ của HTX, lấy qua Hasura bằng token người dùng.
- Xem lượt đặt của từng tour; xác nhận hoặc huỷ từng lượt.

**Khách du lịch (công khai):**
- `/apps/tea-tour/public/<htxCode>` liệt kê tour sắp diễn ra kèm số chỗ còn trống.
- Form đặt chỗ gồm họ tên, số điện thoại Việt Nam, số người (1–10) và ghi chú.
- Đặt thành công thì nhận mã đặt chỗ; tra cứu bằng mã và số điện thoại.
- Không có thanh toán.
- Trừ chỗ trong một transaction có khoá dòng tour, nên đặt đồng thời cũng không bán vượt số chỗ.

**Nông hộ dẫn tour (`farmer`):** trang `/guide` hiện các tour mình được gán, kèm số khách đã xác nhận.

**Dữ liệu:**
- Bảng `tours` và `bookings` trong `app_tea_tour`, đều có `htx_code`.
- Số điện thoại khách chỉ ban quản trị của đúng HTX xem được.

## 8. Mini-app `hello`

- Khoảng 50 dòng Python, chỉ dùng thư viện chuẩn. Manifest không khai `database`.
- Một mục menu cho mọi vai trò. Trang hiện "Xin chào <tên>, HTX <mã>, vai trò <vai trò>".
- README của app là hướng dẫn viết mini-app đầu tiên.

## 9. Tích hợp vào ứng dụng H-P-D-I

- **`platform.installed_apps`:**
  - tạo bằng `platform-init`;
  - Hasura cho mọi vai trò quyền chọn các cột `id`, `name`, `version`, `menu`;
  - mini-app dùng chung cho mọi HTX.
- **Sidebar:** đọc danh sách app qua một reader mới và hiện mục menu theo vai trò. Khi lõi lỗi thì không hiện mục app, các mục khác vẫn hiện.
- **Trang `/apps/<id>/[...path]`:** trang có đăng nhập hiện khung ứng dụng cùng iframe trỏ tới proxy. Trang công khai hiện toàn màn hình qua proxy.
- **Giao diện chung:**
  - `apps/web/public/dxos-app.css` chứa token màu, chữ, nút và form. Có test kiểm tra token khớp `globals.css`.
  - Chế độ sáng/tối truyền vào app qua `?theme=light|dark`. Không có tham số thì theo cài đặt hệ thống.

## 10. Kiểm thử

| Lớp | Nội dung |
| --- | --- |
| CLI (pytest) | Từng lý do từ chối manifest ở §4; rollback khi hỏng ở từng bước; idempotent khi cài lại; `--purge` |
| `tea-tour` (pytest, Postgres tạm) | 20 lượt đặt đồng thời vào tour 5 chỗ: đúng 5 thành công; token TC không thấy tour LB; validate form; số điện thoại chỉ manager xem; role của app không đọc được bảng lõi |
| Web (Jest) | Proxy: chỉ app đã cài, chặn traversal, bỏ header của trình duyệt, chỉ gắn token cho route có đăng nhập, CSP; Sidebar theo vai trò; `dxos-app.css` khớp token |
| Tích hợp (`make apps-smoke`) | Trên `dxos-clean`: cài `hello` và `tea-tour`; route 200 khi có token, 401 khi không; dòng `installed_apps`; cài lại idempotent; gỡ: route 404 và smoke lõi vẫn 124 PASS; `--purge` xoá schema và role |
| Trình duyệt | Câu chuyện tour: manager tạo tour và gán nông hộ, khách đặt ở 390 px, manager xác nhận, nông hộ thấy lịch, gỡ app thì menu biến mất. Spec chụp màn hình thêm trang app ở sáng và tối |

**CI:**
- Thêm pytest cho CLI và `tea-tour`.
- `platform-smoke` chạy thêm `apps-smoke` và spec tour.
- `dxos validate` chạy cho mọi thư mục trong `miniapps/`.

## 11. Tài liệu

- `docs/miniapps.md`: hướng dẫn viết mini-app.
- `platform/apps/manifest.schema.json`: chuẩn manifest.
- `docs/adr/0002-miniapp-architecture.md`.
- README thêm mục mini-app, CHANGELOG ghi đầy đủ.
- `DEPENDENCIES.md` ghi thư viện mới: FastAPI, Jinja2, psycopg, jsonschema, PyYAML, kèm giấy phép.

## 12. Kế hoạch demo

Nối tiếp câu chuyện A3, khoảng 3 phút:
1. Chạy `./dxos install miniapps/tea-tour`. Image đã build sẵn nên dưới 30 giây.
2. Mục "Tour đồi chè" hiện ra; ban quản trị tạo tour.
3. Khách quét QR, đặt chỗ trên điện thoại.
4. Ban quản trị xác nhận lượt đặt.
5. Chạy `./dxos remove tea-tour`; lõi vẫn chạy.

## 13. Tiêu chí hoàn thành

1. Bốn lệnh `validate`, `install`, `remove`, `list` chạy đúng, có rollback.
2. Câu chuyện tour chạy trọn trên trình duyệt thật.
3. Lõi không có mini-app vẫn qua toàn bộ smoke và spec trình duyệt hiện có.
4. `make build`, `make test`, `make lint` đều xanh; CI xanh.
5. Phát hành `v1.8.0` khoảng ngày 25/11, trước hạn chốt tính năng 02/12.

**Điểm cắt nếu trễ, theo thứ tự:**
1. Đồng bộ chế độ tối vào iframe (vẫn theo cài đặt hệ thống).
2. Trang lịch dẫn tour của nông hộ.
3. Phần trau chuốt cho `hello`.

**Không cắt:** chuẩn manifest, bốn lệnh CLI, rollback, các ràng buộc bảo mật ở §6, luồng đặt tour của ban quản trị và khách.

## 14. Rủi ro

| Rủi ro | Cách xử lý |
| --- | --- |
| Proxy Next.js không chuyển đúng form POST, redirect và header qua APISIX | Task đầu của plan dựng proxy với `hello` để kiểm sớm |
| APISIX chế độ khai báo không nạp lại khi tệp ghép thay đổi | Kiểm trong task đầu; nếu không nạp, CLI gọi `apisix reload` trong container |
| Thời gian build image `tea-tour` làm lệnh cài chậm khi demo | Build sẵn trước buổi demo; manifest hỗ trợ `image` ghim digest |
| Dữ liệu cá nhân của khách (họ tên, số điện thoại) | Chỉ ban quản trị đúng HTX xem; `--purge` xoá toàn bộ; ghi rõ trong README |
