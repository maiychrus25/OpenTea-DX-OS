# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

from fastapi import FastAPI

app = FastAPI(title="Disease API")

@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": False}
