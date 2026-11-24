/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'

describe('agent evidence canonical hashing', () => {
  test('canonicalJson sorts nested object keys and omits undefined properties', () => {
    const out = canonicalJson({ z: 1, a: { c: undefined, b: 'x', a: 2 }, arr: [3, 1, 2] })
    expect(out).toBe('{"a":{"a":2,"b":"x"},"arr":[3,1,2],"z":1}')
  })

  test('matches cross-language fixed SHA-256 vector', () => {
    const canonical = canonicalJson({ b: 1, a: [{ d: 'é', c: null }] })
    expect(canonical).toBe('{"a":[{"c":null,"d":"é"}],"b":1}')
    expect(sha256Hex(canonical)).toBe('2d39a9eff5fc38971ac13f9187b86e18b6531fd0fe2c17e45a200a5948144ae7')
  })

  test('throws on non-finite numbers', () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow()
    expect(() => canonicalJson({ x: Number.POSITIVE_INFINITY })).toThrow()
  })

  test('throws on non-integer numbers, as the contract only allows integers', () => {
    expect(() => canonicalJson({ x: 1.5 })).toThrow()
    expect(() => canonicalJson([0.1])).toThrow()
    expect(canonicalJson({ x: -3 })).toBe('{"x":-3}')
  })

  test('evidenceDigest depends only on table, id, sha256 in order', () => {
    const d1 = evidenceDigest([{ table: 'journal_entries', id: 'j1', sha256: 'abc', values: { x: 1 } }])
    const d2 = evidenceDigest([{ table: 'journal_entries', id: 'j1', sha256: 'abc', values: { x: 999 } }])
    const d3 = evidenceDigest([{ table: 'journal_entries', id: 'j1', sha256: 'def' }])
    expect(d1).toBe(d2)
    expect(d1).not.toBe(d3)
  })
})
