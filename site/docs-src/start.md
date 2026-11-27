# Bắt đầu đọc tài liệu

Trang này giúp bạn chọn đúng tài liệu theo vai trò. Mọi trang trong mục tài liệu được tạo từ các tệp Markdown trong kho mã nguồn, nên nội dung luôn khớp với mã nguồn tại thời điểm xuất bản.

## Bạn là cán bộ hoặc quản trị HTX

Bạn muốn biết hệ thống làm được gì và dữ liệu của HTX nằm ở đâu.

1. [Kiến trúc ba tầng](slug:architecture) cho biết lõi, ứng dụng HTX và mini-app liên quan với nhau thế nào.
2. Mục [Ứng dụng](slug:app-leaf-purchase) mô tả từng app bạn dùng: thu mua, cửa hàng, vật tư, tour, sổ tự tạo và bảng điều hành.
3. [Quy tắc và giới hạn](slug:rules) ghi các ràng buộc nghiệp vụ và giới hạn đã biết.
4. [Lộ trình sản phẩm chiến lược](slug:product-roadmap) trình bày định hướng HTX chè đa thuê bao, các giai đoạn triển khai và KPI.

## Bạn cài đặt và vận hành hệ thống

1. [Cài đặt và chạy từ mã nguồn](slug:install) có các lệnh Docker và kiểm thử theo README.
2. [Thiết lập môi trường phát triển](slug:dev-setup) dành cho người dựng môi trường để phát triển.
3. [Nhật ký thay đổi](slug:changelog) cho biết mỗi bản phát hành đã thêm gì, và phần nâng cấp cần làm.

## Bạn viết mini-app

1. [Viết mini-app](slug:miniapp-guide) là hướng dẫn chính: manifest `app.yaml`, đăng nhập, giao diện, database, bảo mật và lệnh `./dxos`.
2. [Ứng dụng mẫu hello](slug:app-hello) là điểm bắt đầu nhỏ nhất.
3. [Hợp đồng API](slug:api-contract) và [Cơ sở dữ liệu](slug:database-schema) mô tả bề mặt mà app có thể dùng.
4. [ADR 0002](slug:adr-0002) giải thích vì sao mini-app chạy như container riêng, và [ADR 0005](slug:adr-0005) chốt ranh giới chuỗi giá trị chè.

## Bạn đóng góp mã nguồn

1. [Chiến lược kiểm thử](slug:testing) và [Ngữ cảnh dự án và thuật ngữ](slug:project-context).
2. [Hệ thống thiết kế](slug:design) là nguồn sự thật cho màu, chữ và khoảng cách của giao diện.
3. [Thư viện và giấy phép](slug:dependencies) liệt kê thư viện, giấy phép và công cụ build.
4. Quy tắc đóng góp, báo lỗi và báo lỗ hổng bảo mật nằm ở [CONTRIBUTING.md](https://github.com/maiychrus25/OpenTea-DX-OS/blob/main/CONTRIBUTING.md) và [SECURITY.md](https://github.com/maiychrus25/OpenTea-DX-OS/blob/main/SECURITY.md) trên GitHub.

## Tài liệu không đưa lên trang này

Các tài liệu làm việc nội bộ của dự án như bản đặc tả (`docs/specs/`), kế hoạch (`docs/plans/`), sổ ghi các điểm sai lệch so với đặc tả và tài liệu phân tích nghiệp vụ (`docs/business-analysis.md`) không được xuất bản ở đây. Chúng vẫn nằm trong kho mã nguồn (xem mục lục tại `docs/README.md`).
