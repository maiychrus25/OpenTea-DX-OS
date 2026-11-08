# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
FROM postgis/postgis:16-3.5
# Base is Debian bullseye (EOL): PGDG moved it to the archive host.
RUN sed -i 's#apt.postgresql.org/pub/repos/apt#apt-archive.postgresql.org/pub/repos/apt#' /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-pgvector \
 && rm -rf /var/lib/apt/lists/*
