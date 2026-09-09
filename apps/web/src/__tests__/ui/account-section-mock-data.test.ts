// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { getRoleLabel, getInitials } from '../../components/ui/account-section/account-section'

describe('AccountSection Utility Functions', () => {
  describe('getRoleLabel', () => {
    it('returns correct label for manager', () => {
      expect(getRoleLabel('manager')).toBe('Trưởng HTX')
    })

    it('returns correct label for officer', () => {
      expect(getRoleLabel('officer')).toBe('Cán bộ KT/CL')
    })

    it('returns correct label for farmer', () => {
      expect(getRoleLabel('farmer')).toBe('Nông dân')
    })
  })

  describe('getInitials', () => {
    it('returns U for empty string', () => {
      expect(getInitials('')).toBe('U')
    })

    it('returns U for whitespace string', () => {
      expect(getInitials('   ')).toBe('U')
    })

    it('returns first character capitalized for ascii names', () => {
      expect(getInitials('john doe')).toBe('J')
      expect(getInitials('Alice')).toBe('A')
    })

    it('returns first character capitalized for vietnamese names', () => {
      expect(getInitials('nguyễn văn an')).toBe('N')
      expect(getInitials('Ái')).toBe('Á')
    })

    it('handles names with leading whitespace', () => {
      expect(getInitials('  Bảo')).toBe('B')
    })
  })
})
