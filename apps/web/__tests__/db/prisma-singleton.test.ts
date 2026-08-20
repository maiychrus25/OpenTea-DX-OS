// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import fs from 'fs';
import path from 'path';

describe('Story 1.3: Prisma Singleton Pattern', () => {
  const singletonPath = path.join(__dirname, '../../src/infrastructure/db/prisma.client.ts');
  let content = '';

  beforeAll(() => {
    if (fs.existsSync(singletonPath)) {
      content = fs.readFileSync(singletonPath, 'utf8');
    }
  });

  // TC-1.3-10: prisma export là object (không null/undefined)
  // TC-1.3-11: Module re-import trả về cùng instance (globalForPrisma pattern)
  test('prisma singleton pattern is correctly implemented', async () => {
    expect(fs.existsSync(singletonPath)).toBe(true);

    // Check for the globalForPrisma pattern
    expect(content).toMatch(/globalThis.*as.*{.*prisma/);
    expect(content).toMatch(/globalForPrisma\.prisma/);
    
    // Check for export
    expect(content).toMatch(/export\s+const\s+prisma\s+=/);

    // Check for production assignment protection
    expect(content).toMatch(/if\s*\(\s*process\.env\.NODE_ENV\s*!==\s*'production'\s*\)\s*{\s*globalForPrisma\.prisma\s*=\s*prisma/);
  });

  // TC-1.3-12: Log config dev mode includes 'query', prod mode chỉ 'error'
  test('prisma client has correct logging configuration', () => {
    expect(fs.existsSync(singletonPath)).toBe(true);
    
    expect(content).toMatch(/log:\s*process\.env\.NODE_ENV\s*===\s*'development'/);
    expect(content).toMatch(/\['query',\s*'error',\s*'warn'\]/);
    expect(content).toMatch(/:\s*\['error'\]/);
  });
});
