<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->

# Thẻ mô hình: bệnh lá chè (`tea_leaf_model.keras`)

Ngày huấn luyện: 2026-11-10. Mã: `ai-models/tea/train.py`. Kết quả gốc: `.work/metrics.json` (không commit).

## Tóm tắt

- Phân loại ảnh **một lá chè** thành 8 lớp (`ai-models/tea_class_names.txt`).
- Độ chính xác trên tập kiểm tra: **0,8683** (1.025 ảnh). Đạt ngưỡng dừng 0,80 của đặc tả.
- Ngưỡng tin cậy: **0,60**. Dưới ngưỡng thì trả "không xác định".
- **Cảnh báo:** kiểm tra chéo giữa các nguồn chỉ đạt 0,12 đến 0,35. Mô hình học cả đặc điểm riêng của từng bộ ảnh (phông nền, ánh sáng, cách chụp). Với ảnh chụp ở Việt Nam, độ chính xác thực tế có thể thấp hơn nhiều so với 0,87. Mọi kết quả là gợi ý của AI và cần cán bộ xác nhận.

## Dữ liệu

Ba bộ dữ liệu CC BY 4.0 trên Mendeley Data. Ghi công đầy đủ ở `ai-models/ATTRIBUTION.md`.

| Nguồn (id) | Bộ dữ liệu | DOI | Nơi thu | Ghi chú |
| --- | --- | --- | --- | --- |
| `kimutai` | tea sickness dataset (Kimutai, Förster) | 10.17632/j32xdt2ff5.2 | Kenya | Thư mục theo lớp; bỏ lớp `Anthracnose` (100 ảnh) vì không thuộc bộ lớp chung |
| `islam` | Tea leaf disease Dataset (Md Samiul Islam) | 10.17632/mz598gxfw9.1 | Bangladesh | Xuất từ Roboflow theo định dạng YOLOv8, mỗi ảnh có một khung; cắt theo khung; 79 ảnh không có khung bị bỏ |
| `billah` | Real-Life Dataset of Tea Plant Leaf Disease Classification, bản nén (Billah và cộng sự) | 10.17632/rrff4vb35m.2 | Bangladesh | Chỉ dùng `Tea Compressed Dataset.zip`; ảnh 512×512, gồm ảnh JPG và ảnh PNG đã xoá nền |

Bảng gộp tên lớp nằm trong `datasets.json`. Xử lý trong bước `prepare`:

- Bỏ 49 ảnh trùng hoàn toàn (trùng điểm ảnh sau khi thu về 224×224) và 2 ảnh trùng nhau nhưng khác nhãn.
- Ảnh gần trùng (cùng mã băm trung bình 8×8) và các bản lật của cùng một ảnh Roboflow (`<tên>.rf.<mã>`) được xếp chung một nhóm. Mỗi nhóm chỉ nằm trong một tập (huấn luyện, kiểm định hoặc kiểm tra). Bộ chia sẵn của Roboflow bị rò rỉ (101 ảnh gốc nằm ở nhiều tập) nên không dùng.
- Lớp dưới 100 ảnh bị bỏ. Lần này không lớp nào bị bỏ; `birds_eye_spot` có đúng 100 ảnh.
- Chia 70/15/15 theo từng lớp và theo nhóm, seed `20261110`.
- Còn sót một ít ảnh gần trùng giữa tập huấn luyện và tập kiểm tra, vì mã băm 8×8 không bắt được mọi khung hình chụp liên tiếp. Ví dụ: ảnh Islam `UNADJUSTEDNONRAW_thumb_237` (huấn luyện) và `thumb_238` (kiểm tra) là hai khung liên tiếp của cùng một lá. Khi bỏ khỏi tập kiểm tra các ảnh có ảnh gần giống trong tập huấn luyện, độ chính xác là 0,875 đến 0,896, tuỳ mức loại bỏ. Như vậy con số 0,8683 không bị thổi phồng. Chưa đổi cách nhóm, vì đổi sẽ phải huấn luyện lại.

Số ảnh từng lớp sau khi lọc:

| Lớp | kimutai | islam | billah | Tổng | Huấn luyện | Kiểm định | Kiểm tra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `algal_leaf_spot` | 113 | 672 | 152 | 937 | 660 | 135 | 142 |
| `birds_eye_spot` | 100 | 0 | 0 | 100 | 70 | 15 | 15 |
| `brown_blight` | 113 | 640 | 192 | 945 | 658 | 138 | 149 |
| `gray_blight` | 98 | 796 | 183 | 1.077 | 743 | 165 | 169 |
| `healthy` | 74 | 1.413 | 199 | 1.686 | 1.171 | 265 | 250 |
| `helopeltis` | 0 | 778 | 0 | 778 | 543 | 121 | 114 |
| `red_leaf_spot` | 143 | 802 | 190 | 1.135 | 807 | 165 | 163 |
| `white_spot` | 142 | 0 | 0 | 142 | 96 | 23 | 23 |
| **Tổng** | 783 | 5.101 | 916 | 6.800 | 4.748 | 1.027 | 1.025 |

Số ảnh gốc theo nhãn của từng nguồn, trước khi gộp:

- kimutai: algal leaf 113, Anthracnose 100 (bỏ), bird eye spot 100, brown blight 113, gray light 100, healthy 74, red leaf spot 143, white spot 142.
- islam (số khung): Algal Leaf Spot 672, Brown Blight 640, Gray Blight 796, Healthy 1.413, Helopeltis 778, Red Leaf Spot 802.
- billah: Tea Algal Spot 198, Tea Brown Blight 192, Tea Grey Blight 184, Tea Healthy 200, Tea Red Spot 191.

## Đầu vào và tiền xử lý

Giống hệt mô hình 46 lớp trong `apps/disease-api/app/main.py` (`_preprocess_image`): ảnh RGB, thu về 224×224 bằng PIL, chia cho 255, mảng float32 `(n, 224, 224, 3)`. Bước đổi thang `[0, 1]` sang `[-1, 1]` mà MobileNetV2 cần là một lớp `Rescaling` nằm trong mô hình. Đã kiểm tra trên 170 ảnh: điểm ảnh lúc huấn luyện và điểm ảnh qua `_preprocess_image` lệch nhau tối đa 3e-8.

## Huấn luyện

- MobileNetV2 (alpha 1,0, trọng số ImageNet do Keras tải về, giấy phép Apache 2.0), tiếp theo là `GlobalAveragePooling`, Dropout 0,2 và Dense softmax 8 lớp. Tổng 2.268.232 tham số.
- Tăng cường dữ liệu (chỉ khi huấn luyện): lật ngang và dọc, xoay ±36°, phóng to/thu nhỏ 10%.
- Trọng số lớp cân bằng theo số ảnh huấn luyện. Batch 32. Seed `20261110`.
- Giai đoạn 1, đóng băng toàn bộ MobileNetV2: Adam 1e-3, tối đa 15 epoch. Chạy 13 epoch, tốt nhất ở epoch 10 (val_loss 0,6080, val_accuracy 0,7907).
- Giai đoạn 2, tinh chỉnh 30 lớp cuối của MobileNetV2, giữ đóng băng các lớp BatchNorm: Adam 5e-5, tối đa 10 epoch. Chạy 10 epoch, tốt nhất ở epoch 8 (val_loss 0,3945, val_accuracy 0,8617).
- Dừng sớm theo val_loss (patience 3), khôi phục trọng số tốt nhất.
- Môi trường: `python:3.12.15-slim-bookworm`, `tensorflow==2.21.0`, `keras==3.15.1`, CPU.
- Kích thước file: 9.665.146 byte (9,2 MB).

## Kết quả trên tập kiểm tra

Độ chính xác tổng thể: **0,8683**.

| Lớp | Precision | Recall | F1 | Số ảnh |
| --- | ---: | ---: | ---: | ---: |
| `algal_leaf_spot` | 0,8542 | 0,8662 | 0,8601 | 142 |
| `birds_eye_spot` | 0,5357 | 1,0000 | 0,6977 | 15 |
| `brown_blight` | 0,8667 | 0,7852 | 0,8239 | 149 |
| `gray_blight` | 0,7306 | 0,8343 | 0,7790 | 169 |
| `healthy` | 0,9702 | 0,9120 | 0,9402 | 250 |
| `helopeltis` | 0,9907 | 0,9386 | 0,9640 | 114 |
| `red_leaf_spot` | 0,9085 | 0,8528 | 0,8797 | 163 |
| `white_spot` | 0,6897 | 0,8696 | 0,7692 | 23 |

Nhầm lẫn lớn nhất: `brown_blight` bị đoán thành `gray_blight` (25 ảnh), `healthy` thành `gray_blight` (14). Nhiều lớp bị đoán nhầm thành `birds_eye_spot` (13 ảnh), lớp chỉ có ở nguồn Kenya.

Độ chính xác trên tập kiểm tra theo nguồn: kimutai 0,8120 (133 ảnh), islam 0,9401 (751), billah 0,5390 (141).

## Kiểm tra chéo giữa các nguồn

Huấn luyện bằng cùng công thức trên tập huấn luyện và kiểm định của hai nguồn, rồi kiểm tra trên **toàn bộ** nguồn còn lại.

| Nguồn để riêng | Số ảnh | Độ chính xác | Độ chính xác trên các lớp có trong dữ liệu huấn luyện | Lớp không có khi huấn luyện |
| --- | ---: | ---: | ---: | --- |
| billah | 916 | 0,1212 | 0,1212 | không |
| islam | 5.101 | 0,2974 | 0,3509 | `helopeltis` |
| kimutai | 783 | 0,3538 | 0,5120 | `birds_eye_spot`, `white_spot` |

Kết quả này rất thấp. Mỗi nguồn chụp lá rời trên một kiểu nền riêng: Kenya dùng nền có ánh xanh hoặc tím khác nhau giữa các lớp, Islam cắt sát lá trên nền xám, Billah dùng nền trắng hoặc nền đen đã xoá. Mô hình dùng cả những đặc điểm này để đoán. Độ chính xác 0,87 chỉ đúng cho ảnh giống ba bộ dữ liệu này.

## Ngưỡng tin cậy

Quy tắc: chọn giá trị thấp nhất, từ 0,60 trở lên, sao cho trên tập kiểm định các dự đoán được chấp nhận (độ tin cậy lớn nhất ≥ ngưỡng) có precision ≥ 0,90. Kết quả: **0,60**, vì ngay giá trị sàn đã đạt yêu cầu.

| Tập | Precision của dự đoán được chấp nhận | Tỉ lệ ảnh được chấp nhận |
| --- | ---: | ---: |
| Kiểm định | 0,9285 | 0,8715 |
| Kiểm tra | 0,9222 | 0,8780 |

## Huấn luyện lại

Xem `ai-models/tea/README.md`. Tóm tắt: trong `ai-models/tea`, chạy `python -I train.py download`, rồi `prepare`, `train`, `evaluate` trong `python:3.12.15-slim-bookworm` đã cài `requirements.txt`, sau đó chép `.work/tea_leaf_model.keras` và `.work/tea_class_names.txt` lên `ai-models/`. Bước `download` kiểm tra SHA-256 theo `datasets.json`. Huấn luyện chính mất khoảng 15 phút trên CPU; kiểm tra chéo mất khoảng 40 phút.

## Giới hạn

- Ảnh chỉ đến từ **Kenya và Bangladesh**, chủ yếu là lá rời đặt trên nền trơn. Chưa có ảnh chè Việt Nam, ảnh lá còn trên cây, hay ảnh có nhiều lá.
- **Không có bệnh phồng lá chè** (blister blight) và không có thán thư (anthracnose). Ảnh của các bệnh này sẽ bị xếp vào một lớp khác.
- `birds_eye_spot` (100 ảnh) và `white_spot` (142 ảnh) chỉ có ở Kenya. `helopeltis` chỉ có ở bộ Islam. Precision của `birds_eye_spot` thấp (0,54).
- Kiểm tra chéo giữa các nguồn chỉ đạt 0,12 đến 0,35 (xem trên). Ngưỡng 0,60 được chọn trên dữ liệu cùng nguồn nên không bảo đảm precision 0,90 với ảnh mới.
- Tên tiếng Việt trong `ai-models/tea_class_names_vi.json` đều cần cán bộ xác nhận (`needs_officer_review: true`). Nông dân thường gọi cả **brown blight** và **anthracnose** là "thán thư" nên rất dễ nhầm; tên `brown_blight` vì vậy được để nguyên tiếng Anh.
- Bọ xít muỗi (`helopeltis`) là côn trùng gây hại, không phải bệnh do nấm.
- Ảnh không phải lá chè (ảnh lạc đề hoặc ảnh nhiễu) vẫn có thể nhận độ tin cậy cao. Ví dụ: một ảnh nhiễu ngẫu nhiên được trả `healthy` với độ tin cậy 0,988. Ngưỡng 0,60 không lọc được những ảnh này. Mọi kết quả, kể cả `healthy` (lá khoẻ), đều cần cán bộ xác nhận.
- Mô hình chỉ trả tên lớp và độ tin cậy, không đưa khuyến nghị điều trị.
