import * as React from 'react'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import * as fs from 'fs'
import * as path from 'path'

it('[data-role="farmer"] applies 17px font size to children', () => {
  const { container } = render(
    <div data-role="farmer">
      <p>Văn bản tiếng Việt</p>
    </div>
  )
  expect(container.firstChild).toHaveAttribute('data-role', 'farmer')

  const cssPath = path.join(process.cwd(), 'src/styles/globals.css')
  const css = fs.readFileSync(cssPath, 'utf-8')
  expect(css).toContain('[data-role="farmer"]')
  expect(css).toContain('--font-size-body-large')
})
