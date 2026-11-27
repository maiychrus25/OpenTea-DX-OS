// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'

/** The farmer's tickets now live in the "Sổ tiền" page as a tab; the old address keeps working. */
export default function FarmerLeafTicketsRedirect() {
  redirect('/farmer/ledger')
}
