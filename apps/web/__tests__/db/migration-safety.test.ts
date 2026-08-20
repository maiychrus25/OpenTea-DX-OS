// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import fs from 'fs';
import path from 'path';

describe('Story 1.3: Migration Safety', () => {
  const migrationsDir = path.join(__dirname, '../../prisma/migrations');

  // TC-1.3-13: migration_lock.toml tồn tại
  test('migration_lock.toml exists', () => {
    const lockPath = path.join(migrationsDir, 'migration_lock.toml');
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  // Helper to read all migration SQL files
  const getMigrationSqls = () => {
    if (!fs.existsSync(migrationsDir)) return [];
    
    const migrations = fs.readdirSync(migrationsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    return migrations.map(migration => {
      const sqlPath = path.join(migrationsDir, migration, 'migration.sql');
      return {
        name: migration,
        sql: fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf8') : ''
      };
    });
  };

  // TC-1.3-14: Không migration nào DROP TABLE mà không CREATE TABLE thay thế trong cùng file
  test('no destructive unreplaced DROP TABLE statements', () => {
    const migrationSqls = getMigrationSqls();

    for (const { name, sql } of migrationSqls) {
      if (sql.includes('DROP TABLE')) {
        // If a table is dropped, we expect a corresponding CREATE TABLE in the same migration
        // In our case, the rename from "Lot" to "lots" is done via DROP then CREATE
        expect(sql).toMatch(/CREATE TABLE/);
      }
    }
  });

  // TC-1.3-15: Latest migration SQL là non-destructive
  test('latest migration is non-destructive', () => {
    const migrationSqls = getMigrationSqls();
    if (migrationSqls.length > 0) {
      const latestMigration = migrationSqls[migrationSqls.length - 1];
      
      // Ensure the latest migration (add pushed_to_mattermost) only adds column/index
      expect(latestMigration.sql).not.toMatch(/DROP/i);
      expect(latestMigration.sql).toMatch(/ALTER TABLE/i);
      expect(latestMigration.sql).toMatch(/ADD COLUMN/i);
    }
  });

  // TC-1.3-16: Migration renaming Lot -> lots có CREATE TABLE trước/cùng lúc với DROP
  test('rename Lot to lots is handled explicitly via DROP and CREATE', () => {
    const migrationSqls = getMigrationSqls();
    const htxRelationsMigration = migrationSqls.find(m => m.name.includes('add_htx_relations'));
    
    if (htxRelationsMigration) {
      const sql = htxRelationsMigration.sql;
      expect(sql).toMatch(/DROP TABLE "Lot"/);
      expect(sql).toMatch(/CREATE TABLE "lots"/);
    }
  });
});
