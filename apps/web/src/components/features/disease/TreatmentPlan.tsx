// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import Link from 'next/link'
import { isHealthy, treatmentPlan } from '@/domain/disease/treatment-plan'
import { REFERENCES } from '@/components/features/articles/tea-references'
import styles from './treatment-plan.module.css'

export function TreatmentPlan({ disease, officerAdvice }: { disease: string; officerAdvice?: string | null }) {
  const steps = treatmentPlan(disease, officerAdvice)
  const reference = /bọ xít/i.test(disease) ? REFERENCES.mosquitoBug : null

  return (
    <div className={styles.plan}>
      <h3>Lộ trình xử lý gợi ý</h3>
      <ol>
        {steps.map(step => (
          <li key={step.title}>
            <span>{step.when}</span>
            <strong>{step.title}</strong>
            <p>{step.detail}</p>
          </li>
        ))}
      </ol>
      {!isHealthy(disease) && (
        <p className={styles.links}>
          <Link href="/farmer/journal/new">Ghi nhật ký phun</Link>
          {reference && <a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}</a>}
        </p>
      )}
    </div>
  )
}
