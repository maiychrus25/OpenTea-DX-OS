#!/bin/sh
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Builds the password file from DXOS_MQTT_DEVICES ("TC:pw,LB:pw") and DXOS_MQTT_INGEST_PASSWORD, then runs mosquitto.
set -eu
PASSWD=/tmp/mosquitto.passwd

die() { echo "mosquitto: $*" >&2; exit 1; }
# A password starting with change_me (any case) is a placeholder; the release override refuses those.
check() {
  [ -n "$2" ] || die "empty password for $1"
  if [ "${DXOS_MQTT_REQUIRE_STRONG:-}" = "1" ]; then
    case "$(printf %s "$2" | tr 'A-Z' 'a-z')" in change_me*) die "placeholder password for $1";; esac
  fi
}

[ -n "${DXOS_MQTT_DEVICES:-}" ] || die "DXOS_MQTT_DEVICES is empty"
check dxos-ingest "${DXOS_MQTT_INGEST_PASSWORD:-}"
: > "$PASSWD"
mosquitto_passwd -b "$PASSWD" dxos-ingest "$DXOS_MQTT_INGEST_PASSWORD"
OLD_IFS=$IFS; IFS=,
for entry in $DXOS_MQTT_DEVICES; do
  IFS=$OLD_IFS
  # Same trim as Config.from_env, so the broker and the simulator agree on the account and password.
  entry=$(printf %s "$entry" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [ -n "$entry" ] || continue
  htx=${entry%%:*}; pw=${entry#*:}
  [ -n "$htx" ] && [ "$htx" != "$entry" ] || die "bad DXOS_MQTT_DEVICES entry (want CODE:password)"
  check "$htx" "$pw"
  mosquitto_passwd -b "$PASSWD" "$htx" "$pw"
  IFS=,
done
IFS=$OLD_IFS
chown mosquitto:mosquitto "$PASSWD" /mosquitto/data
chmod 0700 "$PASSWD"
exec mosquitto -c /mosquitto/config/mosquitto.conf
