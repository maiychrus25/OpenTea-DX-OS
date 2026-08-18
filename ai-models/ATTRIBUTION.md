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
