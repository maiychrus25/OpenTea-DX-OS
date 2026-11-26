<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Benchmark agent

Lệnh `make benchmark` chạy toàn bộ bộ kịch bản của các agent (A1 đến A10) qua chính các hàm của agent, với một nhà cung cấp LLM và một model bạn chọn. Kết quả là bảng số ca, số ca đúng, độ trễ trung vị và chi phí ước tính. Mỗi lần chạy thêm một mục mới vào cuối file này, dưới tiêu đề gồm ngày, nhà cung cấp và model.

## Cách chạy

```sh
make benchmark PROVIDER=replay
make benchmark PROVIDER=anthropic MODEL=claude-haiku-5-5
make benchmark PROVIDER=openai MODEL=<id model>
make benchmark PROVIDER=ollama MODEL=<id model>
```

- `PROVIDER` mặc định là `replay`. Replay trả lời từ chính dữ liệu kịch bản: không gọi mạng, không tốn tiền, chạy được trên mọi máy có `uv`.
- `anthropic` cần biến môi trường `ANTHROPIC_API_KEY`. `ANTHROPIC_API_BASE` là tùy chọn.
- `openai` cần `OPENAI_API_KEY` và `MODEL`, vì không có model mặc định. `OPENAI_API_BASE` là tùy chọn.
- `ollama` đi qua cổng gateway: đặt `DXOS_GATEWAY_URL` và `DXOS_BENCH_TOKEN` (token bearer của tài khoản agent).
- Khóa chỉ đọc từ môi trường và không bao giờ được in ra. Khi thiếu khóa, chương trình chỉ nêu tên biến.
- Một nhà cung cấp lỗi không dừng lần chạy. Ca đó được ghi là sai kèm loại lỗi, các ca còn lại vẫn chạy và bảng vẫn được ghi.

## Cách chấm

Một ca được tính đúng khi:

- **Agent luật (A2, A3, A4):** danh sách đề xuất khớp kết quả kỳ vọng.
- **A1:** quyết định cho từng nhật ký (từ chối, yêu cầu sửa kèm mã lý do, hoặc duyệt) khớp kỳ vọng. Quyết định do luật cứng đưa ra, nên nhà cung cấp không ảnh hưởng đến cột này.
- **A5, A9, A10:** đầu ra qua được schema và giới hạn độ dài của agent. Với A9 và A10, phần do luật quyết định (mục đã chọn, mục bị loại, mã chỉ số, số liệu đo) cũng phải khớp kỳ vọng.
- **A7:** ý định khớp kỳ vọng.

Độ trễ là thời gian chạy một ca. Chi phí là ước tính theo bảng giá trong `platform/agent/dxos_agent/providers/pricing.py`, cộng từ số token mà agent báo lại. Nhà cung cấp nội bộ và replay không có chi phí, và các bộ chỉ dùng luật có chi phí bằng 0.

## Bảng replay gốc

Bảng dưới đây là lần chạy nền bằng replay. Replay phải đạt 100% đúng ở mọi bộ. Nếu một bộ dưới 100%, lỗi nằm ở kịch bản hoặc ở agent, không phải ở nhà cung cấp.

## 2026-11-26 · replay · replay-v1

| Bộ kịch bản | Số ca | Đúng | Độ trễ trung vị (ms) | Chi phí (USD) |
|---|---:|---:|---:|---:|
| a1_journal_review | 12 | 12 | 0.0 | 0.0000 |
| a2_field_watch | 8 | 8 | 0.1 | 0.0000 |
| a3_disease_watch | 7 | 7 | 0.0 | 0.0000 |
| a4_harvest_ready | 5 | 5 | 0.0 | 0.0000 |
| a5_bulletin | 4 | 4 | 0.1 | 0.0000 |
| a7_assistant | 9 | 9 | 0.1 | 0.0000 |
| a9_daily_campaign | 10 | 10 | 0.1 | 0.0000 |
| a10_improvement | 25 | 25 | 0.0 | 0.0000 |
| a10_improvement_measurement | 10 | 10 | 0.0 | 0.0000 |
| **Tổng** | 90 | 90 | 0.0 | 0.0000 |
