#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Zalo relay helpers for smoke-zalo.sh: the ZNS stub, the relay bring-up and calls to the web's user routes as a signed-in
# person. Sourced, never run on its own; it needs lib.sh and tokens.sh sourced first.

ZL_STUB="http://127.0.0.1:8084"
ZL_PHONE="84900000001"  # phone of hh_tc_1 (0900000001) in the 84 form the outbox and the consent use

zalo_stub_calls() { curl -sf "$ZL_STUB/control/calls"; }
zalo_stub_reset() { curl -sf -X POST "$ZL_STUB/control/reset" -d '{}' >/dev/null; }
zalo_fail_next() {  # <code> <times>
  curl -sf -X POST "$ZL_STUB/control/fail-next" -d "{\"code\": $1, \"times\": $2}" >/dev/null
}
# zalo_wait_calls <python condition over the list "c" of recorded calls> [tries, 2 s each]
zalo_wait_calls() {
  local i
  for i in $(seq 1 "${2:-30}"); do
    zalo_stub_calls | python3 -c "import json,sys; c=json.load(sys.stdin); sys.exit(0 if ($1) else 1)" && return 0
    sleep 2
  done
  return 1
}
# The number of message calls the stub has recorded (token refreshes are not counted).
zalo_sent_count() {
  zalo_stub_calls | python3 -c 'import json,sys; print(sum(1 for x in json.load(sys.stdin) if x["path"] == "/message/template"))'
}
# Client-credentials token of dxos-zalo, read from its volume the way the relay reads it.
zalo_client_token() {
  local creds cid csec
  creds="$($COMPOSE --profile tools run --rm -T --no-deps dxos-zalo-env cat /run/dxos-zalo/zalo.env)"
  cid=$(printf '%s\n' "$creds" | sed -n 's/^DXOS_ZALO_CLIENT_ID=//p')
  csec=$(printf '%s\n' "$creds" | sed -n 's/^DXOS_ZALO_CLIENT_SECRET=//p')
  curl -sf -X POST "$KC_REALM_URL/protocol/openid-connect/token" \
    -d "grant_type=client_credentials" -d "client_id=$cid" -d "client_secret=$csec" | jq -r '.access_token // empty'
}

# zalo_web <username> <role> <htx code or -> <METHOD> <path> [json body]: calls a user route of the web as that person and
# prints "<status> <body>". The web takes a session cookie, so it is built inside the web container the way Auth.js builds it
# (the same way lib-telegram.sh does for the Mini App route).
zalo_web() {
  local token sub
  token="$(user_token "$1")"
  sub="$(python3 -c 'import base64, json, sys; p = sys.argv[1].split(".")[1]; p += "=" * (-len(p) % 4); print(json.loads(base64.urlsafe_b64decode(p))["sub"])' "$token")"
  $COMPOSE exec -T web node -e '
const crypto = require("node:crypto");
async function main() {
  const [accessToken, sub, role, htx, method, path, body] = process.argv.slice(1);
  const b64u = (b) => Buffer.from(b).toString("base64url");
  const name = "authjs.session-token";
  const key = Buffer.from(crypto.hkdfSync("sha256", process.env.AUTH_SECRET, name, "Auth.js Generated Encryption Key (" + name + ")", 64));
  const now = Math.floor(Date.now() / 1000);
  const exp = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString()).exp;
  const claims = { sub, role, htxCode: htx === "-" ? undefined : htx, accessToken, refreshToken: "smoke", accessTokenExpiresAt: exp, iat: now, exp: now + 3600, jti: crypto.randomUUID() };
  const header = b64u(JSON.stringify({ alg: "dir", enc: "A256CBC-HS512" }));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key.subarray(32), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(claims)), cipher.final()]);
  const al = Buffer.alloc(8);
  al.writeBigUInt64BE(BigInt(header.length * 8));
  const tag = crypto.createHmac("sha512", key.subarray(0, 32)).update(Buffer.concat([Buffer.from(header), iv, ct, al])).digest().subarray(0, 32);
  const headers = { "Content-Type": "application/json", Cookie: name + "=" + [header, "", b64u(iv), b64u(ct), b64u(tag)].join(".") };
  const res = await fetch("http://localhost:3000" + path, { method, headers, body: body || undefined });
  console.log(res.status, (await res.text()).replace(/\n/g, " "));
}
main().catch((err) => { console.error(err.message); process.exit(1); });
' "$token" "$sub" "$2" "$3" "$4" "$5" "${6:-}"
}
zalo_web_status() { zalo_web "$@" | cut -d' ' -f1; }
zalo_web_body() { zalo_web "$@" | cut -d' ' -f2-; }

# Starts the ZNS stub and the relay pointed at it. Stub calls are reset. The OA tokens are entered afterwards by the platform admin.
zalo_relay_up() {
  ./dxos zalo enable >/dev/null
  $COMPOSE --profile zalo-test up -d --no-deps dxos-zalo-stub >/dev/null
  for _ in $(seq 1 30); do zalo_stub_calls >/dev/null 2>&1 && break; sleep 1; done
  zalo_stub_reset
  ZALO_API_BASE="http://dxos-zalo-stub:8084" ZALO_OAUTH_URL="http://dxos-zalo-stub:8084/oa/access_token" \
    ZALO_APP_ID="smoke-app" ZALO_APP_SECRET="smoke-secret" \
    $COMPOSE --profile zalo-test up -d --no-deps dxos-zalo >/dev/null
}

# Turns the relay off the way the smoke leaves it: relay disabled, relay container back in its normal config, stub stopped.
zalo_relay_down() {
  ./dxos zalo disable >/dev/null
  $COMPOSE up -d --no-deps dxos-zalo >/dev/null
  $COMPOSE stop dxos-zalo-stub >/dev/null
}
