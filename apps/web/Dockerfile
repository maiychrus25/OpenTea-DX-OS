# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

FROM node:20-alpine AS builder
WORKDIR /app
# Prisma cần openssl ở cả builder stage (next build generate static pages gọi Prisma)
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY . .
# Generate Prisma Client với đúng binary target cho Alpine
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Prisma cần openssl để load native query engine trên Alpine
RUN apk add --no-cache openssl
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
