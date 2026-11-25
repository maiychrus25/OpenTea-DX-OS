#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# M4 agents (field-watch, disease-watch, harvest-ready, bulletin): one open proposal of each kind for TC, and test 32
# (an agent-written note_vi is refused). Sourced by smoke-agentic.sh after smoke-llm.sh; it does not run on its own.
# It adds no PASS line to make platform-smoke, so smoke-apps.sh keeps its count.
echo "[agents]"

M4_T0=$(psql_app "select now()")
M4_PAIR="pc_tc_1"   # the disease cluster: three reports on one parcel, so the distance is 0 whatever the centroids are
M4_READY="pc_tc_2"  # the ready parcel for harvest-ready
M4_READY_STATUS=$(psql_app "select status from parcels where id='$M4_READY'")

m4_cleanup() {
  psql_app "delete from platform.agent_proposals where htx_code='TC' and created_at >= '$M4_T0' and agent in ('field-watch','disease-watch','harvest-ready','bulletin')" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_runs where htx_code='TC' and started_at >= '$M4_T0' and agent in ('field-watch','disease-watch','harvest-ready','bulletin')" >/dev/null 2>&1 || true
  psql_app "delete from telemetry.sensor_readings where htx_code='TC' and ingested_at >= '$M4_T0' and parcel_code='P-TC-001'" >/dev/null 2>&1 || true
  psql_app "delete from disease_reports where id like 'dr_smoke_m4_%'" >/dev/null 2>&1 || true
  psql_app "delete from parcel_crop_cycles where id='pcc_smoke_m4_tc_2'" >/dev/null 2>&1 || true
  [ -n "${M4_READY_STATUS:-}" ] && psql_app "update parcels set status='$M4_READY_STATUS' where id='$M4_READY'" >/dev/null 2>&1 || true
  psql_app "delete from market_data where source='SMOKE_M4'" >/dev/null 2>&1 || true
  psql_app "update platform.agent_settings set provider='ollama' where htx_code='TC' and agent='bulletin'" >/dev/null 2>&1 || true
}
# The EXIT trap of smoke-llm stays in place: this one runs first, then its cleanup.
trap 'm4_cleanup; llm_cleanup' EXIT

# Seeds: a sensor silent for 8 h, three helopeltis reports on one cooperative parcel, one ready TC parcel, two market rows.
psql_app "insert into telemetry.sensor_readings (htx_code, parcel_code, sensor, ts, value) values
  ('TC', 'P-TC-001', 'soil_moisture', now() - interval '8 hours', 41.5) on conflict do nothing" >/dev/null
psql_app "insert into disease_reports (id, parcel_id, household_id, detected_by_id, detection_date, photo_url, photo_minio_key, ai_disease_name, ai_confidence, status, updated_at) values
  ('dr_smoke_m4_1', '$M4_PAIR', 'hh_tc_1', 'smoke-m4', now(), 'smoke/m4.jpg', 'smoke/m4.jpg', 'helopeltis', 0.9, 'PENDING', now()),
  ('dr_smoke_m4_2', '$M4_PAIR', 'hh_tc_1', 'smoke-m4', now(), 'smoke/m4.jpg', 'smoke/m4.jpg', 'helopeltis', 0.9, 'PENDING', now()),
  ('dr_smoke_m4_3', '$M4_PAIR', 'hh_tc_1', 'smoke-m4', now(), 'smoke/m4.jpg', 'smoke/m4.jpg', 'helopeltis', 0.9, 'PENDING', now())
  on conflict (id) do nothing" >/dev/null
psql_app "update parcels set status='TENDING' where id='$M4_READY'" >/dev/null
psql_app "insert into parcel_crop_cycles (id, parcel_id, season, sowed_at, estimated_harvest_date, created_at) values
  ('pcc_smoke_m4_tc_2', '$M4_READY', 'Smoke M4', now() - interval '90 days', now() + interval '1 day', now())
  on conflict (id) do nothing" >/dev/null
psql_app "insert into market_data (id, source, commodity, metric, value, unit, period, fetched_at) values
  (gen_random_uuid(), 'SMOKE_M4', 'Tea', 'export_price', 3.2, 'USD/kg', 'smoke-m4-1', now()),
  (gen_random_uuid(), 'SMOKE_M4', 'Tea', 'export_price', 3.1, 'USD/kg', 'smoke-m4-2', now())
  on conflict do nothing" >/dev/null

# The four agents are enabled per cooperative here; ./dxos agent enable writes only journal-review. Bulletin uses the
# M3 stub as its provider, which llm_stub brings up (the same stub and key as the provider smoke).
psql_app "insert into platform.agent_settings (htx_code, agent, enabled) values
  ('TC', 'field-watch', true), ('TC', 'disease-watch', true), ('TC', 'harvest-ready', true)
  on conflict (htx_code, agent) do update set enabled = true" >/dev/null
psql_app "insert into platform.agent_settings (htx_code, agent, enabled, provider) values ('TC', 'bulletin', true, 'anthropic')
  on conflict (htx_code, agent) do update set enabled = true, provider = 'anthropic'" >/dev/null
llm_stub up
ANTHROPIC_API_KEY="$LLM_KEY" ANTHROPIC_API_BASE="http://llm-test-stub:8082" $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null

# One open proposal of each kind. The disease inspection and the household notice both come from the disease cluster.
for kind in notification.internal notification.households disease.inspection harvest.approve bulletin.publish; do
  wait_psql "select exists(select 1 from platform.agent_proposals where htx_code='TC' and kind='$kind' and status='proposed' and created_at >= '$M4_T0')" "t" 75 \
    && pass "agent files an open $kind proposal for TC (M4)" \
    || fail "no open $kind proposal for TC within 150 s"
done

# Test 32 end to end: an agent-written note_vi in a household message is refused with INVALID_PAYLOAD (a 400).
M4_RUN=$(psql_app "select id from platform.agent_runs where htx_code='TC' and agent='field-watch' order by started_at desc limit 1")
[ -n "$M4_RUN" ] || fail "no field-watch run for TC to attach the test 32 proposal to"
M4_AT=$(client_token TC)
[ -n "$M4_AT" ] || fail "agent token for TC is empty (test 32)"
$COMPOSE exec -T web node -e '
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

async function main() {
  const [token, runId] = process.argv.slice(1);
  const res = await fetch("http://apisix:9081/api/internal/agent/proposals", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      run_id: runId, agent: "field-watch", kind: "notification.households",
      payload: { template: "dry_soil", slots: { parcel_codes: ["P-TC-001"], value_pct: 20, threshold_pct: 35 },
        subjects: ["dry_soil:2026-11-25"], note_vi: "Lời nhắn do agent viết" },
      reason_vi: "Kiểm thử test 32",
      evidence: { rows: [], sha256: crypto.createHash("sha256").update("[]", "utf8").digest("hex") },
    }),
  });
  const body = await res.json().catch(() => ({}));
  assert.equal(res.status, 400, "an agent note_vi must return 400");
  assert.equal(body?.error?.code, "INVALID_PAYLOAD", "the refusal must be INVALID_PAYLOAD");
}
main().catch((err) => { console.error(err); process.exit(1); });
' "$M4_AT" "$M4_RUN" && pass "agent-written note_vi in a household message is refused (test 32 end to end)" \
  || fail "test 32: agent-written note_vi was not refused with 400 INVALID_PAYLOAD"

# Still open: approving harvest.approve and the household notice. The decision route reads a NextAuth session, which
# the smoke cannot open with a Keycloak token, so those two checks are not in this smoke yet.
