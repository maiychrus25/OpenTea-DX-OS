// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// One segment Next.js already decoded: empty, a dot segment, a separator, or a second encoding of either.
// Shared by the proxy (forwardToApp) and the shell's frame src (miniAppSrc), so both refuse the same paths.
export const UNSAFE_SEGMENT = /^\.{0,2}$|[/\\]|%(2e|2f|5c)/i
