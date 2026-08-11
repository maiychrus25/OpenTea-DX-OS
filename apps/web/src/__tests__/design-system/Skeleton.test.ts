import * as fs from 'fs'
import * as path from 'path'

it('Skeleton CSS has prefers-reduced-motion rule', () => {
  const cssPath = path.join(process.cwd(), 'src/components/ui/Skeleton/Skeleton.module.css')
  const css = fs.readFileSync(cssPath, 'utf-8')
  expect(css).toContain('prefers-reduced-motion: reduce')
  expect(css).toMatch(/animation:\s*none/)
})
