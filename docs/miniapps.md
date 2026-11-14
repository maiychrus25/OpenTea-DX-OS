<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Hướng dẫn viết mini-app cho DX-OS

Mini-app là một dịch vụ riêng (container, schema Postgres, route gateway) được cắm vào DX-OS bằng một manifest `app.yaml` và lệnh `./dxos`, không sửa và không build lại lõi. Tài liệu này dành cho người viết mini-app. Thiết kế và lý do nằm ở [đặc tả Tầng 3](./specs/2026-11-11-tier3-miniapps-design.md) (kèm "Ghi chú sau triển khai 3") và [ADR 0002](./adr/0002-miniapp-architecture.md).

Các app mẫu trong repo:
- [`miniapps/hello`](../miniapps/hello/README.md): khoảng 80 dòng Python, chỉ dùng thư viện chuẩn, không có database. Nên đọc trước.
- [`miniapps/tea-tour`](../miniapps/tea-tour/): FastAPI và Jinja2, có database, route công khai và route theo vai trò.
- Ba app nghiệp vụ cùng khuôn với `tea-tour` (mỗi app có README riêng): [`miniapps/leaf-purchase`](../miniapps/leaf-purchase/README.md) (thu mua búp tươi, route theo ba vai trò, đọc nông hộ qua Hasura bằng token của người gọi), [`miniapps/tea-shop`](../miniapps/tea-shop/README.md) (cửa hàng, đặt hàng công khai, tồn kho) và [`miniapps/farm-supply`](../miniapps/farm-supply/README.md) (đợt mua chung vật tư).

App có `description` trong manifest sẽ hiện thành thẻ trong **Kho ứng dụng** của trưởng HTX (§8). Chỉ app nằm trong `miniapps/` của repo mới có thẻ.

## 1. Đường đi của một request

```
trình duyệt ──▶ web  /apps/<id>/<path>?<query>
                 │  chỉ id có trong platform.installed_apps (đọc mỗi request)
                 │  bỏ cookie, authorization, x-hasura-* của trình duyệt
                 │  route cần đăng nhập: gắn access token của người dùng
                 ▼
               APISIX :9081  /apps/<id>/<path>?<query>
                 │  route app chỉ khớp ở cổng nội bộ 9081 (R23)
                 │  route cần đăng nhập: openid-connect bearer_only + kiểm vai trò
                 │  cắt tiền tố /apps/<id>
                 ▼
               app-<id>:<runtime.port>  /<path>?<query>
```

- App nhận đường dẫn **đã cắt tiền tố**: `/apps/tea-tour/tours/abc` tới app thành `/tours/abc`, còn `/apps/tea-tour/` thành `/`.
- Trình duyệt luôn đi qua web và gateway, nên **mọi link, form và chuyển hướng trong trang phải ghi đầy đủ tiền tố `/apps/<id>`**.
  - `hello` dùng hằng `PREFIX = "/apps/hello"`.
  - Với FastAPI/Starlette, chạy uvicorn với `--root-path /apps/<id>` để app biết tiền tố của chính nó (xem `miniapps/tea-tour/Dockerfile`).
- Route của app chỉ khớp ở cổng nội bộ `9081` của gateway (`vars: [["server_port", "==", "9081"]]`, R23), cổng mà chỉ mạng compose thấy. Cổng `9080` mở ra máy chủ trả 404 cho mọi `/apps/...`, nên request từ ngoài luôn phải qua web và các kiểm tra của web proxy. `gateway-sync` từ chối route app thiếu điều kiện này.
- Gateway chỉ có route cho các tiền tố khai trong manifest. Đường dẫn ngoài mọi tiền tố trả 404 từ gateway. `/apps/<id>` không có dấu `/` cuối cũng trả 404 ở gateway, nhưng web proxy luôn gửi `/apps/<id>/...`.
- Header request tới app chỉ gồm `content-type`, `accept`, `content-length`, và `authorization` trên route cần đăng nhập. App không nhận cookie.
- Header phản hồi về trình duyệt chỉ giữ `content-type`, `location` và `content-disposition` (chỉ khi giá trị bắt đầu bằng `attachment`, để liên kết "Tải CSV" tải được tệp). `set-cookie` và CSP riêng của app bị bỏ, nên **app không dùng được cookie hay session**; trạng thái nằm trong URL, form và database.
- Chuyển hướng (`location`) chỉ được trỏ tới một trang khác của chính app (cùng origin, dưới `/apps/<id>`). Nếu không, web trả 502.
- App không trả lời trong 10 giây thì web trả 503.

## 2. Manifest `app.yaml`

Chuẩn là JSON Schema tại [`platform/apps/manifest.schema.json`](../platform/apps/manifest.schema.json). Mọi đối tượng có `additionalProperties: false`, nên trường lạ (cổng ra máy chủ, volume, quyền container, ...) làm manifest bị từ chối.

| Trường | Bắt buộc | Quy tắc |
| --- | --- | --- |
| `apiVersion` | có | đúng `dxos/v1` |
| `id` | có | `^[a-z][a-z0-9-]{1,30}$`, duy nhất trong các app đã cài. Schema và role DB tên `app_<id>`, với `-` đổi thành `_` |
| `name` | có | 1–80 ký tự, tên hiện cho người dùng (cũng là `title` của khung iframe) |
| `description` | không | 1–200 ký tự, mô tả ngắn hiện trong cửa hàng ứng dụng |
| `version` | có | SemVer, ví dụ `0.1.0` |
| `license` | có | thuộc danh sách OSI của CLI: `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `MPL-2.0`, `EPL-2.0`, `LGPL-3.0-only`, `LGPL-3.0-or-later`, `GPL-2.0-only`, `GPL-3.0-only`, `GPL-3.0-or-later`, `AGPL-3.0-only`, `AGPL-3.0-or-later` |
| `publisher` | có | 1–80 ký tự |
| `requires.core` | có | `>=X.Y.Z`. Lõi hiện tại là `version` trong `apps/web/package.json` (`1.12.0`) |
| `runtime.build` / `runtime.image` | đúng một trong hai | `build`: thư mục tương đối trong thư mục app (thường là `.`). `image`: phải ghim digest, dạng `<ref>@sha256:<64 ký tự hex>` |
| `runtime.port` | có | 1–65535, cổng app nghe trong container |
| `runtime.health` | có | đường dẫn health check (đã cắt tiền tố), ví dụ `/healthz`, phải trả 2xx |
| `database.migrations` | không | thư mục migration. Không khai thì app không có database (§5) |
| `routes` | có | ít nhất một trong `public` và `protected` |
| `routes.public` | không | danh sách tiền tố không cần đăng nhập, ví dụ `[/public/]` |
| `routes.protected` | không | ánh xạ tiền tố → danh sách vai trò (`farmer`, `officer`, `manager`, ít nhất một) |
| `feed` | không | đường dẫn (cùng quy tắc với route) mà app trả danh sách app con của người gọi; phải nằm dưới một tiền tố trong `routes.protected`. Xem mục dưới. App khai `feed` nên khai `requires.core: ">=1.12.0"` |
| `menu[]` | không | `label` (1–60 ký tự), `path` (đường dẫn trong app), `roles` (ít nhất một) |
| `store` | không | thông tin cho trang chi tiết trong cửa hàng; mọi khoá đều tuỳ chọn, khoá lạ bị từ chối (bảng dưới). App khai `store` nên khai `requires.core: ">=1.10.0"` |

**Khối `store`** (từ v1.10.0). Văn bản chỉ được hiển thị dạng văn bản thuần; biểu tượng chỉ là tên trong danh sách cho phép.

| Khoá | Quy tắc |
| --- | --- |
| `category` | một trong `production`, `sales`, `members`, `tourism`, `sample` |
| `icon` | một trong `leaf`, `scale`, `shopping-bag`, `package`, `map-pinned`, `users`, `calendar`, `clipboard-list`, `truck`, `sparkles` |
| `about` | 1–2000 ký tự, giới thiệu đầy đủ |
| `data` | tối đa 8 mục, mỗi mục 1–160 ký tự: app lưu những dữ liệu nào |
| `personal_data` | 1–300 ký tự: app có xử lý dữ liệu cá nhân không |
| `core_reads` | tối đa 6 mục, mỗi mục 1–160 ký tự: app đọc gì từ lõi |
| `screenshots[]` | tối đa 4 mục `{file, caption}`, cả hai bắt buộc. `file`: đường dẫn tương đối trong thư mục app (không bắt đầu bằng `/`, không có `..`, `[A-Za-z0-9._/-]`, tối đa 120 ký tự); `caption`: 1–120 ký tự |

**Ảnh màn hình.** Tệp là PNG, WebP hoặc JPEG (nhận theo byte đầu, không theo đuôi tệp; không nhận SVG), tối đa 409600 byte mỗi ảnh, nằm trong thư mục app (liên kết trỏ ra ngoài thư mục bị từ chối). Quy ước của kho: đặt trong `store/`, chụp từ app thật ở 1280×800, giao diện sáng, chỉ phần trang của app, dữ liệu mẫu không có người thật. `./dxos validate` báo lỗi tệp sai loại, quá cỡ hoặc ra ngoài thư mục; `catalog-sync` bỏ qua tệp như vậy và ghi một dòng cảnh báo. Thư mục `store/` không vào image của app vì Dockerfile chỉ chép các đường dẫn nêu tên.

**Bước cài.** Khi cài qua `./dxos worker`, `./dxos` báo `prepare`, `build`, `register` bằng `./dxos worker-progress <mã yêu cầu> <bước>`; trang chi tiết hiện các bước này. Lỗi của lệnh báo không làm hỏng lần cài, và `./dxos install` gõ tay không ghi bước nào.

**Nguồn app con `feed`** (từ v1.12.0). App khai `feed: /feed` có thể tự sinh ra các "app con" cho từng người dùng, ví dụ sổ do trưởng HTX tự tạo. Web gọi `GET /apps/<id><feed>` kèm token của người dùng (`authorization: Bearer ...`, `accept: application/json`), chờ tối đa 1,5 giây, chỉ đọc thân khi mã là 200 và thân không quá 64 KB, rồi nhớ kết quả 15 giây cho mỗi bộ (app, HTX, vai trò). Mọi lỗi (quá hạn, mã khác 200, thân quá lớn hoặc không phải JSON) cho danh sách rỗng, được ghi một dòng log, không làm hỏng menu và được nhớ 5 giây (trong lúc đó web không gọi lại, để app đang hỏng không làm chậm mọi lần mở trang). Chỉ app có mục menu cho vai trò đó mới được gọi `feed`. Phản hồi:

```json
{"entries": [{"label": "Sổ thu mua", "path": "/books/1", "icon": "leaf", "description": "Ghi chép thu mua"}],
 "create": {"label": "Tạo sổ", "path": "/new"}}
```

Luật kiểm tra của web, mục sai bị bỏ chứ không làm hỏng cả danh sách: tối đa 30 `entries` (phần thừa bị bỏ); `label` 1–60 ký tự sau khi cắt khoảng trắng; `description` tối đa 200 ký tự (dài hơn thì bị cắt), mặc định rỗng; `path` khớp `^/[a-z0-9_-]+(/[a-z0-9_-]+)*$` và không có đoạn `.`/`..`, nên không thể là `//host` hay URL tuyệt đối; `icon` chỉ nhận tên trong danh sách của khối `store`, tên khác thành biểu tượng mặc định; `create` (tuỳ chọn) kiểm tra như một mục. Văn bản luôn hiện dạng văn bản thuần. Mỗi mục thành một mục menu `/<vai trò>/apps/<id><path>` ngay sau các mục menu tĩnh của app, và trong Kho ứng dụng có phần "Ứng dụng do HTX tự tạo" (lấy `feed` của vai trò `manager`). Mục mới hiện ở lần tải trang kế tiếp (menu do máy chủ dựng, không tự cập nhật trong trang đang mở), trễ tối đa 15 giây sau khi app đổi `feed`; đã đo trên stack thật: người dùng không cần làm gì thêm. Bấm một mục mở app con trong khung; địa chỉ của trang bao quanh không đổi khi người dùng đi tiếp bên trong khung. Khi app tắt, `feed` hỏng ngay (không chờ hết thời hạn) nên trang vẫn dựng bình thường với các mục menu tĩnh. Bộ nhớ đệm theo vai trò, không theo người dùng: app không nên đưa vào `feed` thứ gì mà hai người cùng vai trò trong một HTX không được thấy chung.

**Đường dẫn** (route, menu, `health`, `feed`) phải khớp `^/([a-z0-9_-]+(/[a-z0-9_-]+)*/?)?$`: bắt đầu bằng `/`, chỉ gồm `[a-z0-9/_-]`, không có `..` hay `//`. Mọi route nằm dưới `/apps/<id>/`; trong manifest chỉ ghi phần sau tiền tố đó.

**Trang công khai nằm dưới `/public/<htxCode>/...`.** Từ v1.9.0, web proxy chỉ phục vụ trang công khai của app khi HTX có mã `<htxCode>` đã bật app đó; HTX chưa bật thì trả 404. Vì vậy mã HTX phải là đoạn đầu tiên sau `/public/` (khớp `^[A-Za-z0-9_-]{1,20}$`) và app lấy HTX từ đường dẫn này. Khai `public: [/public/]` trong manifest như trước.

**Luật về tiền tố**, CLI từ chối khi:
- một tiền tố vừa nằm trong `public` vừa là khoá của `protected`;
- một tiền tố cần đăng nhập nằm dưới một tiền tố công khai, ví dụ `public: [/public/]` cùng `protected: {/public/admin: [manager]}`. Web coi mọi đường dẫn bắt đầu bằng một tiền tố công khai là công khai và không gắn token, nên route đó không bao giờ vào được.

Gateway chọn tiền tố khớp dài nhất. Trong `tea-tour`, `/guide` (chỉ `farmer`) thắng `/` (chỉ `manager`).

**Vai trò:**
- Gateway kiểm vai trò trong `realm_access.roles` của token. Sai vai trò thì gateway trả **401** (không phải 403) và request không tới app.
- Menu hiện mục theo `menu[].roles`. Khung ứng dụng `/<role>/apps/<id>/...` chỉ mở được khi manifest có ít nhất một mục menu cho vai trò đó; nếu không thì trả 404.
- Nên cấp ít quyền nhất: `tea-tour` cho `/` riêng `manager` và `/guide` riêng `farmer`.

Ví dụ đầy đủ là `miniapps/tea-tour/app.yaml`. Kiểm tra manifest mà không cài: `./dxos validate miniapps/<thư mục>` (nhận nhiều thư mục; CI chạy nó cho mọi thư mục trong `miniapps/`).

## 3. Đăng nhập, claim và ranh giới tin cậy

Trên route cần đăng nhập, app nhận `Authorization: Bearer <access token>` của người dùng. Token đã được APISIX kiểm chữ ký, hạn dùng, `aud` và vai trò. Phần payload (JWT, base64url) có các claim:

| Claim | Ý nghĩa |
| --- | --- |
| `sub` | id người dùng Keycloak |
| `name`, hoặc `preferred_username` khi thiếu `name` | tên hiển thị |
| `htx_code` | mã HTX của người dùng (ví dụ `TC`) |
| `realm_access.roles` | vai trò; chỉ dùng `farmer`, `officer`, `manager` |

**Ranh giới tin cậy:**
- App **không** kiểm chữ ký token, chỉ giải mã nó. Với request của người dùng, APISIX đã kiểm token trước khi chuyển tới app.
- **Nhưng gateway không phải đường duy nhất tới app:** mọi app đã cài dùng chung mạng `dxos-apps-net` (§7), nên một app khác gọi thẳng được `app-<id>:<port>` với token tự tạo (HTX và vai trò tuỳ ý) và đọc hoặc sửa dữ liệu của app này. Vì vậy **chỉ cài app tin cậy**, như code lõi. Cách ly thật cho từng app (kiểm JWT, hoặc mỗi app một mạng riêng) để sang v1.9.
- Claim từ gateway là dữ liệu đã kiểm, nhưng app vẫn đọc cẩn thận: claim lạ hoặc thiếu thì coi như không có vai trò, không được làm app lỗi. Xem `read_claims` trong `miniapps/tea-tour/tea_tour/claims.py` và `claims` trong `miniapps/hello/app.py`.
- App vẫn tự kiểm vai trò cho từng trang (phòng thủ nhiều lớp). `tea-tour` trả 403 khi vai trò không khớp.
- **Mọi truy vấn lọc theo `htx_code` lấy từ token**, không bao giờ theo giá trị từ URL hay form.
- Trên route công khai, app không nhận header `Authorization` (web bỏ header của trình duyệt), nên phải tự validate mọi dữ liệu vào.

**Đọc dữ liệu lõi:** gọi `http://apisix:9081/api/data/graphql` và chuyển tiếp nguyên header `Authorization` của người dùng (xem `miniapps/tea-tour/tea_tour/core_client.py`). Hasura áp quyền theo dòng bằng `htx_code` của chính token, nên app chỉ thấy dữ liệu của HTX người dùng. App không đọc bảng lõi trực tiếp.

## 4. Giao diện: HTML không script

- Trang render phía server, chỉ HTML và form, không JavaScript.
- Web gắn cho mọi phản hồi dưới `/apps/` hai header:
  - `Content-Security-Policy: default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'self'`
  - `X-Content-Type-Options: nosniff`
- Vì CSP đó:
  - không có `<style>` nội tuyến hay thuộc tính `style`; dùng stylesheet chung;
  - ảnh chỉ lấy từ cùng origin hoặc `data:`;
  - form chỉ gửi về cùng origin.
- Trang cần đăng nhập hiện trong khung ứng dụng `/<role>/apps/<id>/<path>`, bên trong `<iframe sandbox="allow-forms allow-same-origin allow-top-navigation-by-user-activation allow-downloads">`. Khung không có `allow-scripts` nên app không đọc được cookie hay DOM của ứng dụng chính. Link ra ngoài app cần `target="_top"`.
- Trang công khai mở thẳng toàn màn hình, ví dụ `/apps/tea-tour/public/TC`.
- Thoát HTML mọi dữ liệu người dùng gửi (Jinja2 bật autoescape; với thư viện chuẩn dùng `html.escape`).
- Sau một POST, chuyển hướng 303 về trang GET (mẫu POST/redirect/GET).

**Chế độ sáng/tối (`?theme=`):**
- Khung ứng dụng thêm `?theme=light` hoặc `?theme=dark` vào URL của iframe theo lựa chọn đã lưu của người dùng. Khi người dùng chọn "Theo hệ thống" thì không có tham số.
- App đặt `data-theme="light|dark"` trên `<html>` **chỉ khi** giá trị đúng là `light` hoặc `dark`.
- App giữ `theme` qua mọi link, form (trường ẩn) và chuyển hướng của nó. Xem `href()` trong `tea_tour/main.py` và `theme_input` trong `hello/app.py`.
- Không có `data-theme` thì `/dxos-app.css` theo cài đặt hệ thống (`prefers-color-scheme`).

### Stylesheet chung `/dxos-app.css`

Thêm `<link rel="stylesheet" href="/dxos-app.css">` vào mọi trang. Tệp do web phục vụ, không cần phiên đăng nhập, chạy được không cần script (nguồn: `apps/web/public/dxos-app.css`).

- **Token:** màu, cỡ chữ, bo góc, khoảng cách (`--color-*`, `--font-size-*`, `--rounded-*`, `--spacing-*`). Giá trị giống hệt `apps/web/src/styles/globals.css`, có test kiểm tra (`theme-tokens.test.ts`). Có bộ giá trị cho sáng, tối theo hệ thống, và `data-theme`. Khi tự viết CSS thì chỉ dùng token, không dùng mã màu cứng.
- **Phần tử có sẵn kiểu:** `body`, `main`, `a`, `h1`–`h3`, `p`, `table`/`th`/`td`, `form`, `label`, `input`, `select`, `textarea`, `button`, kèm trạng thái focus và chuyển động giảm.
- **Lớp:**
  - `button.secondary`: nút phụ;
  - `.notice`: thông báo thông tin;
  - `.error`: thông báo lỗi;
  - `.pill`: nhãn trạng thái nhỏ.
- **Bảng xếp chồng trên điện thoại:**
  - Dưới 640 px, mỗi dòng bảng thành một thẻ để không cột nào bị khuất sau mép cuộn (khung không script không có gợi ý cuộn).
  - Gắn `data-label="<tên cột>"` cho mỗi ô `<td>`: ô có nhãn hiện tên cột bên trái và giá trị bên phải; ô không có nhãn (ví dụ một nút) chiếm cả chiều ngang thẻ.
  - Hàng tiêu đề được ẩn bằng hình ảnh nhưng vẫn còn cho trình đọc màn hình.
  - Vì các phần của bảng chuyển sang `display: block`, một số trình đọc màn hình bỏ ngữ nghĩa bảng. Nên thêm `role="table"`, `role="rowgroup"` (cho `thead` và `tbody`), `role="row"`, `role="columnheader"` và `role="cell"`, như `tea_tour/templates/manager.html`.

## 4b. Bộ giao diện dùng chung (app kit)

Bản gốc nằm ở `platform/appkit/` (`appkit.py`, `kit.html`, `showcase.html`) và `apps/web/public/dxos-app.css`. Mỗi app tự đủ vì image dựng từ thư mục của chính nó, nên hai tệp được **chép** vào gói của app: `<gói>/appkit.py` và `<gói>/templates/kit.html`.

- `make appkit-sync` chép bản gốc vào bốn app (`leaf-purchase`, `tea-shop`, `farm-supply`, `tea-tour`; danh sách nằm trong `scripts/appkit-sync.sh`). `make lint` chạy `scripts/appkit-sync.sh --check` và báo lỗi nếu một bản chép lệch hoặc thiếu.
- Không sửa bản chép trong app: sửa bản gốc rồi chạy `make appkit-sync`. Xem mọi thành phần với dữ liệu mẫu ở `platform/appkit/showcase.html`.
- Dùng trong template: `{% import "kit.html" as kit %}`. Trong CSS và HTML không có `style=` hay `<script`; chiều dài thanh biểu đồ là thuộc tính SVG.

**Macro (`kit.<tên>`) và HTML sinh ra:**

| Macro | HTML |
|---|---|
| `app_header(title, subtitle=None)` + `{% call %}` | `<header class="app-header">` có một `<h1>`; phần thân `call` là các nút hành động |
| `tabs(items, current)` | `<nav class="tabs" aria-label="Điều hướng trong ứng dụng">`; `items` là `(khoá, nhãn, href)`, mục hiện tại có `aria-current="page"` |
| `stats(items)` | `<ul class="stats">`; mỗi mục `{label, value, hint}` (`hint` không bắt buộc) |
| `chart(title, rows, unit="")` | `<figure class="chart">`; `rows` từ `appkit.chart_rows`; mỗi dòng một `<rect width="62%">` |
| `pagination(page, prev_href, next_href)` | `<nav class="pagination" aria-label="Phân trang">` với "Trang 2/5 · 87 dòng"; không hiện gì khi `page.total == 0` |
| `empty(message, action_label=None, action_href=None)` | `<p class="empty">` |
| `field_error(errors, name)` | `<span class="field-error" role="alert">` dưới ô nhập; không có lỗi thì không sinh gì |
| `steps(labels, current)` | `<ol class="steps">`; bước hiện tại `aria-current="step"`, bước trước đó `data-state="done"` |
| `export_link(href, label="Tải CSV")` | `<a class="button secondary" href>` |
| `print_link(href, label="Bản in")` | `<a class="button secondary" href target="_top">` |
| `print_bar(back_href)` | `<p class="no-print">` có hướng dẫn Ctrl+P và liên kết "Quay lại ứng dụng" |

**Mẫu chỉ cần CSS (viết HTML trực tiếp):**

- `<form class="toolbar" method="get">`: ô tìm, bộ lọc, khoảng ngày và nút, tự xuống dòng.
- `<ul class="cards"><li class="card">…</li></ul>`: lưới thẻ cho trang công khai.
- `<details class="disclosure"><summary>Thêm …</summary>…</details>`: khối mở ra cho biểu mẫu thêm.
- `<span class="actions">` quanh các nút nhỏ trong một dòng bảng (một `<form>` bọc một nút vẫn được); `a.button` là liên kết trông như nút (thêm `secondary` cho nút phụ); `.danger` cho nút huỷ, xoá.
- `<form class="toolbar">`: ô tìm (`type="search"`) giãn được, ô chọn và ngày giữ chiều rộng tự nhiên, các nút nằm cuối hàng cuối; trên điện thoại mỗi ô một hàng.
- Nút trong ô bảng và trong `.actions` gọn hơn (cao 34 px) để một dòng bảng cao khoảng 44 px.
- `input[type=checkbox|radio]` có cỡ bình thường, cùng một dòng với nhãn: `<label><input type="checkbox"> Chữ</label>`, hoặc ô nhập rồi tới `<label for>` ngay sau nó (trong `<form>`).
- Nhãn trạng thái: `.pill` (xanh: đang dùng, xong), `.pill.neutral` (xám: ngừng, đóng, đã qua), `.pill.warn` (hổ phách: chờ, mới, chưa thanh toán), `.pill.danger` (đỏ: đã huỷ, vô hiệu).
- `stats` tự chia đều hàng cho 3, 4 hay 5 ô; trên điện thoại hai cột, ô lẻ cuối chiếm cả hàng.
- Biểu mẫu trong `.card` không có khung riêng.
- Trang in: `.signature` (ô bảng hoặc khối) chừa khoảng 4,5 rem trống để ký tay; bảng trong `.print-sheet` rộng hết khổ, viền đen mảnh.
- Trang in: `<body class="print-sheet">`, `.no-print` ẩn khi in, `.print-only` chỉ hiện khi in; `@media print` bỏ nền, màu, điều hướng và nút.

**Hàm Python (`appkit`):**

- `page_of(raw, total, size=25)` trả `Page` (`number`, `pages`, `offset`, `has_prev`, `has_next`); thiếu, sai hoặc vượt trang cuối đều ra một trang hợp lệ.
- `parse_date(raw)` (đúng `YYYY-MM-DD`), `parse_int(raw, low, high)`: trả `None` khi sai.
- `like_pattern(q)`: thoát `\ % _` rồi bọc `%…%`, dùng với `ILIKE %s ESCAPE '\'` và tham số SQL.
- `money(vnd)` ("9.000 ₫"), `number(value, digits=1)` ("12,5"), `vn_date`, `vn_datetime` (giờ Asia/Ho_Chi_Minh).
- `chart_rows(pairs, fmt=number)`: độ dài cột theo phần trăm của giá trị lớn nhất.
- `csv_filename(app_id, htx_code, name, day)` (chỉ ASCII), `csv_response(filename, header, rows)`: UTF-8 có BOM, CRLF, `content-disposition: attachment`; ô chữ bắt đầu bằng `=`, `+`, `-`, `@` được thêm `'` phía trước.
- `shell_url(role, app_id, path="/")`: địa chỉ trang khung (`/manager/apps/tea-shop/orders`) cho liên kết quay lại từ trang in.

## 5. Database: `DXOS_APP_DB_URL` và migration

Khi manifest khai `database`, `dxos install`:
1. Tạo role `app_<id>`: `LOGIN`, không superuser, không tạo database hay role, không replication, không bỏ qua RLS, `CONNECTION LIMIT 10`. Mật khẩu sinh ngẫu nhiên; server chỉ nhận SCRAM verifier, không bao giờ nhận mật khẩu dạng rõ.
2. Tạo schema `app_<id>` do role đó sở hữu. Role không có quyền trên bảng lõi; test `tea-tour` chứng minh điều này.
3. Chạy migration (bên dưới), rồi ghi tệp env `docker/runtime/<project>/apps/<id>.env` (quyền 600, git-ignored) chứa một dòng:

   ```
   DXOS_APP_DB_URL=postgresql://app_<id>:<mật khẩu>@postgres:5432/agrimarket
   ```

   Compose của app nạp tệp này, nên app đọc biến môi trường `DXOS_APP_DB_URL`.

**Khi kết nối:**
- Đặt `search_path` về schema của app, ví dụ `options="-c search_path=app_tea_tour"` với psycopg.
- Giữ số kết nối đồng thời dưới 10, vì quá giới hạn thì Postgres từ chối. `tea-tour` dùng `threading.BoundedSemaphore(8)` và trả trang 503 "Hệ thống đang bận" khi không có chỗ trong 2 giây.
- Không giữ kết nối trong lúc chờ lõi.

**Migration:**
- Là các tệp `*.sql` trong `database.migrations`, chạy **theo thứ tự tên tệp** (nên đặt tên `001_init.sql`, `002_...`).
- Chạy trên một kết nối **đăng nhập bằng chính role của app**, với `search_path` là schema của app; không chạy bằng superuser. Migration chỉ làm được những gì role app làm được: không tạo extension, không đụng schema khác. `gen_random_uuid()` có sẵn.
- Mỗi tệp chạy trong một transaction. `COMMIT` viết trong tệp sẽ phá tính "một tệp một transaction", nhưng chỉ ảnh hưởng schema của app; đừng viết.
- Tệp đã chạy được ghi vào `app_<id>.schema_migrations(file, applied_at)` **chỉ theo tên tệp, không có checksum**. Sửa một tệp đã chạy không có tác dụng với bản cài hiện có; luôn thêm tệp mới. Một bản cài dev chưa `--purge` vẫn giữ tệp cũ.
- **Mọi bảng** của schema (trừ `schema_migrations`) phải có cột `htx_code text NOT NULL`. CLI kiểm sau mỗi tệp và một lần nữa trên phiên mới khi xong; thiếu thì cài thất bại và được hoàn tác.
- Không dùng `ALTER DEFAULT PRIVILEGES` hay cấp quyền ở database khác: role còn quyền `CONNECT` vào các database khác qua `PUBLIC` (ruling R17), và quyền để lại ở đó làm `--purge` báo lỗi (tệp env được giữ, cần admin chạy `DROP OWNED BY app_<id>` ở database đó).

**Gỡ:**
- `./dxos remove <id>` giữ schema, role và tệp env, nên cài lại thì thấy lại dữ liệu cũ.
- `./dxos remove <id> --purge` xoá cả ba:
  - `DROP SCHEMA ... CASCADE`;
  - `DROP OWNED BY` rồi `DROP ROLE`;
  - xoá tệp env.
- CLI từ chối xoá schema (không xoá gì) khi có đối tượng ngoài schema phụ thuộc vào nó. Phép kiểm này chỉ xét phụ thuộc vào bảng, kiểu và hàm của schema.

## 6. Origin, CSRF và giới hạn tần suất công khai

- **Chống gửi form chéo trang (R18):** web gắn token của người dùng vào route cần đăng nhập, nên một request không phải `GET`/`HEAD` dưới `/apps/` bị trả **403** và không được chuyển tiếp khi:
  - header `Origin` có mặt và khác cả `<scheme>://<Host>` của request lẫn origin của `AUTH_URL` (kể cả `Origin: null`);
  - hoặc không có `Origin` nhưng trình duyệt gửi `Sec-Fetch-Site: cross-site`.

  Form của app gửi từ chính trang của app nên luôn qua được. Đặt `AUTH_URL` đúng URL công khai khi web chạy sau một reverse proxy TLS.
- **Giới hạn route công khai:** **10 request mỗi phút cho mỗi IP**, tính chung cho mọi app, quá thì trả **429** kèm thông báo tiếng Việt.
  - IP là phần tử đầu của `X-Forwarded-For`, như `/api/register`.
  - Giới hạn tính trong từng tiến trình web.
  - Bảng đếm giữ tối đa 10.000 IP; khi đầy, IP mới dùng chung một nhóm.
  - Route cần đăng nhập không bị tính.
- **Biến `DXOS_APP_PUBLIC_LIMIT`** (container `web`, đọc qua Compose interpolation, mặc định `10`) đổi giới hạn. CI nâng nó lên 1000 cho các spec trình duyệt cùng chạy từ một IP. Máy demo chạy Docker Desktop cũng nên nâng nó (ví dụ 300), vì Docker Desktop cho web thấy mọi client trong LAN là một IP, nên giới hạn thành chung cho cả phòng (README, "Chuẩn bị demo"). Production và mặc định của compose giữ `10`. Giá trị không phải số nguyên dương thì dùng `10`.

## 7. Container được khoá chặt

`dxos install` sinh `docker/runtime/<project>/apps/<id>.compose.yml` cho service `app-<id>` với các thiết lập cố định; manifest không thay đổi được chúng:

| Thiết lập | Giá trị |
| --- | --- |
| Mạng | chỉ `dxos-apps-net`: `internal: true`, nên không ra internet; ngoài các app chỉ có `apisix` và `postgres`. Mọi app đã cài dùng chung mạng này và gọi được nhau (§3) |
| Cổng ra máy chủ | không có |
| User | `10001:10001`, bất kể `USER` của image |
| Hệ thống tệp | `read_only: true`; chỉ `/tmp` (tmpfs) ghi được |
| Quyền | `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]` |
| Tài nguyên | `mem_limit: 256m`, `cpus: 0.5` |
| Khởi động lại | `unless-stopped` |
| Health check | `python -c "urllib.request.urlopen('http://127.0.0.1:<port><health>')"` mỗi 10 giây |

Hệ quả cho người viết app:
- Image phải có `python` (cho health check) và mọi tệp phải đọc được bởi uid 10001.
- Cài thư viện **lúc build**; lúc chạy không có mạng ra ngoài.
- App chỉ gọi được gateway (`apisix:9081`), Postgres (`postgres:5432`) và các app khác đã cài, không gọi được dịch vụ lõi nào khác.
- Trong lõi, chỉ gateway gửi request tới app. Các app khác cùng mạng cũng gọi thẳng được app (§3), nên chỉ cài app tin cậy.

## 8. Lệnh `./dxos`

`./dxos` ở gốc repo gọi container `dxos-cli` (profile `tools`) để làm phần manifest, database, gateway, nhật ký cài và đăng ký. Script tự bật hoặc tắt container của app bằng `docker compose`. Không mount docker socket vào container nào và không mở thêm cổng. Cần stack đang chạy (ít nhất `postgres` và `apisix`).

| Lệnh | Việc làm |
| --- | --- |
| `./dxos validate <dir>...` | Chỉ kiểm tra manifest; in "hợp lệ" hoặc từng lỗi; mã thoát 1 khi có lỗi |
| `./dxos install <dir>` | Kiểm manifest, database, sinh route gateway, sinh compose, chạy `up -d --build --wait`, rồi ghi `platform.installed_apps`. Bước nào hỏng (kể cả health check, Ctrl-C hoặc TERM) thì mọi bước trước được hoàn tác. Cài lại một app đã cài chỉ bảo đảm container đang chạy |
| `./dxos upgrade <dir>` | Nâng cấp app đã đăng ký tại chỗ: kiểm manifest, chạy migration còn thiếu (giữ nguyên role và mật khẩu), sinh lại route và compose, `up -d --build --wait`, rồi cập nhật `name`, `version`, `menu`, `manifest` trong `platform.installed_apps`. Không đụng tới enablement của HTX. Build hoặc health check hỏng thì đăng ký vẫn ở bản cũ và lệnh thoát mã 1 (route và compose file đã sinh lại; chạy `upgrade` lần nữa để sửa). App chưa cài thì dùng `install` |
| `./dxos remove <id> [--purge]` | Tắt container, gỡ route, xoá đăng ký; mặc định giữ dữ liệu (§5) |
| `./dxos list` | Mỗi app đã cài một dòng: id, phiên bản, thời điểm cài, trạng thái container; hoặc "Chưa cài app nào" |
| `./dxos worker` | Tiến trình của máy chủ làm các yêu cầu Cài và Gỡ mà trưởng HTX gửi từ Kho ứng dụng (xem dưới); chạy cho tới khi nhận TERM hoặc Ctrl-C |

**Kho ứng dụng và bật tắt theo HTX.** `./dxos install` ghi app vào `platform.installed_apps` và bật nó cho mọi HTX (`platform.app_enablements`, mã `*`). Trang `/manager/app-store` thì bật hoặc tắt riêng cho HTX của trưởng HTX: web chỉ ghi một dòng vào `platform.app_requests`, còn `./dxos worker` nhận từng yêu cầu một. `ENABLE` cài app nếu chưa cài rồi ghi enablement của HTX; `DISABLE` xoá enablement (HTX thấy app biến mất ngay) rồi gỡ container khi không còn HTX nào dùng, vẫn giữ dữ liệu. App chỉ được phục vụ và hiện trong menu của HTX đã bật nó. Catalogue của kho (`platform.app_catalog`) được `make platform-up` và worker đồng bộ từ `miniapps/*/app.yaml`, nên tên thư mục phải trùng `id` trong manifest. Worker giữ khoá `docker/runtime/<project>/worker.lock` (mỗi project một worker), đánh dấu lỗi các yêu cầu mà worker cũ bỏ dở lúc khởi động và chỉ hoàn tác lần cài dở của app chưa đăng ký. Khi `version` trong catalogue khác phiên bản đang đăng ký, thẻ và trang chi tiết hiện nhãn `Có bản mới`, kèm dòng nhắc quản trị máy chủ chạy `./dxos upgrade miniapps/<id>`. Cách chạy dưới systemd nằm trong README, mục "Kho ứng dụng và `./dxos worker`".

`<dir>` phải nằm trong repo, vì `dxos-cli` chỉ thấy repo.

**Trạng thái runtime theo từng compose project (R13):**
- Mọi tệp sinh ra nằm dưới `docker/runtime/<project>/` (git-ignored). `<project>` là biến môi trường `COMPOSE_PROJECT_NAME`, mặc định `docker`.
- Đặt project bằng biến môi trường. Cờ `-p` hay `docker/.env` không được `./dxos` và Makefile đọc.

| Tệp | Nội dung |
| --- | --- |
| `gateway/apisix.yaml` | tệp route APISIX thực sự đọc: tệp gốc `platform/gateway/apisix.yaml` ghép thêm route của các app. Không app nào thì giống hệt tệp gốc |
| `gateway/apps/<id>.yaml` | route của một app |
| `apps/<id>.compose.yml` | compose của app |
| `apps/<id>.env` | `DXOS_APP_DB_URL`, quyền 600 |
| `apps/<id>.pending.json` | nhật ký của bản cài đang dở, dùng để hoàn tác |

Tệp đang được git theo dõi không bao giờ bị sửa lúc chạy. `make platform-up` (và `make up`) chạy `gateway-sync` trước, rồi đặt `DXOS_GATEWAY_FILE` để APISIX mount tệp ghép.

**Khởi động stack:**
- Một `docker compose up` trần không đặt `DXOS_GATEWAY_FILE`, nên APISIX dùng tệp gốc và **không có route app nào** (đóng an toàn).
- Khi bật riêng `web`, dùng `make web-up` (đặt sẵn biến này) để APISIX không bị tạo lại với tệp gốc:

  ```bash
  make web-up
  ```

**Kiểm thử tích hợp:** `make apps-smoke` (sau `npm run seed` và `make platform-smoke`) cài và gỡ `hello`, `tea-tour`, ba app nghiệp vụ và các fixture của CLI, kiểm route, quyền (kể cả `/tickets/*` và `/periods/*` của `leaf-purchase`), việc đọc nông hộ qua Hasura với vai trò cán bộ và nông hộ, một thao tác ghi cho mỗi app, rollback, idempotent và `--purge`; chạy hàng đợi của kho với worker thật (bật cho một HTX, gỡ, bật lại giữ dữ liệu, cài hỏng, worker bị kill giữa chừng, nâng cấp từ stack chưa có kho); rồi chạy lại `make platform-smoke` trên stack không có app.

> **Cảnh báo:** `make apps-smoke` xoá dữ liệu của `tea-tour`, `leaf-purchase`, `tea-shop`, `farm-supply` (`--purge`) và của các fixture. Không chạy nó trên stack có dữ liệu thật; hãy dùng stack riêng như `COMPOSE_PROJECT_NAME=dxos-clean`. Script tự dừng với mã 1 khi `./dxos list` cho thấy một trong các app đó hoặc `hello` đang được cài, và tự bật `./dxos worker` của riêng nó nên không chạy được khi đã có một worker khác.

## 9. Mười phút với `hello`

1. **Khởi động lõi** (một lần): `make platform-up`, rồi bật web như trên. Đăng nhập được tại http://localhost:3000.
2. **Kiểm tra manifest:**
   ```bash
   ./dxos validate miniapps/hello      # /repo/miniapps/hello: hợp lệ (đường dẫn trong dxos-cli)
   ```
3. **Cài và xem:**
   ```bash
   ./dxos install miniapps/hello       # ... Đã cài hello
   ./dxos list                         # hello  0.1.0  <thời điểm>  Up ... (healthy)
   ```
4. **Mở trong ứng dụng:**
   - Đăng nhập bằng bất kỳ vai trò nào và bấm mục **Xin chào** trong menu.
   - Trang hiện "Xin chào <tên>, HTX <mã>, vai trò <vai trò>".
   - Gửi một lời nhắn: form đi qua web, gateway, tới app, rồi app chuyển hướng 303 về trang có lời nhắn.
   - Đổi giao diện sáng/tối ở thanh trên rồi mở lại trang: khung nhận `?theme=`.
5. **Chạy test của app:** `cd miniapps/hello && python3 -m unittest`.
6. **Viết app của anh:**
   ```bash
   cp -R miniapps/hello miniapps/my-app
   ```
   - Trong `app.yaml`, đổi `id: my-app`, `name` và `label` của menu.
   - Trong `app.py`, đổi `PREFIX = "/apps/my-app"`.
   - Chạy `./dxos validate miniapps/my-app`, rồi `./dxos install miniapps/my-app`. Sửa code rồi nâng cấp tại chỗ: `./dxos upgrade miniapps/my-app` (giữ dữ liệu và việc bật theo HTX).
7. **Thêm database** (khi cần):
   - Thêm `database: { migrations: migrations/ }` và `migrations/001_init.sql`; mọi bảng có `htx_code text NOT NULL`.
   - Đọc `DXOS_APP_DB_URL` từ môi trường.
   - Lọc mọi truy vấn theo `htx_code` của token.
8. **Gỡ:**
   ```bash
   ./dxos remove hello                 # Đã gỡ hello
   ./dxos list                         # Chưa cài app nào
   ```
   Mục menu biến mất ở lần tải trang sau, và `/apps/hello/` trả 404 ngay.

Trước khi gửi PR cho một mini-app mới:
- thêm header SPDX vào mọi tệp;
- ghim chính xác phiên bản mọi thư viện;
- ghi thư viện mới và giấy phép vào `DEPENDENCIES.md`.
