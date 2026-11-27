// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { HarvestCalendar } from '@/components/features/schedule/HarvestCalendar'

export default function OfficerSchedulePage() {
  return (
    <div>
      <HarvestCalendar userRole="OFFICER" />
    </div>
  )
}
