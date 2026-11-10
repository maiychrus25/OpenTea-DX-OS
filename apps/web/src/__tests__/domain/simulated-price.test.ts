// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** @jest-environment node */

import fs from 'fs'
import path from 'path'
import { isSimulatedPrice, SIMULATED_MARKET_SOURCE } from '@/domain/market/simulated-price'

const WORKFLOWS = path.resolve(__dirname, '../../../../../workflows')

function nodeOf(workflow: string, nodeName: string) {
  const json = JSON.parse(fs.readFileSync(path.join(WORKFLOWS, workflow), 'utf8'))
  return json.nodes.find((n: { name: string }) => n.name === nodeName).parameters
}

type Row = { json: { source: string; commodity: string; value: number; unit: string } }

describe('simulated market prices', () => {
  it('marks only the simulated source', () => {
    expect(isSimulatedPrice(SIMULATED_MARKET_SOURCE)).toBe(true)
    expect(isSimulatedPrice('COMTRADE')).toBe(false)
    expect(isSimulatedPrice('USDA')).toBe(false)
    expect(isSimulatedPrice('')).toBe(false)
  })

  it('vietnam_market_sync writes every simulated price under the simulated source, tea included', () => {
    const { jsCode } = nodeOf('vietnam_market_sync.json', 'Bóc Tách Dữ Liệu (Toàn Quốc)')
    const rows: Row[] = new Function(jsCode)()

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((r) => !isSimulatedPrice(r.json.source))).toEqual([])
    const tea = rows.find((r) => r.json.commodity === 'Tea')
    expect(tea?.json.unit).toBe('VND/kg')
    expect(tea?.json.value).toBeGreaterThan(0)
  })

  it('the seed uses the same simulated source', () => {
    const seed = fs.readFileSync(path.resolve(__dirname, '../../../prisma/seed.ts'), 'utf8')
    expect(seed).toContain(`const SIMULATED_MARKET_SOURCE = '${SIMULATED_MARKET_SOURCE}'`)
  })

  it('comtrade_export_sync fetches HS 0902 and stores it as Tea', () => {
    expect(nodeOf('comtrade_export_sync.json', 'Fetch COMTRADE').url).toMatch(/cmdCode=[0-9,]*\b0902\b/)

    const { jsCode } = nodeOf('comtrade_export_sync.json', 'Parse COMTRADE Response')
    const item = { cmdCode: '0902', partnerCode: 0, period: '2025', motCode: 0, fobvalue: 250_000_000, netWgt: 120_000_000 }
    const $ = () => ({ all: () => [{ json: item }] })
    const rows: Row[] = new Function('$', jsCode)($)

    expect(rows.map((r) => r.json.commodity)).toEqual(['Tea', 'Tea'])
  })
})
