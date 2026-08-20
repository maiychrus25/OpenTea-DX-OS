import dynamic from 'next/dynamic'
import React from 'react'

const PartnerMap = dynamic(() => import('@/components/features/partner-map/PartnerMap'), { ssr: false })

export default function Page() {
  return (
    <main>
      <h1>Partner Map (Manager)</h1>
      <PartnerMap />
    </main>
  )
}
