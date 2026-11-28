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

Bảy mục, theo thứ tự: hero (tiêu đề, một câu, hai nút), dải số liệu (ba con số đếm từ repo), "Từ thửa chè đến mã QR" (câu chuyện A3 với các bước), "Một HTX làm được gì" (sáu năng lực), màn hình thật (sáu tab, mở ảnh lớn), kiến trúc ba tầng (ba lớp và hai luồng có thể chọn), nhà phát triển (terminal và ba đảm bảo), dải đóng (giấy phép, phiên bản, giới hạn đã biết), chân trang.

Thanh điều hướng có năm mục giống nhau ở trang chủ và trang tài liệu. Trên màn hình dưới 1100 px, các mục mở từ nút "Mục" (một checkbox, không cần JavaScript).

Ghi chú về ảnh minh hoạ: nhật ký và chẩn đoán bệnh chưa có ảnh chụp trong repo, nên câu chuyện dùng minh hoạ SVG có nhãn.

## Giá trị được điền lúc xây dựng

Một số giá trị đọc từ repo, không được gõ tay. Trong HTML, chúng là phần tử có thuộc tính `data-inject`, với nội dung giữ chỗ đọc được khi chưa điền:

| Khoá | Nguồn | Ví dụ |
| --- | --- | --- |
| `version` | `apps/web/package.json`, trường `version` | `v1.13.0` |
| `latest` | mục phiên bản có phát hành mới nhất trong `CHANGELOG.md` (`## [X.Y.Z] - YYYY-MM-DD`) | `v1.13.0 · 2026-11-22` |
| `releases` | số tiêu đề `## [X.Y.Z]` trong `CHANGELOG.md` | `17` |
| `apps` | số thư mục con của `miniapps/` có `app.yaml`, trừ `FROZEN_APPS` trong `scripts/inject-site-values.py` (các app đã đóng băng, không được quảng bá) | `4` |

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
