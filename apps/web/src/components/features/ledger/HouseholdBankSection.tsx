// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import kit from '@/components/features/farmer-web/kit.module.css'
import { HouseholdSearch, type HouseholdHit } from '@/components/features/weighing/HouseholdSearch'
import { fetchJson, LOAD_FAILED_MESSAGE } from '@/lib/api/fetch-json'
import type { BankOption, HouseholdBank } from '@/lib/ledger/types'
import styles from './ledger.module.css'

const ACCOUNT_PATTERN = /^\d{6,19}$/

/** Bank account of the household: the cooperative pays settlements into it. */
export function HouseholdBankSection() {
  const [household, setHousehold] = useState<HouseholdHit | null>(null)
  const [formKey, setFormKey] = useState(0)

  return (
    <section className={kit.pn} aria-labelledby="household-bank-title">
      <div className={kit.ph}><h2 id="household-bank-title">Tài khoản nhận tiền</h2></div>
      <div className={styles.form}>
        <HouseholdSearch key={formKey} label="Hộ" onSelect={setHousehold} />
        {household && (
          <HouseholdBankForm key={household.id} household={household} onClear={() => { setHousehold(null); setFormKey(k => k + 1) }} />
        )}
      </div>
    </section>
  )
}

interface FormProps {
  household: HouseholdHit
  onClear: () => void
}

function HouseholdBankForm({ household, onClear }: FormProps) {
  const [banks, setBanks] = useState<BankOption[]>([])
  const [bin, setBin] = useState('')
  const [account, setAccount] = useState('')
  const [accountName, setAccountName] = useState('')
  const [saved, setSaved] = useState<HouseholdBank | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchJson<{ data: BankOption[] }>('/api/banks')
      .then(body => setBanks(body.data))
      .catch(() => setError(LOAD_FAILED_MESSAGE))
  }, [])

  function problem(): string | null {
    if (!bin) return 'Chọn ngân hàng.'
    if (!ACCOUNT_PATTERN.test(account)) return 'Số tài khoản chỉ gồm 6 đến 19 chữ số.'
    if (accountName.trim().length > 60) return 'Tên chủ tài khoản tối đa 60 ký tự.'
    return null
  }

  async function save() {
    const message = problem()
    if (message) { setError(message); return }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/households/${household.id}/bank`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_bin: bin, bank_account: account, bank_account_name: accountName.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json?.error?.message || 'Không lưu được tài khoản.'); return }
      setSaved(json.data)
      setAccount('')
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.bankForm}>
      <p>Hộ: <strong>{household.name}</strong></p>
      {saved && (
        <p role="status" className={styles.status}>Đã lưu: {saved.bank_name} · {saved.account_masked}</p>
      )}
      <div className={styles.formGrid}>
        <label className={kit.fl}>
          Ngân hàng
          <select className={kit.inp} value={bin} onChange={e => setBin(e.target.value)}>
            <option value="">Chọn ngân hàng</option>
            {banks.map(b => <option key={b.bin} value={b.bin}>{b.name}</option>)}
          </select>
        </label>
        <label className={kit.fl}>
          Số tài khoản
          <input className={kit.inp} inputMode="numeric" value={account} aria-invalid={account !== '' && !ACCOUNT_PATTERN.test(account)}
            onChange={e => setAccount(e.target.value)} />
        </label>
        <label className={kit.fl}>
          Tên chủ tài khoản
          <input className={kit.inp} maxLength={60} value={accountName} onChange={e => setAccountName(e.target.value)} />
        </label>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClear}>Chọn hộ khác</Button>
        <Button isLoading={busy} onClick={save}>Lưu tài khoản</Button>
      </div>
    </div>
  )
}
