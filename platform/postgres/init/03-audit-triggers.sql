-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Row-level audit capture on business tables (idempotent; tables are attached only once they exist).
CREATE OR REPLACE FUNCTION audit.capture_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM audit.append_event(
    'db', TG_TABLE_NAME, TG_OP, coalesce(NEW.id, OLD.id)::text, audit.current_actor(),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['htx_profiles','households','parcels','parcel_crop_cycles','journal_entries',
                           'journal_activities','lots','lot_parcels','disease_reports'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('CREATE OR REPLACE TRIGGER dxos_audit_row AFTER INSERT OR UPDATE OR DELETE ON public.%I '
                     'FOR EACH ROW EXECUTE FUNCTION audit.capture_row()', t);
    END IF;
  END LOOP;
END $$;
