// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import kit from '@/components/features/dashboard/page-kit.module.css'
import styles from './platform.module.css'

const EMPTY = { htx_code: '', name: '', address: '', fullName: '', phone: '', pin: '' }

export function CreateHtxButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })
  const close = () => {
    if (saving) return
    setOpen(false)
    setForm(EMPTY)
    setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/platform/htx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htx_code: form.htx_code.trim().toUpperCase(),
          name: form.name,
          address: form.address || undefined,
          manager: { fullName: form.fullName, phone: form.phone, pin: form.pin },
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error?.message || 'Không tạo được HTX. Kiểm tra mã HTX (2-6 chữ hoa hoặc số), số điện thoại và mật khẩu.')
      }
      close()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được HTX.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" />
        Tạo HTX
      </Button>
      <Modal isOpen={open} onClose={close} title="Tạo hợp tác xã" size="md">
        <form onSubmit={submit} className={styles.form}>
          <label>Mã HTX<input required value={form.htx_code} onChange={set('htx_code')} pattern="[A-Za-z0-9]{2,6}" placeholder="VD: TC" /></label>
          <label>Tên HTX<input required minLength={2} value={form.name} onChange={set('name')} /></label>
          <label>Địa chỉ<input value={form.address} onChange={set('address')} /></label>
          <fieldset>
            <legend>Tài khoản Trưởng HTX đầu tiên</legend>
            <label>Họ và tên<input required minLength={2} value={form.fullName} onChange={set('fullName')} /></label>
            <label>Số điện thoại (tên đăng nhập)<input required type="tel" minLength={10} value={form.phone} onChange={set('phone')} /></label>
            <label>Mật khẩu<input required minLength={6} value={form.pin} onChange={set('pin')} /></label>
          </fieldset>
          {error && <p role="alert" className={kit.error}>{error}</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={close} disabled={saving}>Hủy</Button>
            <Button type="submit" variant="primary" isLoading={saving}>Tạo</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
