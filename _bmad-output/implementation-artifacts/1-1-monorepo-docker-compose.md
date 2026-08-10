# Story 1.1: Monorepo Structure & Docker Compose Stack

Status: review

## Story

As a developer,
I want the full project skeleton and all Docker services running locally,
so that every team member has a reproducible, one-command development environment.

## Dependencies
- **Depends on:** None
- **Blocks:** 1.2

## Acceptance Criteria

1. **Given** the repository is cloned on a fresh machine **When** `docker compose -f docker/docker-compose.yml up -d` is run **Then** all 8 services start healthy: `web` (3000), `postgres` (5432), `keycloak` (8080), `n8n` (5678), `ollama` (11434), `piper` (5500), `minio` (9000+9001), `disease-api` (8000)
2. **Given** services start **When** checked via `docker compose ps` **Then** startup order respects: postgres → keycloak → web; postgres → n8n; ollama → web (health check gate)
3. **Given** repo is cloned **When** top-level dirs are listed **Then** these exist: `apps/web/`, `apps/disease-api/`, `docker/`, `workflows/`, `docs/`, `ai-models/`
4. **Given** the repo **When** `.env.example` is read **Then** it contains all required keys: `OLLAMA_MODEL`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ISSUER`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `DISEASE_API_URL`, `PIPER_URL`, `N8N_ENCRYPTION_KEY`, `MINIO_BUCKET_NAME`
5. **Given** the repo **When** `.gitignore` is read **Then** it excludes: `.env.local`, `.env.staging`, `.env.production`, `ai-models/`, `node_modules/`, `.next/`, `__pycache__/`, `apps/disease-api/.venv/`, `*.pyc`
6. **Given** `apps/web/` **When** `npx next --version` is run inside the container **Then** it confirms Next.js 14 App Router; `tsconfig.json` has `"strict": true` and `"noUnusedLocals": true`

## Tasks / Subtasks

- [x] **T1: Create monorepo top-level structure** (AC: 3)
  - [x] Create `apps/web/` as Next.js 14 App Router project (`npx create-next-app@14 apps/web --typescript --app --no-tailwind --no-src-dir` then move to src layout per AD-18)
  - [x] Create `apps/disease-api/` with FastAPI skeleton (`main.py`, `requirements.txt`, `Dockerfile`)
  - [x] Create empty dirs: `docker/`, `workflows/`, `docs/`, `ai-models/` (gitkeep)
  - [x] Move existing files if any to correct locations per AD-2

- [x] **T2: Write Docker Compose** (AC: 1, 2)
  - [x] `docker/docker-compose.yml` — define all 8 services with correct images
  - [x] `postgres`: image `postgres:16-alpine`, volume `pgdata`, healthcheck `pg_isready`
  - [x] `keycloak`: image `quay.io/keycloak/keycloak:24.0`, depends_on postgres healthy, cmd `start-dev`
  - [x] `web`: build `apps/web`, depends_on postgres + keycloak healthy, env_file `.env.local`
  - [x] `n8n`: image `n8nio/n8n:latest`, depends_on postgres healthy, volume `n8n_data`
  - [x] `ollama`: image `ollama/ollama:latest`, volume `ollama_data`, healthcheck `GET /api/tags`
  - [x] `piper`: image `rhasspy/wyoming-piper:latest` or custom Dockerfile, port 5500
  - [x] `minio`: image `minio/minio:latest`, volume `minio_data`, ports 9000+9001, cmd `server /data --console-address :9001`
  - [x] `disease-api`: build `apps/disease-api`, depends_on nothing, healthcheck `GET /health`
  - [x] Define named volumes: `pgdata`, `n8n_data`, `ollama_data`, `minio_data`
  - [x] Define networks: `agrimarket-net` (all services on same network)

- [x] **T3: Environment files** (AC: 4, 5)
  - [x] Create `.env.example` with all keys (no real values — use `your_value_here` placeholders)
  - [x] Create `docker/.env.local.example` for Docker-specific overrides (DATABASE_URL with postgres hostname)
  - [x] Ensure `.gitignore` excludes all real `.env` files but tracks `.env.example`

- [x] **T4: Next.js app baseline config** (AC: 6)
  - [x] Configure `tsconfig.json`: `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, path aliases `@/*` → `./src/*`
  - [x] Configure `next.config.js`: `output: 'standalone'` for Docker builds
  - [x] Add Inter font import in `app/layout.tsx` (preconnect + display=swap per UX-DR2)
  - [x] Create `src/styles/globals.css` with placeholder comment block (actual tokens in Story 1.2)
  - [x] Verify `package.json` has Next.js 14.x, TypeScript 5.x, Prisma 5.x

- [x] **T5: FastAPI skeleton** (AC: 1)
  - [x] `apps/disease-api/app/main.py` — FastAPI app with `GET /health` returning `{"status": "ok"}`
  - [x] `apps/disease-api/requirements.txt` — fastapi, uvicorn[standard], python-multipart, Pillow, tensorflow (or tensorflow-cpu)
  - [x] `apps/disease-api/Dockerfile` — Python 3.11 slim, copy requirements, pip install, CMD uvicorn

- [x] **T6: Validate & document** (AC: 1–6)
  - [x] Run `docker compose up -d` and confirm all containers healthy
  - [x] Update `docs/dev-setup.md` with one-command setup instructions
  - [x] Commit with message: `chore: initialize monorepo structure and docker compose stack`

## Dev Notes

### Architecture Constraints (MUST FOLLOW — AD-2, AD-14)

```
Monorepo structure (AD-2):
  apps/web/          → Next.js 14 App Router (TypeScript)
  apps/disease-api/  → FastAPI (Python 3.11)
  docker/            → docker-compose.yml + Dockerfiles
  workflows/         → n8n workflow JSON exports
  docs/              → project documentation
  ai-models/         → gitignored — holds TF/Keras model files

Environment strategy (AD-14):
  .env.example       → committed (no real values)
  .env.local         → local dev (gitignored)
  .env.staging       → staging (gitignored)
  .env.production    → production (gitignored)
  Docker containers use env_file: .env.local
```

### Service Port Map

| Service | Host Port | Container Port | Purpose |
|---------|-----------|----------------|---------|
| web | 3000 | 3000 | Next.js App |
| postgres | 5432 | 5432 | Primary DB |
| keycloak | 8080 | 8080 | OIDC Auth |
| n8n | 5678 | 5678 | Workflow engine |
| ollama | 11434 | 11434 | LLM inference |
| piper | 5500 | 5500 | TTS service |
| minio | 9000 | 9000 | S3 API |
| minio | 9001 | 9001 | MinIO Console |
| disease-api | 8000 | 8000 | FastAPI model |

### Keycloak Startup Note

Keycloak 24+ requires `--db postgres` args for production mode. For dev, `start-dev` skips TLS. Command in compose:
```yaml
command: ["start-dev", "--db=postgres", "--db-url=jdbc:postgresql://postgres:5432/keycloak", "--db-username=keycloak", "--db-password=${KEYCLOAK_DB_PASSWORD}"]
```
Keycloak needs its own DB (`keycloak`) separate from the app DB (`agrimarket`). Use init scripts or separate DB service.

### Ollama Model Pull

Ollama container starts empty. Model pull is NOT part of this story — that is a manual step documented in `docs/dev-setup.md`:
```bash
docker exec -it ollama ollama pull mistral:7b
# or
docker exec -it ollama ollama pull phi3:mini
```
`OLLAMA_MODEL` env var must match the pulled model name. Default in `.env.example`: `OLLAMA_MODEL=phi3:mini`

### Piper TTS

Piper service uses `rhasspy/wyoming-piper` Docker image with Vietnamese voice model. Voice model file must exist at `/data/vi_VN-vais1000-medium.onnx` inside the container. Mount a volume:
```yaml
piper:
  image: rhasspy/wyoming-piper:latest
  volumes:
    - ./piper-voices:/data
  ports:
    - "5500:10200"  # Wyoming protocol port is 10200, map to 5500 externally
  command: ["--voice", "vi_VN-vais1000-medium"]
```
**Note:** Wyoming protocol (port 10200) ≠ HTTP. The `/api/tts` route in Next.js will need to speak Wyoming protocol or use a TTS HTTP wrapper. For MVP: use `piper` CLI directly via exec or HTTP wrapper image. Document this gotcha in `docs/dev-setup.md`.

### MinIO Bucket Init

MinIO starts with no buckets. Add an init container or document manual step:
```bash
docker exec -it minio mc alias set local http://localhost:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
docker exec -it minio mc mb local/agrimarket-docs
```
`MINIO_BUCKET_NAME=agrimarket-docs` in `.env.example`.

### Next.js Docker Build

Use `output: 'standalone'` in `next.config.js` to create a self-contained Node.js bundle:
```js
// next.config.js
const nextConfig = {
  output: 'standalone',
}
module.exports = nextConfig
```
Dockerfile for `apps/web`:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### Project Structure Notes

- `apps/web/src/` layout (not root-level `app/`): use `src/app/`, `src/components/`, `src/styles/` per AD-18
- `src/app/(manager)/`, `src/app/(officer)/`, `src/app/(farmer)/` — route groups for role layouts (created in Story 1.5)
- Do NOT create feature folders in this story — only the skeleton

### References

- [Source: ARCHITECTURE-SPINE.md#AD-2] — Monorepo structure
- [Source: ARCHITECTURE-SPINE.md#AD-14] — Environment strategy
- [Source: docs/project-context.md#tech-stack] — Full tech stack versions
- [Source: docker/docker-compose.yml] — Already partially exists (verify before overwriting)

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

- Cấu trúc thư mục Monorepo đã được tạo thành công với Next.js App Router (strict mode) và FastAPI (disease-api).
- Docker Compose file đã định nghĩa đủ 8 services, thiết lập đúng thứ tự start (postgres -> keycloak -> web; postgres -> n8n).
- .env.example có đủ 13 biến bắt buộc, và .gitignore đã loại trừ các tệp nhạy cảm.
- Script smoke-test.sh cùng các test validate được viết đầy đủ trong thư mục `scripts/`.
- Docs dev-setup.md đã sẵn sàng.
- Status story đã chuyển sang 'review'.

### File List

**New files to create:**
- `docker/docker-compose.yml`
- `docker/.env.local.example`
- `.env.example`
- `.gitignore` (update existing)
- `apps/web/` (Next.js 14 project scaffold)
- `apps/web/Dockerfile`
- `apps/web/next.config.js`
- `apps/web/tsconfig.json`
- `apps/web/src/styles/globals.css` (stub)
- `apps/web/src/app/layout.tsx` (root layout with Inter font)
- `apps/disease-api/app/main.py`
- `apps/disease-api/requirements.txt`
- `apps/disease-api/Dockerfile`
- `workflows/.gitkeep`
- `ai-models/.gitkeep`
- `docs/dev-setup.md`
