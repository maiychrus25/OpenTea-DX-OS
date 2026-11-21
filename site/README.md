# Trang giới thiệu dự án (site/)

Thư mục này là trang công khai của dự án, xuất bản bằng GitHub Pages tại `https://maiychrus25.github.io/OpenTea-DX-OS/`.

## Nguồn sự thật

- `index.html` (tiếng Việt) và `en/index.html` (tiếng Anh) là **nguồn viết tay**. Sửa trực tiếp hai tệp này; không có bước sinh HTML nào từ mã khác.
- `assets/site.css`, `assets/site.js` là giao diện và hành vi của trang chủ. `assets/docs.css`, `assets/docs.js` dành cho trang tài liệu.
- `docs-src/start.md` và `docs-src/start-en.md` là trang bắt đầu của mục tài liệu, viết tay bằng Markdown.
- `og-image.png` là ảnh xem trước mạng xã hội (1200 × 630), dựng từ ảnh chụp màn hình của dự án.
- Ảnh chụp màn hình và biểu tượng **không** được lưu trong thư mục này: `scripts/build-site.sh` sao chép chúng từ đường dẫn gốc trong repo vào `media/`.

Hai trang chủ có cùng cấu trúc. Khi sửa một mục, hãy sửa cả hai tệp.

## Cấu trúc trang chủ

Thứ tự mục: tiêu đề và hero, dải số liệu, "Một ngày của lô chè A3" (câu chuyện), "Vì sao", ba tầng (sơ đồ SVG với hai luồng có thể làm nổi), "Có thể làm gì" (bento và trình chiếu màn hình thật), thư viện ảnh, nhà phát triển, mã nguồn mở, tình trạng, chân trang.

Thanh điều hướng có cùng các mục và cùng thứ tự ở trang chủ và ở trang tài liệu.

## Giá trị được điền lúc xây dựng

Một số giá trị đọc từ repo, không được gõ tay. Trong HTML, chúng là phần tử có thuộc tính `data-inject`, với nội dung giữ chỗ đọc được khi chưa điền:

| Khoá | Nguồn | Ví dụ |
| --- | --- | --- |
| `version` | `apps/web/package.json`, trường `version` | `v1.13.0` |
| `latest` | mục phiên bản có phát hành mới nhất trong `CHANGELOG.md` (`## [X.Y.Z] - YYYY-MM-DD`) | `v1.13.0 · 2026-11-22` |
| `releases` | số tiêu đề `## [X.Y.Z]` trong `CHANGELOG.md` | `17` |
| `apps` | số thư mục con của `miniapps/` có `app.yaml` | `7` |

`scripts/inject-site-values.py` điền các giá trị này; `scripts/build-site.sh` gọi nó sau khi sao chép trang.

## Xây dựng và xem trước

```bash
bash scripts/build-site.sh build/site        # tạo thư mục xuất bản
python3 -m pip install "markdown==3.7"       # cần cho trang tài liệu (xem DEPENDENCIES.md)
```

Xem trước đúng đường dẫn con như trên GitHub Pages:

```bash
bash scripts/build-site.sh /tmp/preview/OpenTea-DX-OS
cd /tmp/preview && python3 -m http.server 8000
# mở http://localhost:8000/OpenTea-DX-OS/  và  /OpenTea-DX-OS/en/  và  /OpenTea-DX-OS/docs/
```

Mọi đường dẫn trong trang là tương đối, nên trang hoạt động cả ở thư mục gốc lẫn dưới đường dẫn con.

## Kiểm tra

- Mọi đường dẫn và ảnh nội bộ phải tồn tại. Kiểm tra này nên chạy trên thư mục đã xây dựng, sau `scripts/build-site.sh`.
- Trang phải đọc được khi tắt JavaScript. Các thành phần động (đổi giao diện, xem ảnh lớn, tìm trong tài liệu, đếm số, câu chuyện cuộn theo bước) chỉ là lớp nâng cấp.
- Không được có yêu cầu ra ngoài khi tải trang. Liên kết tới GitHub chỉ là liên kết, không được tải khi mở trang.
