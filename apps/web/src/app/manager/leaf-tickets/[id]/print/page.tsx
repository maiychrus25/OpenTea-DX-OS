// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { TicketReceipt } from '@/components/features/weighing/TicketReceipt'

export default function ManagerTicketPrintPage({ params }: { params: { id: string } }) {
  return <TicketReceipt id={params.id} />
}
