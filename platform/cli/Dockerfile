# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
FROM python:3.12.15-slim-bookworm
RUN useradd --system --no-create-home --uid 10001 dxos
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY dxos_cli ./dxos_cli
USER dxos
ENTRYPOINT ["python", "-m", "dxos_cli"]
