// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export function isPublicResourcePath(pathname: string): boolean {
  return /^\/(?:lot|htx)\/[^/]+$/.test(pathname)
}
