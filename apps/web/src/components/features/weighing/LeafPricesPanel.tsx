// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client'

import React, { useState } from 'react'
import { LeafPriceBoard } from './LeafPriceBoard'
import { LeafGradeSection } from './LeafGradeSection'

/** Price board and grade list on one screen; a grade change reloads the price board. */
export function LeafPricesPanel() {
  const [revision, setRevision] = useState(0)
  return (
    <>
      <LeafPriceBoard revision={revision} />
      <LeafGradeSection onChanged={() => setRevision(r => r + 1)} />
    </>
  )
}
