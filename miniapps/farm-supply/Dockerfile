# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
FROM python:3.12.15-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Installed at build time: dxos-apps-net has no internet access at run time.
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY farm_supply /app/farm_supply
WORKDIR /app
# dxos runs every app as 10001:10001 with a read-only root filesystem (only /tmp is writable); the files are readable.
USER 10001:10001
EXPOSE 8080
# The gateway strips /apps/farm-supply; --root-path puts it back for the app's view of its own URLs.
CMD ["uvicorn", "farm_supply.main:app", "--host", "0.0.0.0", "--port", "8080", "--root-path", "/apps/farm-supply", "--no-server-header"]
