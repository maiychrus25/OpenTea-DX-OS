-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_custom_books with search_path app_custom_books (dxos install, one transaction).
CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  icon text NOT NULL DEFAULT 'clipboard-list',
  -- [{key, label, type, required, in_list, summary, options, unit}]; keys f1, f2, ... are never reused (next_key).
  fields jsonb NOT NULL DEFAULT '[]',
  next_key int NOT NULL DEFAULT 1 CHECK (next_key BETWEEN 1 AND 10000),
  officer_access text NOT NULL DEFAULT 'own' CHECK (officer_access IN ('none', 'view', 'own', 'all')),
  farmer_access text NOT NULL DEFAULT 'none' CHECK (farmer_access IN ('none', 'view', 'own', 'all')),
  approval boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, htx_code)  -- target of the records foreign key below
);
CREATE INDEX books_htx_status ON books (htx_code, status, updated_at DESC);

CREATE TABLE records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  book_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  entry_date date NOT NULL,
  household_id text,
  household_name text CHECK (char_length(household_name) <= 200),  -- the name when the row was saved
  status text NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reject_reason text CHECK (char_length(reject_reason) <= 200),
  decided_by_name text,
  decided_at timestamptz,
  created_by text NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A record always belongs to a book of its own HTX.
  FOREIGN KEY (book_id, htx_code) REFERENCES books (id, htx_code)
);
CREATE INDEX records_book_date ON records (htx_code, book_id, entry_date DESC);
CREATE INDEX records_book_author ON records (htx_code, book_id, created_by);
