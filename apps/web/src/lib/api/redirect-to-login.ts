// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Browser-only: a full navigation, so the login page starts from a clean client state. */
export function redirectToLogin(): void {
  window.location.assign('/login')
}
