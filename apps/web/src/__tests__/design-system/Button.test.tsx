import * as React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { Button } from '@/components/ui'
import * as fs from 'fs'
import * as path from 'path'

describe('Button', () => {
  it('renders with primary variant', () => {
    render(<Button variant="primary">Lưu</Button>)
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeInTheDocument()
  })

  it('renders all 4 variants without errors', () => {
    const variants = ['primary', 'accent', 'ghost', 'danger'] as const
    variants.forEach(v => {
      const { unmount } = render(<Button variant={v}>Test</Button>)
      expect(screen.getByRole('button')).toHaveAttribute('data-testid', `button-${v}`)
      unmount()
    })
  })

  it('is disabled and not clickable when disabled prop is set', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<Button variant="primary" disabled onClick={onClick}>Lưu</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('CSS: min-height is 44px', () => {
    const cssPath = path.join(process.cwd(), 'src/components/ui/Button/Button.module.css')
    const css = fs.readFileSync(cssPath, 'utf-8')
    expect(css).toMatch(/min-height:\s*44px/)
  })
})
