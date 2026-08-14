// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AiNote } from '@/components/ui'
import React from 'react'

test('AiNote renders default disclaimer', () => {
  render(<AiNote />)
  expect(screen.getByText(/AI tổng hợp dữ liệu/)).toBeInTheDocument()
  expect(screen.getByText(/không đưa ra khuyến nghị/)).toBeInTheDocument()
})

test('AiNote renders custom message', () => {
  render(<AiNote message="Kết quả chẩn đoán chỉ mang tính tham khảo." />)
  expect(screen.getByText(/Kết quả chẩn đoán/)).toBeInTheDocument()
})
