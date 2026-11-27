// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import styles from './sample.module.css'

/** Marks a block that shows made-up figures because there is no data for it yet. */
export function SampleTag() {
  return <span className={styles.tag} title="Số liệu mẫu, chưa có dữ liệu thật">Mẫu</span>
}
