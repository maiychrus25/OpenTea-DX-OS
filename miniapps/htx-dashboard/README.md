<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Bảng điều hành HTX (`htx-dashboard`)

Mini-app chỉ đọc cho trưởng HTX: một góc nhìn tổng thể và theo dõi hợp tác xã. Không có database; mọi số liệu đọc từ lõi qua Hasura bằng token của người đang xem. Đặc tả: [`docs/specs/2026-11-20-htx-dashboard-design.md`](../../docs/specs/2026-11-20-htx-dashboard-design.md).

| Tab | Đường dẫn | Nội dung |
| --- | --- | --- |
| Tổng quan | `/` | Việc cần chú ý, dải chỉ số, lưới thửa, nhật ký theo tuần, lô, giá |
| Sản xuất | `/production` | Thửa theo trạng thái, vụ, lịch thu hoạch, nhật ký |
| Vùng trồng | `/parcels`, `/parcels/<mã thửa>` | Bảng thửa và bản sao số của từng thửa |
| Sức khoẻ cây | `/health` | Báo cáo bệnh |
| Lô chè | `/lots` | Lô theo trạng thái |
| Dữ liệu | `/data` | Kho nóng, cảm biến im lặng, chuyển sang kho lạnh |

Kỳ xem `?days=7|30|90` (mặc định 30). Cần lõi `>=1.13.0`: app đọc view `telemetry_sensor_daily`.

## Cấu trúc

- `core_client.py`: mỗi truy vấn là một hằng, biến đi riêng; các khối chạy song song, mỗi khối tối đa 5 giây; một khối hỏng không làm hỏng trang.
- `metrics.py`: hàm thuần cho mọi chỉ số và cảnh báo (giờ Việt Nam, tuần bắt đầu thứ Hai).
- `charts.py`: hình học biểu đồ đường SVG; `pages.py`: dựng ngữ cảnh từng tab; `main.py`: route.
- `static/dashboard.css`: phục vụ ở `/assets/dashboard.<hash>.css`. `appkit.py` và `templates/kit.html` là bản chép của bộ giao diện chung (`make appkit-sync`).

## Kiểm thử

```
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests -q -W error
```

Không cần stack: lõi được thay bằng câu trả lời mẫu trong `tests/sample.py`, dùng chung với script xem trước.
