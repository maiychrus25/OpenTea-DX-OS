// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as fs from 'fs'
import * as path from 'path'

it('Skeleton CSS has prefers-reduced-motion rule', () => {
  const cssPath = path.join(process.cwd(), 'src/components/ui/Skeleton/Skeleton.module.css')
  const css = fs.readFileSync(cssPath, 'utf-8')
  expect(css).toContain('prefers-reduced-motion: reduce')
  expect(css).toMatch(/animation:\s*none/)
})
