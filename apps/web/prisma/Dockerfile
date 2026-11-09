# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# One-shot Prisma migrate image (non-slim: Prisma engines need OpenSSL). Build context: apps/web/prisma.
FROM node:20.19.5-bookworm
RUN npm install -g prisma@5.22.0
WORKDIR /app
COPY schema.prisma /app/schema.prisma
COPY migrations /app/migrations
COPY database-url.js /app/database-url.js
CMD ["sh", "-c", "DATABASE_URL=\"$(node /app/database-url.js)\" exec prisma migrate deploy --schema /app/schema.prisma"]
