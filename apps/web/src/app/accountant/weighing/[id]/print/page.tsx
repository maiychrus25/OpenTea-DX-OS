// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { TicketReceipt } from '@/components/features/weighing/TicketReceipt'

export default function WeighingReceiptPage({ params }: { params: { id: string } }) {
  return <TicketReceipt id={params.id} />
}
