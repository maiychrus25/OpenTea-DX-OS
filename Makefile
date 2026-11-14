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

.PHONY: gateway-sync web-up gateway-up up-core up-docs up-sensors up-ai up-voice up-workflow up-chat stop-extras platform-up platform-smoke apps-smoke platform-down up down build test lint appkit-sync

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

# Rebuild or start web (and the disease service) on the generated route file, so apisix is not recreated on the base one.
web-up: gateway-sync
	$(COMPOSE) up -d --build --wait web disease-api

# Put the gateway back on the generated route file after a hand-typed compose command recreated it on the base one.
gateway-up: gateway-sync
	$(COMPOSE) up -d --no-deps apisix

# A smaller stack. up-core: sign-in, dashboards, App Store and installed mini-apps (run `make platform-up` once first: it
# initialises and migrates the database). --no-deps with the services in start order: none of them depends on an optional one.
up-core: gateway-sync
	$(COMPOSE) up -d --no-deps --wait postgres keycloak hasura apisix web

# One target per optional group; each starts only its own services (--no-deps: core is already up, and the
# dependencies inside a group are listed in start order). stop-extras stops exactly the union of these groups.
EXTRAS_DOCS := seaweedfs clamav dxos-scanner dxos-lifecycle
EXTRAS_SENSORS := mosquitto dxos-ingest
EXTRAS_AI := disease-api ollama
EXTRAS_VOICE := piper
EXTRAS_WORKFLOW := n8n
EXTRAS_CHAT := mattermost

up-docs: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_DOCS)

up-sensors: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_SENSORS)

up-ai: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_AI)

up-voice: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_VOICE)

up-workflow: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_WORKFLOW)

up-chat: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_CHAT)

# Stop, never down: containers, volumes and data stay; the matching up-<group> starts them again.
stop-extras:
	$(COMPOSE) stop $(EXTRAS_DOCS) $(EXTRAS_SENSORS) $(EXTRAS_AI) $(EXTRAS_VOICE) $(EXTRAS_WORKFLOW) $(EXTRAS_CHAT)

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
	bash scripts/appkit-sync.sh --check

# Copy platform/appkit/appkit.py and kit.html into every app that uses the kit.
appkit-sync:
	bash scripts/appkit-sync.sh
