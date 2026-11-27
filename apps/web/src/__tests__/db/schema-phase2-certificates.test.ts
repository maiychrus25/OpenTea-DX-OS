// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { readFileSync } from 'fs'
import { join } from 'path'

const prismaDir = join(__dirname, '..', '..', '..', 'prisma')
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8')
const migration = readFileSync(join(prismaDir, 'migrations', '20261128160100_certificates_and_public_names', 'migration.sql'), 'utf8')
const auditInit = readFileSync(join(prismaDir, '..', '..', '..', 'platform', 'postgres', 'init', '03-audit-triggers.sql'), 'utf8')

describe('phase 2 track B schema', () => {
  it('declares certificates, the lot link and the names setting', () => {
    expect(schema).toMatch(/enum CertificateKind \{\s+VIETGAP\s+OCOP\s+ORGANIC\s+OTHER\s+\}/)
    expect(schema).toContain('@@map("htx_certificates")')
    expect(schema).toContain('@@id([lot_id, certificate_id])')
    expect(schema).toMatch(/public_show_names\s+Boolean\s+@default\(false\)/)
  })

  it('creates the tables, keys, checks and the guarded audit block', () => {
    expect(migration).toContain('CREATE TABLE "htx_certificates"')
    expect(migration).toContain('CREATE TABLE "lot_certificates"')
    expect(migration).toContain('"public_show_names" BOOLEAN NOT NULL DEFAULT false')
    expect(migration).toContain('lot_certificates_certificate_id_fkey')
    // The row audit trigger reads NEW.id: the link table has its own id and a unique pair.
    expect(migration).toMatch(/CREATE TABLE "lot_certificates" \(\s+"id" TEXT NOT NULL/)
    expect(migration).toContain('CREATE UNIQUE INDEX "lot_certificates_lot_id_certificate_id_key"')
    expect(migration).toContain('CHECK ("expires_on" >= "issued_on")')
    expect(migration).toContain("IF to_regprocedure('audit.capture_row()') IS NOT NULL")
    for (const t of ['htx_certificates', 'lot_certificates']) {
      expect(migration).toContain(`ON public.${t}`)
      expect(auditInit).toContain(`'${t}'`)
    }
  })
})
