// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers
// Prints the Prisma DATABASE_URL for the compose network; the password is URL-encoded.
const user = process.env.POSTGRES_USER || "agrimarket";
const password = process.env.POSTGRES_PASSWORD || "";
const db = process.env.POSTGRES_DB || "agrimarket";
console.log(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@postgres:5432/${encodeURIComponent(db)}`);
