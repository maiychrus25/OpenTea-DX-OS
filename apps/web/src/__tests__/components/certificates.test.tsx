// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CertificatesPanel } from '@/components/features/certificates/CertificatesPanel'
import { PublicNamesSetting } from '@/components/features/certificates/PublicNamesSetting'

const cert = (id: string, status: 'VALID' | 'EXPIRED' | 'REVOKED', number: string) => ({
  id, kind: 'VIETGAP', number, issuer: 'Chi cục TT&BVTV', issued_on: '2025-01-01', expires_on: '2027-01-01', scope_note: 'Vùng Tân Cương, 12 ha',
  file_name: 'vg.pdf', file_mime: 'application/pdf', file_size: 1000, revoked_at: status === 'REVOKED' ? '2026-01-01T00:00:00Z' : null,
  revoke_reason: status === 'REVOKED' ? 'Sai phạm' : null, status,
})

let items: unknown[]
let calls: { url: string; method: string; body: any }[]
let postResponse: () => { ok: boolean; status: number; json: () => Promise<unknown> }
let revokeResponse: () => { ok: boolean; status: number; json: () => Promise<unknown> }

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

beforeEach(() => {
  items = [cert('c1', 'VALID', 'VG-1'), cert('c2', 'EXPIRED', 'OC-2'), cert('c3', 'REVOKED', 'HC-3')]
  calls = []
  postResponse = () => ({ ok: true, status: 201, json: async () => ({ data: cert('c4', 'VALID', 'VG-4') }) })
  revokeResponse = () => ok({ data: cert('c1', 'REVOKED', 'VG-1') })
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const isForm = init?.body instanceof FormData
    const body = isForm || !init?.body ? init?.body : JSON.parse(String(init.body))
    calls.push({ url, method, body })
    if (url === '/api/certificates' && method === 'GET') return ok({ data: items })
    if (url === '/api/certificates' && method === 'POST') return postResponse()
    if (url.endsWith('/revoke') && method === 'POST') return revokeResponse()
    if (url === '/api/htx/public-settings' && method === 'GET') return ok({ data: { public_show_names: false } })
    if (url === '/api/htx/public-settings' && method === 'PUT') return ok({ data: { public_show_names: JSON.parse(String(init?.body)).public_show_names } })
    return { ok: false, status: 404, json: async () => ({}) }
  }) as unknown as typeof fetch
})

const fillForm = () => {
  fireEvent.change(screen.getByLabelText('Số chứng nhận'), { target: { value: 'VG-4' } })
  fireEvent.change(screen.getByLabelText('Tổ chức cấp'), { target: { value: 'Chi cục' } })
  fireEvent.change(screen.getByLabelText('Ngày cấp'), { target: { value: '2026-01-01' } })
  fireEvent.change(screen.getByLabelText('Ngày hết hạn'), { target: { value: '2028-01-01' } })
}
const chooseFile = (file: File) => fireEvent.change(screen.getByLabelText(/Tệp chứng nhận/), { target: { files: [file] } })

test('each certificate shows its status: valid to a date, expired, or revoked with the reason', async () => {
  render(<CertificatesPanel canRevoke={false} />)
  expect(await screen.findByText('Còn hiệu lực đến 01/01/2027')).toBeInTheDocument()
  expect(screen.getByText('Đã hết hạn')).toBeInTheDocument()
  expect(screen.getByText('Đã thu hồi')).toBeInTheDocument()
  expect(screen.getByText('Lý do thu hồi: Sai phạm')).toBeInTheDocument()
})

test('an empty list and a failed load each have their own state', async () => {
  items = []
  const { unmount } = render(<CertificatesPanel canRevoke={false} />)
  expect(await screen.findByText('Chưa có chứng nhận nào. Thêm chứng nhận ở bên cạnh.')).toBeInTheDocument()
  unmount()
  global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
  render(<CertificatesPanel canRevoke={false} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu')
})

test('the file opens through the private route in a new tab', async () => {
  render(<CertificatesPanel canRevoke={false} />)
  const link = (await screen.findAllByRole('link', { name: 'Mở tệp' }))[0]
  expect(link).toHaveAttribute('href', '/api/certificates/c1/file')
  expect(link).toHaveAttribute('target', '_blank')
})

test('an expiry before the issue date is refused before the upload', async () => {
  render(<CertificatesPanel canRevoke={false} />)
  await screen.findByText('Còn hiệu lực đến 01/01/2027')
  fillForm()
  fireEvent.change(screen.getByLabelText('Ngày hết hạn'), { target: { value: '2025-06-01' } })
  chooseFile(new File(['%PDF-1.4'], 'cert.pdf', { type: 'application/pdf' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu chứng nhận' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ngày hết hạn phải sau hoặc cùng ngày cấp.')
  expect(calls.some(c => c.method === 'POST')).toBe(false)
})

test('a valid certificate is posted as multipart with its fields and the file', async () => {
  render(<CertificatesPanel canRevoke={false} />)
  await screen.findByText('Còn hiệu lực đến 01/01/2027')
  fillForm()
  chooseFile(new File(['%PDF-1.4'], 'cert.pdf', { type: 'application/pdf' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu chứng nhận' }))
  expect(await screen.findByText('Đã lưu chứng nhận VG-4.')).toBeInTheDocument()
  const post = calls.find(c => c.method === 'POST')!
  expect(post.body).toBeInstanceOf(FormData)
  expect(post.body.get('kind')).toBe('VIETGAP')
  expect(post.body.get('number')).toBe('VG-4')
  expect(post.body.get('issuer')).toBe('Chi cục')
  expect(post.body.get('expires_on')).toBe('2028-01-01')
  expect(post.body.get('file')).toBeInstanceOf(File)
})

test('a file that is not PDF, JPG or PNG, or is over 10 MB, is refused in the browser', async () => {
  render(<CertificatesPanel canRevoke={false} />)
  await screen.findByText('Còn hiệu lực đến 01/01/2027')
  fillForm()
  chooseFile(new File(['<html>'], 'cert.pdf', { type: 'text/html' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu chứng nhận' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ nhận tệp PDF, JPG hoặc PNG.')
  chooseFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu chứng nhận' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Tệp vượt quá 10 MB.')
  expect(calls.some(c => c.method === 'POST')).toBe(false)
})

test('the server refusal of a file shows its code text', async () => {
  postResponse = () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'FILE_TYPE' } }) })
  render(<CertificatesPanel canRevoke={false} />)
  await screen.findByText('Còn hiệu lực đến 01/01/2027')
  fillForm()
  chooseFile(new File(['%PDF-1.4'], 'cert.pdf', { type: 'application/pdf' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu chứng nhận' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ nhận tệp PDF, JPG hoặc PNG.')
})

test('only the manager sees revoke; revoking needs a reason and then posts it', async () => {
  const { unmount } = render(<CertificatesPanel canRevoke={false} />)
  await screen.findByText('Còn hiệu lực đến 01/01/2027')
  expect(screen.queryByRole('button', { name: 'Thu hồi VG-1' })).not.toBeInTheDocument()
  unmount()

  render(<CertificatesPanel canRevoke />)
  fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi VG-1' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thu hồi' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Nhập lý do thu hồi từ 3 đến 200 ký tự.')
  expect(calls.some(c => c.url.endsWith('/revoke'))).toBe(false)
  fireEvent.change(screen.getByLabelText('Lý do thu hồi'), { target: { value: 'Hết hiệu lực thực tế' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thu hồi' }))
  await waitFor(() => expect(calls.find(c => c.url.endsWith('/revoke'))?.body).toEqual({ reason: 'Hết hiệu lực thực tế' }))
})

test('revoking a certificate already revoked elsewhere shows its message', async () => {
  revokeResponse = () => ({ ok: false, status: 409, json: async () => ({ error: { code: 'CERTIFICATE_REVOKED' } }) })
  render(<CertificatesPanel canRevoke />)
  fireEvent.click(await screen.findByRole('button', { name: 'Thu hồi VG-1' }))
  fireEvent.change(screen.getByLabelText('Lý do thu hồi'), { target: { value: 'Hết hiệu lực thực tế' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thu hồi' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Chứng nhận này đã được thu hồi trước đó.')
})

test('the public names switch starts off and saves the new value', async () => {
  render(<PublicNamesSetting />)
  const toggle = await screen.findByRole('switch', { name: 'Hiện tên người trên trang truy xuất công khai' })
  await waitFor(() => expect(toggle).toBeEnabled())
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
  expect(calls.find(c => c.method === 'PUT')!.body).toEqual({ public_show_names: true })
})

test('a failed save of the names switch is shown and the switch keeps its value', async () => {
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => (init?.method === 'PUT'
    ? { ok: false, status: 500, json: async () => ({}) }
    : ok({ data: { public_show_names: false } }))) as unknown as typeof fetch
  render(<PublicNamesSetting />)
  const toggle = await screen.findByRole('switch')
  await waitFor(() => expect(toggle).toBeEnabled())
  fireEvent.click(toggle)
  expect(await screen.findByRole('alert')).toHaveTextContent('Không lưu được cài đặt.')
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(within(toggle.parentElement!).getByText(/Đang tắt/)).toBeInTheDocument()
})
