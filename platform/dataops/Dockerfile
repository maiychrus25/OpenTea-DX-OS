# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
FROM python:3.12.15-slim-bookworm
RUN useradd --system --create-home --home-dir /home/dataops --uid 10001 dataops
ENV HOME=/home/dataops
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY dxos_dataops ./dxos_dataops
USER dataops
# Preinstall the extension so nothing is downloaded at runtime.
RUN python -c "import duckdb; duckdb.sql('INSTALL httpfs')"
CMD ["python", "-m", "dxos_dataops"]
