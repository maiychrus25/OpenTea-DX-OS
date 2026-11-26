<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Nhiệm vụ

Bạn viết một mini-app cho nền tảng OpenTea DX-OS, theo đặc tả đã được trưởng HTX duyệt trong `/work/SPEC.md`. Làm việc trong `/work` và chỉ trong đó. Không có mạng ngoài API của bạn; đừng cố truy cập nơi khác.

Điểm xuất phát đã nằm sẵn trong `/work`: app mẫu `hello` (`app.py`, `app.yaml`, `Dockerfile`, `test_app.py`) và bộ kit dùng chung trong `/work/_kit/` (`appkit.py`, `kit.html`). `app.yaml` đã có `id`, `version` và `generated: true`: đừng đổi ba dòng này, bên chạy sẽ đặt lại.

## Mẫu phải theo

Xây app FastAPI theo đúng cấu trúc của các mini-app trong kho (xem `hello` và ví dụ dưới):

```
app.yaml                 manifest (xem dưới)
Dockerfile               FROM python:3.12.15-slim-bookworm; pip install --no-cache-dir -r /app/requirements.txt; USER 10001:10001;
                         CMD ["uvicorn", "<gói>.main:app", "--host", "0.0.0.0", "--port", "8080", "--root-path", "/apps/<id>", "--no-server-header"]
requirements.txt         chỉ các dòng trong danh sách cho phép (dưới)
requirements-dev.txt     "-r requirements.txt", pytest==9.1.1, httpx2==2.16.0
migrations/001_init.sql  mọi bảng có cột htx_code text NOT NULL; không có dữ liệu thật
sample_data.sql          dữ liệu mẫu cho HTX "TC" (bắt buộc, dùng để chạy thử và chụp màn hình)
<gói>/__init__.py, main.py, store.py, appkit.py (chép từ _kit/), templates/{base,message,<trang>}.html, templates/kit.html (chép từ _kit/kit.html)
tests/conftest.py, tests/test_app.py
```

Sau khi chép kit vào gói, xoá thư mục `_kit/`, cùng `app.py`, `test_app.py` và `README.md` của app mẫu `hello` (thay bằng app của bạn). Không sửa `appkit.py` và `kit.html`: bản chép phải giống hệt bản gốc.

## Luật cứng (có cổng kiểm tra tự động, trượt là phải làm lại)

1. **manifest**: `app.yaml` hợp lệ với `platform/apps/manifest.schema.json`; `id` là `gen-<tên>`; `generated: true`; **không** có khối `agent` (app do AI xây không được khai hành động). Có `routes.protected` cho mọi đường dẫn, `database.migrations`, `store.about`, `store.data`, `store.personal_data`.
2. **markup**: không JavaScript, không `<script>`, không `<style>`, không thuộc tính `style=`, không `onclick=` và tương tự, không `javascript:`. Giao diện dùng `/dxos-app.css` của nền tảng và các macro trong `kit.html`.
3. **kit**: `appkit.py` và `kit.html` giống hệt bản trong `_kit/`.
4. **tests**: pytest xanh, **mỗi route (mỗi phương thức và đường dẫn) có ít nhất một test đã qua**. Không bỏ qua test (`skip`, `xfail`), không viết hook của pytest làm đổi kết quả. Test dùng Postgres tạm: biến môi trường `DXOS_TEST_DB_URL` là URL của một server tạm (người dùng postgres); `conftest.py` tạo role `app_<id với gạch dưới>`, schema cùng tên, chạy migrations với role đó (xem mẫu: farm-supply dùng cùng cách), rồi app kết nối qua `DXOS_APP_DB_URL` với `search_path` là schema của app.
5. **deps**: chỉ dùng các thư viện này (đúng phiên bản):

   ```
   fastapi==0.162.2   uvicorn[standard]==0.54.0   python-multipart==0.0.33   jinja2==3.1.6
   psycopg[binary]==3.3.6   pytest==9.1.1   httpx2==2.16.0
   ```

   Dockerfile chỉ được dùng `FROM python:3.12.15-slim-bookworm`, `ENV`, `COPY`, `WORKDIR`, `USER`, `EXPOSE`, `CMD` và `RUN pip install --no-cache-dir -r <requirements>`.
6. **files**: mọi tệp mã, mẫu giao diện, SQL, YAML, Dockerfile, requirements có hai dòng SPDX ở đầu (`SPDX-License-Identifier: MIT` và `SPDX-FileCopyrightText: 2026 OpenTea Developers`, theo kiểu chú thích của loại tệp); không có tệp `.env`, không có khoá bí mật, không tệp nào quá 1 MB, không liên kết tượng trưng.
7. **run**: app chạy với migrations và `sample_data.sql`; mỗi màn hình trong đặc tả được mở bằng trình duyệt ở 1280×800 và 390×844, giao diện sáng và tối (thêm `?theme=light` hoặc `?theme=dark`). Không được có lỗi 5xx hay cuộn ngang. Mỗi màn hình trả về 200 với tài khoản trưởng HTX (`manager`) của HTX `TC`.

## Quy ước của app

- Token đăng nhập nằm trong header `Authorization: Bearer …`; dùng `appkit.read_claims(...)`, mọi truy vấn lọc theo `htx_code` của người gọi. Kiểm vai trò trong route (đừng chỉ tin gateway).
- Mọi liên kết, form, chuyển hướng ghi lại tiền tố `/apps/<id>`. Ghi dữ liệu bằng POST rồi trả 303. Giữ `?theme=` qua các liên kết và chuyển hướng.
- Văn bản hiển thị bằng tiếng Việt; tên định danh trong mã bằng tiếng Anh.
- Bám sát đặc tả: không thêm màn hình, bảng hay tính năng ngoài đặc tả. Số liệu chỉ đọc cho trợ lý (nếu đặc tả có) chỉ là các trang đọc thông thường.
- Dừng khi tất cả đã xong và tự chạy được `python -m pytest` (cần `DXOS_TEST_DB_URL` như ở trên). Không cần `git`.
