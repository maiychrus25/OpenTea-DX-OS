# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# The mini-app factory's build image (plan M13, C6). Build it with platform/builder/build-image.sh, which stages a small
# context: this file is at builder/Dockerfile in it, next to cli/, repo/ and hello/.
FROM mcr.microsoft.com/playwright/python:v1.62.0-noble
# Which coding tools to bake in: any of codex-cli, claude-code. Claude Code is proprietary (Anthropic terms), so it is
# installed only when asked for, at build time, and never committed.
ARG DXOS_BUILDER_TOOLS=codex-cli
ENV DEBIAN_FRONTEND=noninteractive PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16 git nodejs npm python3-venv \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --create-home --home-dir /home/dxos --uid 10001 dxos
RUN case "$DXOS_BUILDER_TOOLS" in *codex-cli*) npm install -g --ignore-scripts @openai/codex@0.167.2 ;; esac \
 && case "$DXOS_BUILDER_TOOLS" in *claude-code*) npm install -g @anthropic-ai/claude-code@2.1.322 ;; esac \
 && npm cache clean --force
# The wheelhouse: the gates install an app's requirements from here only, with no network.
COPY builder/allowed-requirements.txt /opt/dxos-gates/allowed-requirements.txt
RUN python3 -m venv --system-site-packages /opt/venv \
 && /opt/venv/bin/pip download --no-cache-dir -d /wheels -r /opt/dxos-gates/allowed-requirements.txt \
 && /opt/venv/bin/pip install --no-cache-dir --no-index --find-links /wheels -r /opt/dxos-gates/allowed-requirements.txt
# Code last, so a change here does not redo the layers above.
COPY cli/dxos_cli /opt/dxos-gates/cli/dxos_cli
COPY repo /opt/dxos-gates/repo
COPY builder/entrypoint.py builder/gates.py builder/dxos_report.py builder/prompt.md builder/review-prompt.md /opt/dxos-gates/
COPY hello /opt/hello
COPY repo/platform/appkit /opt/hello-kit
COPY builder/replay /opt/replay
RUN chmod -R a+rX /opt /wheels
USER 10001:10001
ENV HOME=/tmp/home PATH=/opt/venv/bin:$PATH
ENTRYPOINT ["/opt/venv/bin/python", "/opt/dxos-gates/entrypoint.py"]
