// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { existsSync } from 'fs'
import { join } from 'path'

describe('postcss.config.mjs configuration', () => {
  it('exports configuration with @tailwindcss/postcss plugin', async () => {
    const configPath = join(process.cwd(), 'postcss.config.mjs')
    
    // Test that the file exists
    expect(existsSync(configPath)).toBe(true)

    if (existsSync(configPath)) {
      // Dynamic import of the MJS module
      const config = await import(`file://${configPath}`)
      const configExport = config.default || config

      expect(configExport).toBeDefined()
      expect(configExport.plugins).toBeDefined()
      expect(configExport.plugins['@tailwindcss/postcss']).toBeDefined()
    }
  })
})
