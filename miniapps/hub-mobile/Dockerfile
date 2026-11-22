# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
FROM python:3.12.15-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY app.py /app/app.py
# dxos runs every app as 10001:10001 with a read-only root filesystem; app.py only needs to be readable.
USER 10001:10001
EXPOSE 8080
CMD ["python", "/app/app.py"]
