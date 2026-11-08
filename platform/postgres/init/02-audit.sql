-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Tamper-evident audit log: sha256 hash chain + append-only guard (idempotent).
CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION agrimarket;

CREATE TABLE IF NOT EXISTS audit.events (
  id          bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL,
  table_name  text,
  op          text NOT NULL,
  row_id      text,
  actor       text NOT NULL,
  old_data    jsonb,
  new_data    jsonb,
  prev_hash   bytea NOT NULL,
  hash        bytea NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS audit.file_scans (
  bucket      text,
  key         text,
  etag        text,
  status      text,
  signature   text,
  size_bytes  bigint,
  uploaded_at timestamptz,
  scanned_at  timestamptz DEFAULT now(),
  PRIMARY KEY (bucket, key, etag)
);

CREATE OR REPLACE FUNCTION audit.current_actor() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('dxos.actor', true), ''), session_user)::text
$$;

-- Single source of truth for the canonical string (used by append_event and verify_chain).
CREATE OR REPLACE FUNCTION audit.event_hash(
  p_prev bytea, p_id bigint, p_at timestamptz, p_source text, p_table text, p_op text,
  p_row_id text, p_actor text, p_old jsonb, p_new jsonb
) RETURNS bytea
LANGUAGE sql IMMUTABLE AS $$
  SELECT sha256(p_prev || convert_to(concat_ws(chr(31),
    p_id::text,
    to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    p_source, coalesce(p_table, ''), p_op, coalesce(p_row_id, ''), p_actor,
    coalesce(p_old::text, ''), coalesce(p_new::text, '')), 'UTF8'))
$$;

CREATE OR REPLACE FUNCTION audit.append_event(
  p_source text, p_table text, p_op text, p_row_id text, p_actor text, p_old jsonb, p_new jsonb
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  v_prev bytea;
  v_id   bigint;
  v_at   timestamptz := clock_timestamp();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit.events'));
  SELECT hash INTO v_prev FROM audit.events ORDER BY id DESC LIMIT 1;
  v_prev := coalesce(v_prev, decode(repeat('00', 32), 'hex'));
  v_id := nextval(pg_get_serial_sequence('audit.events', 'id'));
  INSERT INTO audit.events (id, occurred_at, source, table_name, op, row_id, actor, old_data, new_data, prev_hash, hash)
  VALUES (v_id, v_at, p_source, p_table, p_op, p_row_id, p_actor, p_old, p_new, v_prev,
    audit.event_hash(v_prev, v_id, v_at, p_source, p_table, p_op, p_row_id, p_actor, p_old, p_new));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION audit.record_event(
  p_source text, p_op text, p_subject text, p_details jsonb
) RETURNS bigint
LANGUAGE sql AS $$
  SELECT audit.append_event(p_source, NULL, p_op, p_subject, audit.current_actor(), NULL, p_details)
$$;

CREATE OR REPLACE FUNCTION audit.verify_chain() RETURNS TABLE(checked bigint, first_bad_id bigint)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r      audit.events;
  v_prev bytea := decode(repeat('00', 32), 'hex');
  v_n    bigint := 0;
BEGIN
  FOR r IN SELECT * FROM audit.events ORDER BY id LOOP
    v_n := v_n + 1;
    IF r.prev_hash IS DISTINCT FROM v_prev
       OR r.hash IS DISTINCT FROM audit.event_hash(r.prev_hash, r.id, r.occurred_at, r.source,
            r.table_name, r.op, r.row_id, r.actor, r.old_data, r.new_data) THEN
      RETURN QUERY SELECT v_n, r.id;
      RETURN;
    END IF;
    v_prev := r.hash;
  END LOOP;
  RETURN QUERY SELECT v_n, NULL::bigint;
END $$;

CREATE OR REPLACE FUNCTION audit.reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.events is append-only';
END $$;

CREATE OR REPLACE TRIGGER dxos_audit_append_only
  BEFORE UPDATE OR DELETE ON audit.events
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
CREATE OR REPLACE TRIGGER dxos_audit_no_truncate
  BEFORE TRUNCATE ON audit.events
  FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_change();
