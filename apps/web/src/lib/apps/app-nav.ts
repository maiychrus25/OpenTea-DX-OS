// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { createElement } from 'react'
import type { NavItem } from '@/components/layout/Sidebar/Sidebar'
import type { AppFeed, FeedLoader } from '@/application/apps/app-feed'
import type { InstalledApp } from '@/domain/entities/installed-app'
import { appIcon } from '@/lib/apps/app-icons'
import { UNSAFE_SEGMENT } from '@/lib/apps/unsafe-segment'
import { logger } from '@/lib/logger'

export type AppRole = 'farmer' | 'officer' | 'manager'

// Next redirects a trailing slash away, and the Sidebar marks an item active only on an exact or child path.
const withoutTrailingSlash = (path: string) => path.replace(/\/+$/, '')

/** The menu entries of the installed apps for one role, each pointing at the app page in the shell; `feeds` adds an app's feed entries after its own. */
export function appNavItems(apps: InstalledApp[], role: AppRole, feeds: Record<string, AppFeed> = {}): NavItem[] {
  return apps.flatMap(app => [
    ...app.menu
      .filter(entry => entry.roles.includes(role))
      .map(entry => ({
        label: entry.label,
        href: withoutTrailingSlash(`/${role}/apps/${app.id}${entry.path}`),
        icon: createElement(appIcon(null), { size: 20 }),
      })),
    ...(feeds[app.id]?.entries ?? []).map(entry => ({
      label: entry.label,
      href: `/${role}/apps/${app.id}${entry.path}`,
      icon: createElement(appIcon(entry.icon), { size: 20 }),
    })),
  ])
}

/**
 * The app items for a role layout; when the list cannot be read the menu shows no app, never an error (spec §9).
 * A feed that cannot be read only costs its own entries.
 */
export async function loadAppNavItems(
  repository: { list: (htxCode: string | null) => Promise<InstalledApp[]> },
  role: AppRole,
  htxCode: string | null,
  loadFeed?: FeedLoader,
): Promise<NavItem[]> {
  try {
    const apps = await repository.list(htxCode)
    const feeds: Record<string, AppFeed> = {}
    if (loadFeed && htxCode) {
      await Promise.all(
        apps
          .filter(app => app.feed && app.menu.some(entry => entry.roles.includes(role)))
          .map(async app => {
            try {
              feeds[app.id] = await loadFeed(app, role, htxCode)
            } catch (cause) {
              logger.error('Mini-app feed unavailable', { appId: app.id, cause })
            }
          }),
      )
    }
    return appNavItems(apps, role, feeds)
  } catch (cause) {
    logger.error('Mini-app menu unavailable', { role, cause })
    return []
  }
}

/**
 * The proxy URL the shell frames for `/<role>/apps/<id>/<path>?<query>`, or null when the role has no menu entry or a
 * segment is empty or unsafe (the proxy refuses those too; this keeps them out of the frame's src).
 */
export function miniAppSrc(
  app: InstalledApp,
  role: AppRole,
  path: string[],
  searchParams: Record<string, string | string[] | undefined>,
): string | null {
  if (!app.menu.some(entry => entry.roles.includes(role))) return null
  if (path.some(segment => UNSAFE_SEGMENT.test(segment))) return null
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(name, item)
  }
  const search = query.toString()
  return `${withoutTrailingSlash(`/apps/${app.id}/${path.map(encodeURIComponent).join('/')}`)}${search && `?${search}`}`
}
