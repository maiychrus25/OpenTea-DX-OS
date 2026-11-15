-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Tour system 1.0 (spec 8): settings, media, tours with a content model, departures, bookings with money, payments,
-- booking history, reviews, inquiries, the departure_load view, and the move of the 0.2.0 data.
-- Runs as role app_tea_tour with search_path app_tea_tour, in one transaction (dxos install / upgrade).
-- Every table has htx_code text NOT NULL, and every foreign key to such a table includes htx_code.

-- ---------- Cooperative settings and media ----------

CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  width int NOT NULL CHECK (width BETWEEN 1 AND 20000),
  height int NOT NULL CHECK (height BETWEEN 1 AND 20000),
  large bytea NOT NULL,
  thumb bytea NOT NULL,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, htx_code)
);
CREATE INDEX media_htx ON media (htx_code, created_at);

CREATE TABLE settings (
  htx_code text PRIMARY KEY,
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80),
  tagline text NOT NULL DEFAULT '' CHECK (char_length(tagline) <= 160),
  intro text NOT NULL DEFAULT '' CHECK (char_length(intro) <= 2000),
  hotline text NOT NULL DEFAULT '' CHECK (char_length(hotline) <= 20),
  zalo text NOT NULL DEFAULT '' CHECK (char_length(zalo) <= 30),
  email text NOT NULL DEFAULT '' CHECK (char_length(email) <= 120),
  address text NOT NULL DEFAULT '' CHECK (char_length(address) <= 200),
  map_url text NOT NULL DEFAULT '' CHECK (map_url = '' OR (map_url ~ '^https://' AND char_length(map_url) <= 300)),
  cover_media_id uuid,
  bank_bin text NOT NULL DEFAULT '' CHECK (bank_bin ~ '^([0-9]{6})?$'),
  bank_account text NOT NULL DEFAULT '' CHECK (bank_account ~ '^([0-9]{6,19})?$'),
  bank_holder text NOT NULL DEFAULT '' CHECK (bank_holder ~ '^([A-Z0-9 ]{1,60})?$'),
  deposit_percent int NOT NULL DEFAULT 0 CHECK (deposit_percent BETWEEN 0 AND 100),
  hold_hours int NOT NULL DEFAULT 24 CHECK (hold_hours BETWEEN 1 AND 168),
  cancel_free_hours int NOT NULL DEFAULT 24 CHECK (cancel_free_hours BETWEEN 0 AND 720),
  auto_confirm boolean NOT NULL DEFAULT false,
  policy_text text NOT NULL DEFAULT '' CHECK (char_length(policy_text) <= 2000),
  FOREIGN KEY (cover_media_id, htx_code) REFERENCES media (id, htx_code)
);

-- ---------- Tours (0.2.0 tours become tours plus one departure each) ----------

CREATE TABLE departures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  tour_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  seats int NOT NULL CHECK (seats BETWEEN 1 AND 200),
  price_adult_vnd int NOT NULL CHECK (price_adult_vnd >= 0),
  price_child_vnd int NOT NULL CHECK (price_child_vnd >= 0),
  guide_user_id text,
  guide_name text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
  cancel_reason text CHECK (char_length(cancel_reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, htx_code)
);

-- The 0.2.0 tour id is kept as the id of its single departure, so a booking only has to be renamed, not remapped.
INSERT INTO departures (id, htx_code, tour_id, starts_at, seats, price_adult_vnd, price_child_vnd, guide_user_id,
                        guide_name, status, created_at)
SELECT id, htx_code, id, starts_at, seats, price_vnd, price_vnd, guide_user_id, guide_name, status, created_at
FROM tours;

DROP INDEX tours_htx_starts_at;
DROP INDEX tours_guide;
ALTER TABLE tours DROP CONSTRAINT tours_status_check;
ALTER TABLE tours
  ADD COLUMN slug text,
  ADD COLUMN summary text NOT NULL DEFAULT '',
  ADD COLUMN category text NOT NULL DEFAULT 'SIGHTSEEING',
  ADD COLUMN duration_minutes int NOT NULL DEFAULT 180,
  ADD COLUMN map_url text NOT NULL DEFAULT '',
  ADD COLUMN price_adult_vnd int NOT NULL DEFAULT 0,
  ADD COLUMN price_child_vnd int NOT NULL DEFAULT 0,
  ADD COLUMN default_seats int NOT NULL DEFAULT 10,
  ADD COLUMN itinerary jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN includes jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN excludes jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN bring jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN faq jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN cover_media_id uuid,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE tours SET slug = 'tour-' || substr(id::text, 1, 8), price_adult_vnd = price_vnd, price_child_vnd = price_vnd,
                 default_seats = seats, description = COALESCE(description, ''),
                 status = CASE status WHEN 'OPEN' THEN 'PUBLISHED' ELSE 'ARCHIVED' END;
ALTER TABLE tours
  DROP COLUMN starts_at, DROP COLUMN seats, DROP COLUMN price_vnd, DROP COLUMN guide_user_id, DROP COLUMN guide_name,
  ALTER COLUMN slug SET NOT NULL,
  ALTER COLUMN category DROP DEFAULT,
  ALTER COLUMN duration_minutes DROP DEFAULT,
  ALTER COLUMN default_seats DROP DEFAULT,
  ALTER COLUMN description SET NOT NULL,
  ALTER COLUMN description SET DEFAULT '',
  ALTER COLUMN status SET DEFAULT 'DRAFT',
  DROP CONSTRAINT tours_description_check,
  ADD CONSTRAINT tours_description_check CHECK (char_length(description) <= 4000),
  ADD CONSTRAINT tours_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  ADD CONSTRAINT tours_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  ADD CONSTRAINT tours_summary_check CHECK (char_length(summary) <= 200),
  ADD CONSTRAINT tours_category_check CHECK (category IN ('PICKING', 'CRAFTING', 'TASTING', 'SIGHTSEEING', 'EDUCATION')),
  ADD CONSTRAINT tours_duration_check CHECK (duration_minutes BETWEEN 30 AND 2880),
  ADD CONSTRAINT tours_map_url_check CHECK (map_url = '' OR (map_url ~ '^https://' AND char_length(map_url) <= 300)),
  ADD CONSTRAINT tours_prices_check CHECK (price_adult_vnd >= 0 AND price_child_vnd >= 0),
  ADD CONSTRAINT tours_default_seats_check CHECK (default_seats BETWEEN 1 AND 200),
  ADD CONSTRAINT tours_itinerary_check CHECK (jsonb_typeof(itinerary) = 'array' AND jsonb_array_length(itinerary) <= 12),
  ADD CONSTRAINT tours_includes_check CHECK (jsonb_typeof(includes) = 'array' AND jsonb_array_length(includes) <= 10),
  ADD CONSTRAINT tours_excludes_check CHECK (jsonb_typeof(excludes) = 'array' AND jsonb_array_length(excludes) <= 10),
  ADD CONSTRAINT tours_bring_check CHECK (jsonb_typeof(bring) = 'array' AND jsonb_array_length(bring) <= 10),
  ADD CONSTRAINT tours_faq_check CHECK (jsonb_typeof(faq) = 'array' AND jsonb_array_length(faq) <= 8),
  ADD CONSTRAINT tours_slug_unique UNIQUE (htx_code, slug),
  ADD FOREIGN KEY (cover_media_id, htx_code) REFERENCES media (id, htx_code);
CREATE INDEX tours_htx_status ON tours (htx_code, status);

ALTER TABLE departures
  ADD FOREIGN KEY (tour_id, htx_code) REFERENCES tours (id, htx_code);
CREATE INDEX departures_htx_starts_at ON departures (htx_code, starts_at);
CREATE INDEX departures_tour ON departures (htx_code, tour_id, starts_at);
CREATE INDEX departures_guide ON departures (htx_code, guide_user_id);

CREATE TABLE tour_media (
  htx_code text NOT NULL,
  tour_id uuid NOT NULL,
  media_id uuid NOT NULL UNIQUE,  -- a photo belongs to one tour
  position int NOT NULL CHECK (position >= 0),
  PRIMARY KEY (tour_id, media_id),
  FOREIGN KEY (tour_id, htx_code) REFERENCES tours (id, htx_code),
  FOREIGN KEY (media_id, htx_code) REFERENCES media (id, htx_code)
);
CREATE INDEX tour_media_order ON tour_media (htx_code, tour_id, position);

-- ---------- Bookings ----------

ALTER TABLE bookings DROP CONSTRAINT bookings_tour_id_htx_code_fkey;
ALTER TABLE bookings RENAME COLUMN tour_id TO departure_id;
ALTER INDEX bookings_tour RENAME TO bookings_departure;
ALTER TABLE bookings
  ADD COLUMN email text CHECK (char_length(email) <= 120),
  ADD COLUMN adults int NOT NULL DEFAULT 0,
  ADD COLUMN children int NOT NULL DEFAULT 0,
  ADD COLUMN price_adult_vnd int NOT NULL DEFAULT 0,
  ADD COLUMN price_child_vnd int NOT NULL DEFAULT 0,
  ADD COLUMN total_vnd int NOT NULL DEFAULT 0,
  ADD COLUMN deposit_vnd int NOT NULL DEFAULT 0,
  ADD COLUMN paid_vnd int NOT NULL DEFAULT 0,
  ADD COLUMN hold_until timestamptz,
  ADD COLUMN request_key text,
  ADD COLUMN access_key text,
  ADD COLUMN internal_note text CHECK (char_length(internal_note) <= 500),
  ADD COLUMN cancel_reason text CHECK (char_length(cancel_reason) <= 200),
  ADD COLUMN cancelled_by text CHECK (cancelled_by IN ('GUEST', 'MANAGER', 'SYSTEM')),
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN guest_paid_reported_at timestamptz,
  ADD COLUMN checked_in_at timestamptz,
  ADD COLUMN checked_in_count int,
  ADD COLUMN checked_in_by text,
  ADD COLUMN source text NOT NULL DEFAULT 'WEB';

-- Each 0.2.0 booking: all guests are adults at the old price; random keys come from gen_random_uuid().
UPDATE bookings b
SET adults = b.party_size,
    price_adult_vnd = d.price_adult_vnd,
    price_child_vnd = d.price_child_vnd,
    total_vnd = b.party_size * d.price_adult_vnd,
    request_key = 'm' || replace(gen_random_uuid()::text, '-', ''),
    access_key = substr(translate(encode(decode(replace(gen_random_uuid()::text, '-', '') ||
                 replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), 1, 22)
FROM departures d
WHERE d.id = b.departure_id AND d.htx_code = b.htx_code;

-- party_size becomes adults + children and stays readable (a platform smoke test selects it).
ALTER TABLE bookings DROP COLUMN party_size;
ALTER TABLE bookings
  ADD COLUMN party_size int GENERATED ALWAYS AS (adults + children) STORED,
  ALTER COLUMN request_key SET NOT NULL,
  ALTER COLUMN access_key SET NOT NULL,
  ALTER COLUMN adults DROP DEFAULT,
  ALTER COLUMN children DROP DEFAULT,
  ALTER COLUMN price_adult_vnd DROP DEFAULT,
  ALTER COLUMN price_child_vnd DROP DEFAULT,
  ALTER COLUMN total_vnd DROP DEFAULT,
  ALTER COLUMN deposit_vnd DROP DEFAULT,
  ADD CONSTRAINT bookings_party_check CHECK (adults >= 0 AND children >= 0 AND adults + children BETWEEN 1 AND 200),
  ADD CONSTRAINT bookings_money_check CHECK (price_adult_vnd >= 0 AND price_child_vnd >= 0 AND total_vnd >= 0
                                             AND deposit_vnd >= 0 AND deposit_vnd <= total_vnd AND paid_vnd >= 0),
  ADD CONSTRAINT bookings_request_key_unique UNIQUE (htx_code, request_key),
  ADD CONSTRAINT bookings_access_key_check CHECK (access_key ~ '^[A-Za-z0-9_-]{22}$'),
  ADD CONSTRAINT bookings_request_key_check CHECK (char_length(request_key) BETWEEN 8 AND 64),
  ADD CONSTRAINT bookings_source_check CHECK (source IN ('WEB', 'APP', 'MANAGER')),
  ADD CONSTRAINT bookings_checked_in_check CHECK (checked_in_count IS NULL OR checked_in_count >= 1),
  ADD CONSTRAINT bookings_id_htx_unique UNIQUE (id, htx_code),
  ADD FOREIGN KEY (departure_id, htx_code) REFERENCES departures (id, htx_code);
CREATE INDEX bookings_htx_departure ON bookings (htx_code, departure_id);
CREATE INDEX bookings_htx_phone ON bookings (htx_code, phone);
CREATE INDEX bookings_htx_created ON bookings (htx_code, created_at);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  booking_id uuid NOT NULL,
  amount_vnd int NOT NULL CHECK (amount_vnd <> 0),
  method text NOT NULL CHECK (method IN ('TRANSFER', 'CASH')),
  note text CHECK (char_length(note) <= 200),
  recorded_by_id text,
  recorded_by_name text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (booking_id, htx_code) REFERENCES bookings (id, htx_code)
);
CREATE INDEX payments_booking ON payments (htx_code, booking_id);
CREATE INDEX payments_recorded ON payments (htx_code, recorded_at);

CREATE TABLE booking_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  htx_code text NOT NULL,
  booking_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  actor_kind text NOT NULL CHECK (actor_kind IN ('GUEST', 'MANAGER', 'GUIDE', 'SYSTEM')),
  actor_name text NOT NULL DEFAULT '',
  kind text NOT NULL,
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 300),
  FOREIGN KEY (booking_id, htx_code) REFERENCES bookings (id, htx_code)
);
CREATE INDEX booking_events_booking ON booking_events (htx_code, booking_id, at);

-- ---------- Moving the 0.2.0 data into the new rules (spec 8, "Chuyển dữ liệu" item 3) ----------

WITH cancelled AS (
  UPDATE bookings b
  SET status = 'CANCELLED', cancel_reason = 'HTX huỷ chuyến', cancelled_by = 'SYSTEM', cancelled_at = now()
  FROM departures d
  WHERE d.id = b.departure_id AND d.htx_code = b.htx_code AND d.status = 'CANCELLED'
    AND b.status IN ('PENDING', 'CONFIRMED')
  RETURNING b.id, b.htx_code, b.cancel_reason
)
INSERT INTO booking_events (htx_code, booking_id, actor_kind, actor_name, kind, detail)
SELECT htx_code, id, 'SYSTEM', 'Hệ thống', 'CANCELLED', cancel_reason FROM cancelled;

WITH stale AS (
  UPDATE bookings b
  SET status = 'CANCELLED', cancel_reason = 'Chuyến đã khởi hành mà chưa được xác nhận', cancelled_by = 'SYSTEM',
      cancelled_at = now()
  FROM departures d
  WHERE d.id = b.departure_id AND d.htx_code = b.htx_code AND d.starts_at <= now() AND b.status = 'PENDING'
  RETURNING b.id, b.htx_code, b.cancel_reason
)
INSERT INTO booking_events (htx_code, booking_id, actor_kind, actor_name, kind, detail)
SELECT htx_code, id, 'SYSTEM', 'Hệ thống', 'CANCELLED', cancel_reason FROM stale;

-- ---------- Reviews and inquiries ----------

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  booking_id uuid NOT NULL UNIQUE,
  tour_id uuid NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'HIDDEN')),
  reply text CHECK (char_length(reply) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  moderated_at timestamptz,
  FOREIGN KEY (booking_id, htx_code) REFERENCES bookings (id, htx_code),
  FOREIGN KEY (tour_id, htx_code) REFERENCES tours (id, htx_code)
);
CREATE INDEX reviews_tour ON reviews (htx_code, tour_id, status);
CREATE INDEX reviews_status ON reviews (htx_code, status, created_at);

CREATE TABLE inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  phone text NOT NULL CHECK (phone ~ '^0[0-9]{9}$'),
  group_size int NOT NULL CHECK (group_size BETWEEN 1 AND 500),
  desired_date date,
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'CLOSED')),
  internal_note text CHECK (char_length(internal_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiries_status ON inquiries (htx_code, status, created_at);

-- ---------- Seats: the one definition of "holding" (spec 7.1) ----------
-- A booking holds seats when CONFIRMED, or PENDING with no deadline, a deadline still ahead, or a reported payment.
-- Every seat count in the app reads this view, so an expired hold frees its seats before any sweep has run.

CREATE VIEW departure_load AS
SELECT d.htx_code, d.id AS departure_id,
       COALESCE(sum(b.adults + b.children) FILTER (
         WHERE b.status = 'CONFIRMED'
            OR (b.status = 'PENDING' AND (b.hold_until IS NULL OR b.hold_until > now()
                                          OR b.guest_paid_reported_at IS NOT NULL))), 0)::int AS seats_used,
       COALESCE(sum(b.adults + b.children) FILTER (WHERE b.status = 'CONFIRMED'), 0)::int AS confirmed_guests
FROM departures d
LEFT JOIN bookings b ON b.departure_id = d.id AND b.htx_code = d.htx_code
GROUP BY d.htx_code, d.id;
