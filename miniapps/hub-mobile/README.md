<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mini-app `hub-mobile`: trang tải app OpenTea trên điện thoại

Thẻ trong Kho ứng dụng cho app điện thoại `apps/hub-mobile` (Flutter). App điện thoại không chạy trong container, nên mini-app này chỉ là trang hướng dẫn tải và cài. Khuôn giống `miniapps/hello`: Python thuần, không database, không lưu dữ liệu.

- `/` (cần đăng nhập, vai trò nông dân, cán bộ, trưởng HTX) và `/public/<mã HTX>` (công khai, HTX gửi cho khách) hiện cùng một trang.
- Biến môi trường của container: `HUB_APK_URL` (liên kết tải APK, mặc định trang Releases của repo) và `HUB_WEB_URL` (bản web cho iPhone; không đặt thì trang ghi bản iPhone chưa sẵn sàng). Chỉ nhận liên kết `http(s)`.
- APK nặng khoảng 67 MB nên không nằm trong repo: đăng lên GitHub Releases rồi đặt `HUB_APK_URL`.
- Kiểm thử: `python -m unittest` trong thư mục này.
