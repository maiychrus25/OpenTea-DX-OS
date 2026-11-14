// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Calendar, ClipboardList, LayoutGrid, Leaf, MapPinned, Package, Scale, ShoppingBag, Sparkles, Truck, Users, type LucideIcon } from 'lucide-react'

/** The ten icon names a manifest may use (STORE_ICONS); anything else is drawn as the default. */
export const ICONS: Record<string, LucideIcon> = {
  leaf: Leaf,
  scale: Scale,
  'shopping-bag': ShoppingBag,
  package: Package,
  'map-pinned': MapPinned,
  users: Users,
  calendar: Calendar,
  'clipboard-list': ClipboardList,
  truck: Truck,
  sparkles: Sparkles,
}

export const appIcon = (name: string | null): LucideIcon => (name && Object.hasOwn(ICONS, name) ? ICONS[name] : null) ?? LayoutGrid
