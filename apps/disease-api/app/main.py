from fastapi import FastAPI

app = FastAPI(title="Disease API")

@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": False}
