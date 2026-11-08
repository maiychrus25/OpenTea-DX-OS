# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
FROM python:3.12.15-slim-bookworm
RUN useradd --system --no-create-home --uid 10001 scanner
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY dxos_scanner ./dxos_scanner
USER scanner
CMD ["python", "-m", "dxos_scanner"]
