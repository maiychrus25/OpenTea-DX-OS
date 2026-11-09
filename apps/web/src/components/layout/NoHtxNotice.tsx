// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

export function NoHtxNotice() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 gap-4 text-center">
      <h1 className="text-2xl font-bold text-[var(--danger,#dc2626)]">Tài khoản chưa được gán Hợp tác xã</h1>
      <p className="text-muted-foreground mb-4">
        Tài khoản của bạn chưa thuộc Hợp tác xã nào trong hệ thống. Vui lòng liên hệ quản trị viên để được gán.
      </p>
    </div>
  )
}
