// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { Sample } from './parts'
import styles from './kit.module.css'

export interface Step { label: string; when: string; done: boolean; sample?: boolean }

/** The stages of a batch or a lot, ticked as far as they have gone. */
export function Steps({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <div className={styles.stepsBox}>
      <h3>{title}</h3>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.label} data-done={step.done}>
            <span>{step.label} {step.sample && <Sample />}</span>
            <small>{step.when}</small>
          </li>
        ))}
      </ol>
    </div>
  )
}
