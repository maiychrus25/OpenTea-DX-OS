# Story 4.6: Disease Detection FastAPI Service

Status: ready-for-dev

## Story

As a Developer,
I want to build a Python FastAPI service that exposes a `/predict` endpoint for crop disease detection,
so that the Next.js frontend can relay farmer images for AI analysis.

## Dependencies
- **Blocks:** 5.3 (Farmer UI).

## Acceptance Criteria

1. **Given** the `/predict` endpoint **When** it receives a POST request with an image file (`multipart/form-data`) **Then** it processes the image and returns `{ "disease_name": string, "confidence_score": number }`.
2. **Given** the AI Invariant Rule **When** returning a prediction **Then** it MUST NOT return treatment recommendations.

## Tasks

### 1. Python App Setup (`apps/disease-api/`)
- [ ] **T1.1: FastAPI Boilerplate**
  - File: `apps/disease-api/app/main.py`
  - Implement `/predict` accepting `UploadFile`.
  - Stub a hash-based return logic for MVP (e.g., return "Bạc lá" if file size > 1MB, else "Đạo ôn").

### 2. Docker
- [ ] **T2.1: Dockerfile**
  - File: `apps/disease-api/Dockerfile`
  - Expose port 8000 internally.
