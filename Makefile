# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
COMPOSE := docker compose -f docker/docker-compose.yml
# Runtime state is per compose project (R13); "docker" is compose's default project name for docker/docker-compose.yml.
PROJECT := $(or $(COMPOSE_PROJECT_NAME),docker)
RUNTIME := docker/runtime/$(PROJECT)
# apisix reads the generated route file (base + installed apps); relative to docker/, like every compose path.
export DXOS_GATEWAY_FILE := ../$(RUNTIME)/gateway/apisix.yaml

# BuildKit adds a provenance attestation with a fresh digest to every build, so a rebuild of an unchanged image gets a
# new image ID (containerd image store) and `up --build` recreates its running containers: postgres restarted under
# keycloak on every platform-up. Without the attestation the same inputs give the same ID, so nothing is recreated.
export BUILDX_NO_DEFAULT_ATTESTATIONS := 1

.PHONY: gateway-sync platform-up platform-smoke apps-smoke platform-down up down build test lint

# APISIX mounts $(RUNTIME)/gateway/apisix.yaml; create it before any container starts, or Docker makes it a directory.
gateway-sync:
	mkdir -p $(RUNTIME)/gateway/apps $(RUNTIME)/apps
	$(COMPOSE) --profile tools run --rm --build --user "$$(id -u):$$(id -g)" dxos-cli gateway-sync

platform-up: gateway-sync
	$(COMPOSE) up -d --build --wait postgres
	$(COMPOSE) run --rm platform-init
	$(COMPOSE) --profile tools run --rm --build migrate
	$(COMPOSE) run --rm platform-init
	$(COMPOSE) --profile tools run --rm -T --user "$$(id -u):$$(id -g)" dxos-cli catalog-sync >/dev/null
# Hasura loads metadata only at start and APISIX holds the old inode of its bind-mounted route file, so a running
# stack needs a restart. A fresh start must not get one: it would hide a wrong migrate order from the smoke test.
# gateway-sync writes the runtime route file in place (same inode), so later app routes reach APISIX without one.
	@running="$$($(COMPOSE) ps -q --status running hasura apisix)"; \
	$(COMPOSE) up -d --build --wait postgres keycloak seaweedfs n8n hasura apisix clamav dxos-scanner mosquitto dxos-ingest dxos-lifecycle ollama || exit 1; \
	[ -z "$$running" ] && exit 0; \
	$(COMPOSE) restart hasura apisix || exit 1; \
	for _ in $$(seq 1 60); do \
		$(COMPOSE) exec -T hasura sh -c 'curl -sf -o /dev/null http://localhost:8080/healthz && curl -s -o /dev/null http://apisix:9080/' 2>/dev/null && exit 0; \
		sleep 2; \
	done; echo "hasura or apisix did not come back after restart" >&2; exit 1
	$(COMPOSE) --profile tools run --rm ollama-init

platform-smoke:
	bash platform/tests/smoke-platform.sh

# Needs a seeded stack after platform-smoke (its fixture household hh_tc_1 guides the tea-tour); installs and removes
# tea-tour and the CLI fixtures, installs hello, re-runs platform-up, removes it, then runs platform-smoke.
apps-smoke:
	bash platform/tests/smoke-apps.sh

platform-down:
	$(COMPOSE) down

up: gateway-sync
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build

test:
	cd apps/web && npm test -- --ci

lint:
	cd apps/web && npm run lint
	actionlint
