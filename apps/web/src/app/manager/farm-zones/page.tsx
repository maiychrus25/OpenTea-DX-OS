// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import dynamic from 'next/dynamic'

const FarmZoneReadOnly = dynamic(() => import('./_components/FarmZoneReadOnly'), { ssr: false })

export default function Page() {
  return (
    <div style={{padding:12}}>
      <h2>Farm Zone Map (Read-only)</h2>
      <FarmZoneReadOnly />
    </div>
  )
}
