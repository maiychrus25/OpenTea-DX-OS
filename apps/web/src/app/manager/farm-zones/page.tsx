// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import dynamic from 'next/dynamic'

const ManagerZones = dynamic(() => import('./_components/ManagerZones'), { ssr: false })

export default function Page() {
  return <ManagerZones />
}
