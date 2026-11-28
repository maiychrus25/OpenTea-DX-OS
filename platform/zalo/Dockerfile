# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Python stdlib only: the relay and the stub ZNS API need no third-party packages.
FROM python:3.12.15-slim-bookworm
RUN useradd --system --no-create-home --uid 10001 zalo
WORKDIR /app
COPY dxos_zalo ./dxos_zalo
USER zalo
CMD ["python", "-m", "dxos_zalo"]
