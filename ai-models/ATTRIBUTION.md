# AI Models — Attribution & License

## Disease Detection Model

### `leaf_disease_model.keras`

| Field | Value |
|-------|-------|
| **Source** | [CuongKenn/ICTU-OpenAgri](https://github.com/CuongKenn/ICTU-OpenAgri) |
| **Authors** | CuongKenn and ICTU-OpenAgri Contributors |
| **License** | MIT License |
| **Original Path** | `backend/ml_models/leaf_disease_model.keras` |
| **Framework** | TensorFlow / Keras |
| **Classes** | 46 classes (see `class_names.txt`) |
| **Downloaded** | 2026-08-18 |

### `class_names.txt`

| Field | Value |
|-------|-------|
| **Source** | [CuongKenn/ICTU-OpenAgri](https://github.com/CuongKenn/ICTU-OpenAgri) |
| **Original Path** | `backend/ml_models/class_names.txt` |
| **License** | MIT License |

---

## Tea Leaf Disease Model

### `tea_leaf_model.keras`, `tea_class_names.txt`, `tea_class_names_vi.json`

| Field | Value |
|-------|-------|
| **Authors** | OpenTea Developers (trained with `ai-models/tea/train.py`) |
| **License** | MIT for the code and class files; the model is trained on the CC BY 4.0 datasets below |
| **Framework** | TensorFlow 2.21.0 / Keras 3.15.1, MobileNetV2 transfer learning |
| **Model card** | `ai-models/tea/MODEL_CARD.md` |
| **Trained** | 2026-11-10 |

### Training data (all CC BY 4.0, https://creativecommons.org/licenses/by/4.0/)

| Dataset | Authors | DOI | Use |
|---------|---------|-----|-----|
| tea sickness dataset (version 2) | Gibson Kimutai, Anna Förster | [10.17632/j32xdt2ff5.2](https://doi.org/10.17632/j32xdt2ff5.2) | All classes except `Anthracnose`; images resized to 224x224 |
| Tea leaf disease Dataset (version 1) | Md Samiul Islam | [10.17632/mz598gxfw9.1](https://doi.org/10.17632/mz598gxfw9.1) | `Tea Leaf Diseases.zip`, bounding boxes cropped and resized to 224x224 |
| Real-Life Dataset of Tea Plant Leaf Disease Classification (version 2) | Md Masum Billah, Saifuddin Sagor, Azmery Sultana, Mohammad Shorif Uddin | [10.17632/rrff4vb35m.2](https://doi.org/10.17632/rrff4vb35m.2) | `Tea Compressed Dataset.zip` only; images resized to 224x224 |

Changes: labels merged into one set of class ids (`ai-models/tea/datasets.json`), exact duplicates removed, images
cropped/resized for training. No images are redistributed in this repository.

### Pretrained weights

| Field | Value |
|-------|-------|
| **Weights** | MobileNetV2 ImageNet weights, `mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224_no_top.h5` |
| **Source** | Downloaded by `keras.applications.MobileNetV2` from `https://storage.googleapis.com/tensorflow/keras-applications/mobilenet_v2/` |
| **License** | Apache License 2.0 (Keras Applications); trained on ImageNet ILSVRC-2012 |

---

## MIT License Notice (ICTU-OpenAgri)

```
MIT License

Copyright (c) 2025 CuongKenn and ICTU-OpenAgri Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Usage in DX-AgriMarket

- Model is loaded by `apps/disease-api/` FastAPI service
- Used for crop disease classification (image → disease name + confidence)
- **AI Invariant:** Response contains disease name + confidence ONLY — NO treatment recommendations
- Model weights are git-ignored; download via `download-model.ps1` script
