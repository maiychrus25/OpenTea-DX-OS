# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
COMPOSE := docker compose -f docker/docker-compose.yml

.PHONY: platform-up platform-smoke platform-down up down build test lint

platform-up:
	$(COMPOSE) up -d --build --wait postgres
	$(COMPOSE) run --rm platform-init
	$(COMPOSE) --profile tools run --rm --build migrate
	$(COMPOSE) run --rm platform-init
	$(COMPOSE) up -d --build --wait postgres keycloak seaweedfs n8n hasura apisix clamav dxos-scanner mosquitto dxos-ingest

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
