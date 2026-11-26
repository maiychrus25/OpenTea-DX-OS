<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Bảng điều hành HTX (`htx-dashboard`)

Mini-app chỉ đọc cho trưởng HTX: một góc nhìn tổng thể và theo dõi hợp tác xã. Không có database; mọi số liệu đọc từ lõi qua Hasura bằng token của người đang xem. Đặc tả: [`docs/specs/2026-11-20-htx-dashboard-design.md`](../../docs/specs/2026-11-20-htx-dashboard-design.md).

| Tab | Đường dẫn | Biểu đồ |
| --- | --- | --- |
| Tổng quan | `/` | Chỉ số kèm xu hướng; việc cần chú ý; thửa theo trạng thái (donut); diện tích theo cây; phễu lô; hoạt động theo tuần (cột xếp chồng); giá xuất khẩu; số đo cảm biến theo ngày (5 biểu đồ nhỏ); sức khoẻ cảm biến theo thửa (bảng màu); báo cáo bệnh theo tuần; lịch thu hoạch 30 ngày (Gantt) |
| Sản xuất | `/production` | Lịch nhật ký theo ngày (heatmap); loại hoạt động (donut); hộ ghi nhật ký (thanh ngang); vụ từ gieo đến thu hoạch dự kiến (Gantt); sản lượng kỳ vọng theo tháng và theo cây |
| Vùng trồng | `/parcels`, `/parcels/<mã thửa>` | Thửa theo trạng thái và diện tích theo cây; xu hướng 30 ngày của từng cảm biến trong bảng. Bản sao số của thửa: thang giá trị hiện tại trong khoảng 30 ngày, 5 biểu đồ theo ngày, nhiệt độ đặt cạnh độ ẩm (phân tán), lượng mưa (cột) |
| Sức khoẻ cây | `/health` | Báo cáo bệnh theo tuần và loại; trạng thái xử lý; độ tin cậy AI; xác nhận và chỉ có AI; thửa bị báo cáo nhiều nhất |
| Lô chè | `/lots` | Phễu theo giai đoạn; lô tạo mỗi tháng theo trạng thái; dự kiến và thực tế; hạng chất lượng |
| Dữ liệu | `/data` | Số đo kho nóng mỗi ngày (vùng); số đo theo loại cảm biến; ma trận cảm biến theo thửa; số dòng mỗi lần chuyển sang kho lạnh (lần lỗi đánh dấu ✕) |
| AI | `/ai` | Đề xuất theo agent và trạng thái (thanh xếp chồng); hiệu quả từng agent: tỉ lệ duyệt và từ chối, thời gian chờ, lần chạy lỗi, chi phí; cải tiến hằng tuần và kết quả đo sau 2 và 4 tuần |

Kỳ xem `?days=7|30|90` (mặc định 30). Biểu đồ số đo cảm biến luôn dùng tối đa 30 ngày, vì kho nóng chỉ giữ 30 ngày. Cần lõi `>=1.13.0`: app đọc view `telemetry_sensor_daily`.

## Cấu trúc

- `core_client.py`: mỗi truy vấn là một hằng, biến đi riêng; các khối chạy song song, mỗi khối tối đa 5 giây; một khối hỏng không làm hỏng trang.
- `metrics.py`: hàm thuần cho mọi chỉ số, xu hướng và cảnh báo (giờ Việt Nam, tuần bắt đầu thứ Hai).
- `charts.py`: bộ vẽ biểu đồ (hình học thuần, có kiểm thử); `pages.py`: dựng ngữ cảnh từng tab; `templates/charts.html`: các macro in biểu đồ; `main.py`: route.
- `static/dashboard.css`: bảng màu (`tone-N`, `seq-N`) cho cả hai giao diện, lưới và kiểu biểu đồ; phục vụ ở `/assets/dashboard.<hash>.css`. `appkit.py` và `templates/kit.html` là bản chép của bộ giao diện chung (`make appkit-sync`).

## Kiểm thử

```
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests -q -W error
```

Không cần stack: lõi được thay bằng câu trả lời mẫu trong `tests/sample.py`.

## Xem trước

```
.venv/bin/python tests/preview.py 8791          # cooperative mẫu: khoảng 40 thửa, 12 hộ, 30 ngày số đo
.venv/bin/python tests/preview.py 8791 --empty  # cooperative chưa có dữ liệu
```

Mở `http://127.0.0.1:8791/apps/htx-dashboard/`. Trang dùng CSP của sản phẩm; dữ liệu là mẫu, không có token thật.
