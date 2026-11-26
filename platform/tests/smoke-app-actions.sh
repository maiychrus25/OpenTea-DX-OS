#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Mini-app actions (M9) for TC with tea-shop: two products with stock 40 and no orders make the agent file two open
# app.tea-shop.promotion.create proposals; the manager approves one from the stub's recorded keyboard, the web runs the
# app's own action as the approver, and the promotion row and the public price follow. Removing the app expires the
# other open proposal (test 16). Sourced by smoke-agentic.sh after smoke-autopilot.sh, which left the owner linked and the
# relay up; it does not run on its own. It adds no PASS line to make platform-smoke, so smoke-apps.sh keeps its count.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-app-actions.sh runs only from platform/tests/smoke-agentic.sh" >&2
  exit 2
fi

if [ "${WEB_UP:-0}" != "1" ]; then
  echo "SKIP: app actions smoke needs the web (run make web-up && SMOKE_REQUIRE_WEB=1 bash platform/tests/smoke-agentic.sh)"
  return 0
fi

echo "[app actions]"
M9_T0=$(psql_app "select now()")
M9_RUN=$(python3 -c 'import uuid; print(uuid.uuid4().hex[:8])')
M9_KIND="app.tea-shop.promotion.create"
M9_WAS_INSTALLED=$(./dxos list 2>/dev/null | grep -c 'tea-shop' || true)

# Restores what this smoke changed: its products and promotions, the app proposals, runs and messages, and the app itself
# (installed again when it was installed before, as the app smoke does). The EXIT trap of smoke-autopilot is replaced,
# so this one chains it after its own cleanup.
app_actions_cleanup() {
  local rows="select id from platform.agent_proposals where htx_code='TC' and kind='$M9_KIND'"
  psql_app "delete from platform.telegram_outbox where proposal_id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_conversations where proposal_id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_proposals where htx_code='TC' and kind='$M9_KIND'" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_runs where htx_code='TC' and agent='app:tea-shop' and started_at >= '$M9_T0'" >/dev/null 2>&1 || true
  ./dxos remove tea-shop --purge >/dev/null 2>&1 || true
  if [ "$M9_WAS_INSTALLED" != "0" ]; then ./dxos install miniapps/tea-shop >/dev/null 2>&1 || true; fi
}
trap 'app_actions_cleanup; autopilot_cleanup; staff_cleanup; mcp_cleanup; improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT

# The agent stays stopped while the products are seeded (lesson 5 of M4); it restarts after them.
$COMPOSE stop dxos-agent >/dev/null

# A clean tea-shop with the app kit's actor client switched on (idempotent).
./dxos apps actor enable >/dev/null || fail "./dxos apps actor enable failed"
./dxos remove tea-shop --purge >/dev/null 2>&1 || true
./dxos install miniapps/tea-shop >/dev/null || fail "./dxos install miniapps/tea-shop failed (app actions smoke)"
pass "tea-shop is installed with its agent block"
psql_app "delete from platform.agent_proposals where htx_code='TC' and kind='$M9_KIND'" >/dev/null

# Two products in stock with no order lines: the suggestion rule (stock >= 20, nothing sold in 21 days) fits both.
M9_SELL=$(psql_app "insert into app_tea_shop.products (htx_code, name, pack, price_vnd, stock) values ('TC', 'Kiểm thử M9 bán $M9_RUN', '200 g', 100000, 40) returning id" | head -n 1)
M9_KEEP=$(psql_app "insert into app_tea_shop.products (htx_code, name, pack, price_vnd, stock) values ('TC', 'Kiểm thử M9 giữ $M9_RUN', '200 g', 100000, 40) returning id" | head -n 1)
[ -n "$M9_SELL" ] && [ -n "$M9_KEEP" ] || fail "the tea-shop products were not seeded"

$COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null
wait_psql "select count(*) from platform.agent_proposals where htx_code='TC' and kind='$M9_KIND' and status='proposed' and payload->>'product_id' in ('$M9_SELL', '$M9_KEEP')" "2" 120 \
  || fail "the agent filed no two open $M9_KIND proposals within 240 s (does it read the app's suggestions?)"
pass "the agent files an open app.tea-shop.promotion.create proposal for each product in stock"
assert_eq "$(psql_app "select agent || ':' || risk from platform.agent_proposals where htx_code='TC' and kind='$M9_KIND' and payload->>'product_id'='$M9_SELL'")" \
  "app:tea-shop:medium" "the proposal comes from the app agent with the manifest's risk"

# The manager approves one from the button the stub recorded; the web calls the app as the approver.
M9_PROPOSAL=$(psql_app "select id from platform.agent_proposals where htx_code='TC' and kind='$M9_KIND' and status='proposed' and payload->>'product_id'='$M9_SELL'")
approve_by_telegram app-action "$M9_PROPOSAL"
assert_eq "$(psql_app "select status || ':' || decision_channel from platform.agent_proposals where id='$M9_PROPOSAL'")" \
  "executed:telegram" "the app action is executed only after the Telegram approval"
assert_eq "$(psql_app "select count(*) from app_tea_shop.promotions where product_id='$M9_SELL' and discount_pct=10")" "1" \
  "the promotion row exists with the suggested discount"
assert_eq "$(psql_app "select count(*) from app_tea_shop.promotions where product_id='$M9_KEEP'")" "0" "the other product has no promotion"
M9_PUBLIC="$($COMPOSE exec -T web node -e '
fetch("http://apisix:9081/apps/tea-shop/public/TC").then(async (res) => {
  if (!res.ok) { console.error("status " + res.status); process.exit(1); }
  process.stdout.write(await res.text());
}).catch((err) => { console.error(err); process.exit(1); });')" || fail "the public tea-shop page did not answer"
printf '%s' "$M9_PUBLIC" | python3 -c '
import re, sys
text = re.sub(r"<[^>]+>", " ", sys.stdin.read())
sys.exit(0 if re.search(r"90[.,]?000", text) else 1)' \
  && pass "the public price of the product includes the promotion (90000 for 100000 at 10%)" \
  || fail "the public tea-shop page does not show the promoted price"

# Test 16: removing the app expires the proposal that is still open, and nothing of it can run any more.
assert_eq "$(psql_app "select status from platform.agent_proposals where htx_code='TC' and kind='$M9_KIND' and payload->>'product_id'='$M9_KEEP'")" \
  "proposed" "the second proposal is still open before the app is removed"
./dxos remove tea-shop >/dev/null || fail "./dxos remove tea-shop failed"
assert_eq "$(psql_app "select status from platform.agent_proposals where htx_code='TC' and kind='$M9_KIND' and payload->>'product_id'='$M9_KEEP'")" \
  "expired" "test 16: the open proposal of the removed app is expired"
