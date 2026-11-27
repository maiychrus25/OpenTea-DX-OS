// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { notFound, permanentRedirect } from 'next/navigation'

export const runtime = 'nodejs'

/** Printed labels point here; the one public trace page is /q/[lot_code], so this answers 308 to it. */
export default async function LotRedirect({ params }: { params: Promise<{ lot_code: string }> }) {
  const { lot_code } = await params
  let decoded: string
  try {
    decoded = decodeURIComponent(lot_code).normalize('NFC')
  } catch {
    notFound()
  }
  if (!decoded || decoded.length > 100 || /[\/\r\n?#]/.test(decoded)) notFound()
  permanentRedirect(`/q/${encodeURIComponent(decoded)}`)
}
