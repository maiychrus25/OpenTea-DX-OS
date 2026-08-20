// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Step1Household } from './step1-household'
import { Step2MapDraw } from './step2-map-draw'
import { Step3CropAssign } from './step3-crop-assign'
import styles from '../wizard.module.css'

export function SetupWizard() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [householdName, setHouseholdName] = useState<string>('')
  const [area, setArea] = useState<number | null>(null)

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <Step1Household 
            selectedHouseholdId={householdId}
            onSelect={(h) => {
              setHouseholdId(h.id)
              setHouseholdName(h.name)
            }}
            onNext={() => setStep(2)}
          />
        )
      case 2:
        return (
          <Step2MapDraw
            householdName={householdName}
            onPrev={() => setStep(1)}
            onNext={(a) => {
              setArea(a)
              setStep(3)
            }}
          />
        )
      case 3:
        return (
          <Step3CropAssign
            householdId={householdId!}
            householdName={householdName}
            area={area || 0}
            onPrev={() => setStep(2)}
            onComplete={() => {
              alert('Đã thiết lập vùng trồng thành công!')
              router.push('/officer/dashboard')
            }}
          />
        )
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <a href="/officer/dashboard" className={styles.backLink}>← Quay lại trang chủ</a>
        <span className={styles.eyebrow}>THIẾT LẬP VÙNG TRỒNG</span>
        <h1 className={styles.title}>Hộ → Thửa đất → Cây trồng</h1>
        <p className={styles.subtitle}>Thực hiện tuần tự: thêm hộ, khoanh thửa trên bản đồ, sau đó gán cây trồng.</p>
      </div>

      <div className={styles.tabs}>
        <div className={`${styles.tab} ${step === 1 ? styles.active : step > 1 ? styles.done : ''}`}>
          <div className={styles.tabNumber}>{step > 1 ? '✓' : '1'}</div>
          Chọn / thêm hộ
        </div>
        <div className={`${styles.tab} ${step === 2 ? styles.active : step > 2 ? styles.done : ''}`}>
          <div className={styles.tabNumber}>{step > 2 ? '✓' : '2'}</div>
          Vẽ thửa đất
        </div>
        <div className={`${styles.tab} ${step === 3 ? styles.active : ''}`}>
          <div className={styles.tabNumber}>3</div>
          Gán cây trồng
        </div>
      </div>

      {renderStep()}
    </div>
  )
}
