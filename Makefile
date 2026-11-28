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

.PHONY: demo-seed builder-image gateway-sync web-up gateway-up up-core up-docs up-sensors up-ai up-voice stt-measure up-workflow up-chat up-agent stop-extras platform-up apps-recreate platform-smoke apps-smoke platform-down up down build test lint appkit-sync mobile-client mcp-client

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
	$(COMPOSE) up -d --build --wait postgres keycloak seaweedfs n8n hasura apisix clamav dxos-scanner mosquitto dxos-ingest dxos-lifecycle ollama dxos-agent dxos-telegram dxos-zalo || exit 1; \
	[ -z "$$running" ] && exit 0; \
	$(COMPOSE) restart hasura apisix || exit 1; \
	for _ in $$(seq 1 60); do \
		$(COMPOSE) exec -T hasura sh -c 'curl -sf -o /dev/null http://localhost:8080/healthz && curl -s -o /dev/null http://apisix:9080/' 2>/dev/null && exit 0; \
		sleep 2; \
	done; echo "hasura or apisix did not come back after restart" >&2; exit 1
	$(COMPOSE) --profile tools run --rm ollama-init
	$(MAKE) apps-recreate

# gateway-sync flags an installed app (<id>.recreate) when it just made the app's gateway secret or added env_file to its
# compose file; a restart would not re-read the env file, so the container is recreated, then the flag is cleared.
apps-recreate:
	@for flag in $(RUNTIME)/apps/*.recreate; do \
		[ -e "$$flag" ] || continue; id="$$(basename "$$flag" .recreate)"; \
		$(COMPOSE) -f $(RUNTIME)/apps/$$id.compose.yml up -d --force-recreate --no-deps --wait app-$$id && rm -f "$$flag" || exit 1; \
	done

# Closed stage-demo data for TC, on top of `seed` (docs/dev-setup.md, "Demo sân khấu 10 phút"). Runs in the migrate tools image, so no host
# Node is needed. The web sources are copied from a read-only mount, so npm ci never touches the host's node_modules.
# Needs network for npm ci, and postgres and seaweedfs up (`make platform-up`).
DEMO_SEED_SCRIPT = set -e; export DATABASE_URL="$$(node /app/database-url.js)"; mkdir /tmp/web; \
	tar -C /web --exclude=node_modules --exclude=.next -cf - . | tar -C /tmp/web -xf -; cd /tmp/web; \
	npm ci --no-audit --no-fund --loglevel=error && npx prisma generate >/dev/null && npm run demo-seed
demo-seed:
	$(COMPOSE) --profile tools run --rm --build -v "$(CURDIR)/apps/web:/web:ro" --entrypoint sh migrate -c '$(DEMO_SEED_SCRIPT)'

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
EXTRAS_VOICE := piper dxos-stt
EXTRAS_WORKFLOW := n8n
EXTRAS_CHAT := mattermost
EXTRAS_AGENT := dxos-agent dxos-telegram dxos-zalo

up-docs: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_DOCS)

up-sensors: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_SENSORS)

up-ai: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_AI)

# stt-init downloads the speech-to-text model into its volume when the file is missing or wrong, and does nothing otherwise.
up-voice: gateway-sync
	$(COMPOSE) --profile tools run --rm stt-init
	$(COMPOSE) up -d --no-deps $(EXTRAS_VOICE)

# Word error rate and time per file of each Whisper model on the cooperative's own recordings: make stt-measure DIR=<folder
# of .ogg files, each with a .txt transcript>. It restarts dxos-stt on each model and ends on the default one.
STT_MODELS := base small medium
stt-measure:
	@test -n "$(DIR)" -a -d "$(DIR)" || { echo "usage: make stt-measure DIR=<folder of .ogg files with .txt transcripts>" >&2; exit 1; }
	@for model in $(STT_MODELS); do \
		DXOS_STT_MODEL=$$model $(COMPOSE) --profile tools run --rm stt-init && \
		DXOS_STT_MODEL=$$model $(COMPOSE) up -d --no-deps --force-recreate --wait dxos-stt && \
		DXOS_STT_MODEL=$$model $(COMPOSE) run --rm -T --no-deps -e DXOS_STT_MODEL=$$model -v "$$(cd "$(DIR)" && pwd):/recordings:ro" --entrypoint python dxos-telegram -m dxos_telegram.stt_measure /recordings || exit 1; \
	done; $(COMPOSE) up -d --no-deps --force-recreate dxos-stt

up-workflow: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_WORKFLOW)

up-chat: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_CHAT)

up-agent: gateway-sync
	$(COMPOSE) up -d --no-deps $(EXTRAS_AGENT)

# Stop, never down: containers, volumes and data stay; the matching up-<group> starts them again.
stop-extras:
	$(COMPOSE) stop $(EXTRAS_DOCS) $(EXTRAS_SENSORS) $(EXTRAS_AI) $(EXTRAS_VOICE) $(EXTRAS_WORKFLOW) $(EXTRAS_CHAT) $(EXTRAS_AGENT)

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

# Runs every agent scenario suite with one provider and appends the table to docs/benchmark.md (how to run it is there).
.PHONY: benchmark
benchmark:
	uv run --no-project --python 3.12 platform/agent/benchmark.py --provider $(or $(PROVIDER),replay) $(if $(MODEL),--model $(MODEL))

# The mini-app factory's build image (plan M13). DXOS_BUILDER_TOOLS = codex-cli (default), claude-code or both.
builder-image:
	bash platform/builder/build-image.sh

# Copy platform/appkit/appkit.py and kit.html into every app that uses the kit.
appkit-sync:
	bash scripts/appkit-sync.sh

# Adds the public PKCE client of the Android app to a running realm (a new machine gets it from the realm file).
# Runs kcadm inside the keycloak container with the container's own admin variables; creates the client only when it is missing.
mobile-client:
	$(COMPOSE) exec -T keycloak sh -c ' \
	  set -e; K=/opt/keycloak/bin/kcadm.sh; \
	  $$K config credentials --server http://localhost:8080 --realm master --user "$$KEYCLOAK_ADMIN" --password "$$KEYCLOAK_ADMIN_PASSWORD" >/dev/null; \
	  if [ -n "$$($$K get clients -r agrimarket -q clientId=dxos-mobile --fields id --format csv --noquotes)" ]; then echo "dxos-mobile already exists"; exit 0; fi; \
	  $$K create clients -r agrimarket -s clientId=dxos-mobile -s enabled=true -s publicClient=true -s protocol=openid-connect \
	    -s standardFlowEnabled=true -s implicitFlowEnabled=false -s directAccessGrantsEnabled=false -s serviceAccountsEnabled=false \
	    -s "redirectUris=[\"vn.opentea.dxos.tour:/oauth2redirect\",\"vn.opentea.hubmobile:/oauth2redirect\"]" \
	    -s "defaultClientScopes=[\"web-origins\",\"acr\",\"profile\",\"roles\",\"email\",\"dx-os-core\"]" \
	    -s "optionalClientScopes=[]" \
	    -s "attributes.\"pkce.code.challenge.method\"=S256"; \
	  echo "dxos-mobile created"'

# Adds the public device-grant client of the MCP bridge to a running realm (a new machine gets it from the realm file).
# Creates the client when it is missing; when it exists, makes sure the device grant is switched on.
mcp-client:
	$(COMPOSE) exec -T keycloak sh -c ' \
	  set -e; K=/opt/keycloak/bin/kcadm.sh; \
	  $$K config credentials --server http://localhost:8080 --realm master --user "$$KEYCLOAK_ADMIN" --password "$$KEYCLOAK_ADMIN_PASSWORD" >/dev/null; \
	  ID=$$($$K get clients -r agrimarket -q clientId=dxos-mcp --fields id --format csv --noquotes); \
	  if [ -n "$$ID" ]; then $$K update clients/$$ID -r agrimarket -s "attributes.\"oauth2.device.authorization.grant.enabled\"=true"; echo "dxos-mcp updated"; exit 0; fi; \
	  $$K create clients -r agrimarket -s clientId=dxos-mcp -s enabled=true -s publicClient=true -s protocol=openid-connect \
	    -s standardFlowEnabled=false -s implicitFlowEnabled=false -s directAccessGrantsEnabled=false -s serviceAccountsEnabled=false \
	    -s "defaultClientScopes=[\"web-origins\",\"acr\",\"profile\",\"roles\",\"email\",\"dx-os-core\"]" \
	    -s "optionalClientScopes=[]" \
	    -s "attributes.\"oauth2.device.authorization.grant.enabled\"=true"; \
	  echo "dxos-mcp created"'
