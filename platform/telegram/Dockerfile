# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Python stdlib only: the relay and the stub Bot API need no third-party packages.
FROM python:3.12.15-slim-bookworm
RUN useradd --system --no-create-home --uid 10001 telegram
WORKDIR /app
COPY dxos_telegram ./dxos_telegram
USER telegram
CMD ["python", "-m", "dxos_telegram"]
