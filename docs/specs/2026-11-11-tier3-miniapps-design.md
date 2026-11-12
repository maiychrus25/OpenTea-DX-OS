<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Tầng 3: App Manifest, CLI `dxos` và mini-app

> **Trạng thái:** Đã phát hành `v1.8.0` (2026-11-12). Xem "Ghi chú sau triển khai 3" ở cuối.
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

## Ghi chú sau triển khai 3

Phần này ghi chỗ code khác đặc tả và các số đo được khi hoàn tất Tầng 3 (nhánh `feat/tier3-miniapps`, 2026-11-11). Thân đặc tả ở trên giữ nguyên. Hướng dẫn cho người viết app nằm ở `docs/miniapps.md`, quyết định kiến trúc ở `docs/adr/0002-miniapp-architecture.md`.

**Các ruling (R1–R24).**
- **R1:** web đọc `platform.installed_apps` bằng Prisma `$queryRaw`, không thêm metadata Hasura, vì request công khai không có token và bảng là dữ liệu nền tảng, không thuộc HTX nào.
- **R2:** giới hạn 10 request/phút/IP của route công khai nằm ở web proxy, không ở APISIX, vì APISIX chỉ thấy IP của container web trên cổng `9081`. Bộ đếm theo IP của `/api/register` được tách ra `apps/web/src/lib/ip-rate-limit.ts` để dùng chung.
- **R3:** APISIX kiểm vai trò bằng `openid-connect.claim_schema` trên `realm_access.roles`. `tea-tour` chỉ cấp `/` cho `manager` và `/guide` cho `farmer` (ít quyền nhất), không cấp cả ba vai trò như ví dụ ở §4.
- **R4:** rủi ro §14 được kiểm ở Task 2 (APISIX nạp lại tệp route) và Task 5 (proxy), cả hai trước phần database và `tea-tour`.
- **R5:** tệp gateway được ghép bằng văn bản. Không có app thì giữ nguyên từng byte của tệp gốc. Có app thì route được nối vào khoá `routes:` cuối và dùng `<<: *oidc`, để không chép secret.
- **R6:** `dxos-cli` chạy bằng user của máy chủ (`--user "$(id -u):$(id -g)"`), để ghi được `docker/runtime` trên Linux. Image vẫn mặc định chạy user không phải root.
- **R7:** `version` của web được nâng lên `1.8.0` từ Task 4, task đầu tiên cài một app cần `requires.core: ">=1.8.0"`. Commit phát hành chỉ còn thêm tiêu đề CHANGELOG.
- **R8:** Makefile và `./dxos` tạo trước các thư mục runtime, để Docker không tạo chúng với chủ root.
- **R9:** `dxos-apps-net` là mạng `internal: true`, nên app không ra được internet.
- **R10:** apisix mount `${DXOS_GATEWAY_FILE:-../platform/gateway/apisix.yaml}`, và make cùng `./dxos` đặt biến này. Bản phát hành và `docker compose up` trần dùng tệp gốc, không có route app nào. v1.8.0 chưa cài được mini-app từ bản phát hành.
- **R11:** tệp gateway được ghi đè an toàn (cắt rỗng trước khi ghi). Manifest bị từ chối khi một tiền tố vừa công khai vừa cần đăng nhập. `gateway-sync` từ chối route nằm ngoài `/apps/<id>/` hoặc có id sai mẫu.
- **R12:** `build.context` của compose app lấy theo thư mục của app (tương đối với repo), không cố định `../miniapps/<id>`.
- **R13:** trạng thái runtime tách theo compose project: `docker/runtime/${COMPOSE_PROJECT_NAME:-docker}/`, sau khi một vòng sạch `dxos-clean` từng để lọt route vào stack của chủ dự án.
- **R14:** IP của client đọc giống hệt `/api/register`, chỉ từ `X-Forwarded-For`.
- **R15:** trang khung `/<role>/apps/<id không có>` hiện trang 404 với HTTP 200 (soft 404), giống các trang `/lot`, `/q`, `/htx` hiện có. Proxy `/apps/<id>` trả 404 thật.
- **R16:** migration chạy trên một kết nối đăng nhập bằng role của app, không chạy trên kết nối superuser với `SET LOCAL ROLE`, vốn để lọt `RESET ROLE` hay `COMMIT`.
- **R17:** `PUBLIC` vẫn giữ quyền `CONNECT` vào các database khác (`keycloak`, `postgres`, `template1`) trong v1.8.0.
- **R18:** web proxy trả 403 cho form gửi chéo trang tới mini-app: `Origin` khác origin của web, hoặc không có `Origin` mà có `Sec-Fetch-Site: cross-site`.
- **R19:** có thêm chức năng sửa tour, vì §7 ghi "Tạo, sửa, huỷ tour" trong khi plan bỏ sót. Số chỗ không giảm được dưới số đã đặt.
- **R20:** `tea-tour` giữ tối đa 8 kết nối DB đồng thời bằng `threading.BoundedSemaphore`, dưới `CONNECTION LIMIT 10` của role. Khi bận, app trả trang 503 tiếng Việt thay cho lỗi 500.
- **R21:** thứ tự trong CI là cài `tea-tour`, câu chuyện, ảnh chụp, gỡ, kiểm tra sau khi gỡ, rồi `apps-smoke`, để `apps-smoke` kết thúc bằng `platform-smoke` trên stack không có app.
- **R22:** `screens.spec` vẫn đăng nhập bằng tài khoản demo `farmer_tc` như từ Tầng 2b; spec chỉ đăng nhập, không đổi mật khẩu hay TOTP.
- **R23:** route app chỉ khớp ở cổng nội bộ `9081` (`vars: [["server_port", "==", "9081"]]`), và `gateway-sync` từ chối route app thiếu điều kiện này. Cổng `9080` mở ra máy chủ trả 404 cho `/apps/...`, nên CSP, bộ lọc header, kiểm Origin và giới hạn công khai của web proxy không bị đi vòng.
- **R24:** tin cậy giữa các app chỉ được sửa bằng tài liệu trong v1.8.0: mọi app dùng chung `dxos-apps-net` và chỉ giải mã token, nên chỉ cài app tin cậy. Cách ly thật cho từng app (kiểm JWT với JWKS của Keycloak, hoặc mỗi app một mạng) để sang v1.9, vì mạng app là internal và Keycloak không nằm trên đó.

**Khác với đặc tả.**
- **§9, không dùng Hasura cho `installed_apps` (R1).** Không có quyền Hasura nào trên bảng này. Menu và proxy đọc bằng Prisma mỗi lần tải trang hoặc mỗi request.
- **§6.5, giới hạn tần suất nằm ở web proxy (R2).**
  - Giới hạn tính trong từng tiến trình web và tin vào `X-Forwarded-For`.
  - Biến `DXOS_APP_PUBLIC_LIMIT` (mặc định 10) đổi được giới hạn. CI nâng nó lên 1000. Máy demo chạy Docker Desktop cũng nên nâng (ví dụ 300), vì Docker Desktop cho web thấy mọi client là một IP.
- **§5, runtime theo từng compose project (R13).** Các đường dẫn `docker/runtime/gateway/...` và `docker/runtime/apps/...` ở §5 nay nằm dưới `docker/runtime/<project>/`. Bên trong `dxos-cli`, thư mục của project được mount tại `/repo/docker/runtime`.
- **`DXOS_GATEWAY_FILE` (R10).** APISIX chỉ đọc tệp ghép khi stack được bật bằng `make platform-up` hoặc `make up`. `docker compose up` trần chạy lõi không có route app (đóng an toàn).
- **Kiểm Origin (R18).** Đây là ràng buộc bảo mật thêm, không có trong §6.
- **Sửa tour (R19).** Có trong §7 nhưng plan bỏ sót; đã được thêm.
- **Giới hạn kết nối.**
  - Role của app có `CONNECTION LIMIT 10`.
  - `tea-tour` giữ tối đa 8 kết nối (R20).
  - Role chỉ nhận SCRAM verifier, không bao giờ nhận mật khẩu dạng rõ.
  - Migration chạy bằng role của app (R16).
- **Gateway trả 401 khi sai vai trò, không phải 403.** Token hợp lệ nhưng không có vai trò khai trong manifest bị APISIX trả 401, và request không tới app. App vẫn tự kiểm vai trò và trả 403.
- **§6.6, CSP đầy đủ.** CSP là `default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'self'`, kèm `X-Content-Type-Options: nosniff`. Phản hồi chỉ giữ header `content-type` và `location`; `location` phải nằm trong chính app, nếu không web trả 502.
- **§4, thêm luật về tiền tố.** Manifest bị từ chối khi một tiền tố vừa công khai vừa cần đăng nhập, hoặc khi một tiền tố cần đăng nhập nằm dưới một tiền tố công khai.
- **§8, kích thước `hello`.** `hello` khoảng 80 dòng chứ không phải 50, vì có thêm form lời nhắn và tham số `?theme=`.
- **Bảng trên điện thoại.** Dưới 640 px, `/dxos-app.css` xếp mỗi dòng bảng thành một thẻ có nhãn cột (`data-label`). Bảng của `tea-tour` có thêm vai trò ARIA.
- **Re-run `platform-smoke`.** `apps-smoke` chạy lại `platform-smoke` trên stack đã seed, nên hai phép kiểm LB trong `smoke-dataops.sh` được giới hạn vào thửa fixture `P-LB-001` (lỗi có từ trước, lộ ra ở Task 9).
- **§6.2, tin cậy giữa các app (R24).** Spec ghi app "không nhận request từ dịch vụ nào ngoài gateway". Điều này không đúng khi có hai app trở lên: mọi app dùng chung `dxos-apps-net` và gọi thẳng được nhau với token tự tạo, vì app không kiểm chữ ký token. Trong v1.8.0 chỉ cài app tin cậy; cách ly thật để sang v1.9.
- **Gateway phân giải lại tên app mỗi giây.** DNS của Docker trả TTL 600 giây và cấp lại IP của app vừa gỡ cho container kế tiếp, nên sau khi gỡ `tea-tour`, cài `hello` rồi cài lại `tea-tour`, APISIX gửi request của `tea-tour` (kèm token người dùng) tới `hello` (CI run 43178558735). `platform/gateway/config.yaml` đặt `apisix.dns_resolver_valid: 1`, và `apps-smoke` chạy lại đúng kịch bản này.
- **Các giới hạn còn lại** được ghi trong CHANGELOG ("Known limits"):
  - phép kiểm phụ thuộc trước khi `--purge` chỉ xét bảng, kiểu và hàm;
  - migration chỉ ghi tên tệp, không có checksum;
  - `/apps/<id>` không có dấu `/` cuối trả 404 ở gateway.

**Số đo khi hoàn tất** (vòng sạch cuối trên `COMPOSE_PROJECT_NAME=dxos-clean`, sau đợt sửa của review toàn nhánh):
- `make test`: 1.413 test web qua, 3 bỏ qua (1.416 test, 130 bộ).
- pytest:
  - CLI 81;
  - `tea-tour` 44;
  - `disease-api` 17;
  - `scanner` 39;
  - `dataops` 78.
- `hello`: 7 test (`unittest`).
- realm 13; `seed-test.sh` 19 PASS.
- `make platform-smoke`: 124 PASS, 0 FAIL.
- `make apps-smoke`: 62 PASS, 0 FAIL, khoảng 280 giây. Lần chạy này gồm `platform-smoke` 124 PASS sau khi gỡ hết app.
- Trình duyệt:
  - `core-tenant` 5;
  - câu chuyện A3 1;
  - câu chuyện tour 1;
  - kiểm tra sau khi gỡ 1;
  - ảnh chụp 52: 40 ảnh cũ, cộng 12 ảnh `tea-tour` (danh sách tour của ban quản trị, trang công khai, lịch dẫn tour, ở 1280 và 390 px, sáng và tối).
- `./dxos install miniapps/tea-tour` với image đã build: 11 giây (dưới mức 30 giây của §12).
- Sau mỗi vòng, `remove --purge` để lại 0 schema app, 0 role app, 0 dòng đăng ký và 0 tệp runtime của app.
