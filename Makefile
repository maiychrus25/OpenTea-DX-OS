# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
COMPOSE := docker compose -f docker/docker-compose.yml

.PHONY: platform-up platform-smoke platform-down up down build test lint

platform-up:
	$(COMPOSE) up -d --build --wait postgres
	$(COMPOSE) run --rm platform-init
	$(COMPOSE) --profile tools run --rm --build migrate
	$(COMPOSE) run --rm platform-init
# Hasura loads metadata only at start and APISIX holds the old inode of its bind-mounted route file, so a running
# stack needs a restart. A fresh start must not get one: it would hide a wrong migrate order from the smoke test.
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

platform-down:
	$(COMPOSE) down

up:
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
