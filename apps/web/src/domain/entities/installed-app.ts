// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** A row of `platform.installed_apps`, as the proxy and the menu use it. */
export interface InstalledApp {
  id: string
  name: string
  version: string
  menu: { label: string; path: string; roles: ('farmer' | 'officer' | 'manager')[] }[]
  /** The manifest's `routes.public` prefixes, relative to `/apps/<id>`, such as `/public/`. */
  publicPrefixes: string[]
  /** The manifest's `feed` path (relative to `/apps/<id>`) that lists the user's sub-apps, or null. */
  feed: string | null
}
