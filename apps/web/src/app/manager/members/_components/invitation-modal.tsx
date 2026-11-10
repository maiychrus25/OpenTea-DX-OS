// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

'use client';

import React, { useState } from 'react';
import { X, Check } from 'lucide-react';

interface InvitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ROLE_OPTIONS = [
  { value: 'farmer', label: 'Nông dân', description: 'Ghi nhật ký canh tác, xem thửa đất, chẩn đoán bệnh' },
  { value: 'officer', label: 'Cán bộ kỹ thuật', description: 'Quản lý nông hộ, duyệt nhật ký, tạo lô hàng' },
];

export function InvitationModal({ isOpen, onClose, onSuccess }: InvitationModalProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('farmer');
  const [address, setAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const resetForm = () => {
    setFullName('');
    setPhone('');
    setPin('');
    setRole('farmer');
    setAddress('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !phone || !pin) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phone, pin, role, address }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || 'Đã có lỗi xảy ra');
      }

      setSuccessMsg(json.data?.message || 'Tạo tài khoản thành công!');

      setTimeout(() => {
        resetForm();
        onClose();
        onSuccess();
      }, 2000);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Đã có lỗi xảy ra khi tạo tài khoản.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedRole = ROLE_OPTIONS.find(r => r.value === role);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-modal-overlay)] backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={() => { if (!isSubmitting) { resetForm(); onClose(); } }}
    >
      <div
        className="bg-card rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header - Xanh chủ đạo */}
        <div className="flex justify-between items-center px-6 py-4 bg-primary text-primary-foreground">
          <h2 className="text-xl font-bold">
            Thêm thành viên mới
          </h2>
          <button
            onClick={() => { if (!isSubmitting) { resetForm(); onClose(); } }}
            className="text-primary-foreground/80 hover:text-primary-foreground transition-colors p-1 rounded-full hover:bg-primary-foreground/10"
          >
            <X size={24} />
          </button>

        </div>

        {/* Form Body - Trắng sáng */}
        <div className="overflow-y-auto p-6 bg-card">
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMsg && (
              <div className="p-3 text-sm text-danger bg-danger-subtle rounded-lg border border-danger/30">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 text-sm text-primary bg-secondary rounded-lg border border-primary/30 font-medium">
                <Check size={16} className="inline-block mr-1" /> {successMsg}
              </div>
            )}


            {/* Role */}
            <div>
              <label className="block text-sm font-semibold text-ink-secondary mb-1.5">
                Vai trò <span className="text-danger">*</span>
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                disabled={isSubmitting || !!successMsg}
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-surface-sunken transition-colors outline-none"
              >
                {ROLE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {selectedRole && (
                <p className="mt-1.5 text-xs text-ink-tertiary">{selectedRole.description}</p>
              )}
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-semibold text-ink-secondary mb-1.5">
                Họ và tên <span className="text-danger">*</span>
              </label>
              <input
                type="text" required value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="VD: Nguyễn Văn A"
                disabled={isSubmitting || !!successMsg}
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-surface-sunken transition-colors outline-none"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-semibold text-ink-secondary mb-1.5">
                Số điện thoại <span className="text-ink-tertiary font-normal">(tên đăng nhập)</span> <span className="text-danger">*</span>
              </label>
              <input
                type="tel" required value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="VD: 0912345678"
                disabled={isSubmitting || !!successMsg}
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-surface-sunken transition-colors outline-none"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-ink-secondary mb-1.5">
                Mật khẩu <span className="text-danger">*</span>
              </label>
              <input
                type="text" required minLength={6} value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Ít nhất 6 ký tự"
                disabled={isSubmitting || !!successMsg}
                className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-surface-sunken transition-colors outline-none"
              />
              <p className="mt-1.5 text-xs text-ink-tertiary">
                Thành viên dùng SĐT + mật khẩu này để đăng nhập
              </p>
            </div>

            {/* Address (farmer only) */}
            {role === 'farmer' && (
              <div>
                <label className="block text-sm font-semibold text-ink-secondary mb-1.5">
                  Địa chỉ nông hộ
                </label>
                <input
                  type="text" value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="VD: Ấp 3, Xã Long Hòa"
                  disabled={isSubmitting || !!successMsg}
                  className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-surface-sunken transition-colors outline-none"
                />
              </div>
            )}

            {/* Actions */}
            {!successMsg && (
              <div className="pt-6 mt-6 border-t border-border-subtle flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { resetForm(); onClose(); }}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-muted text-ink-secondary rounded-lg font-medium hover:bg-border transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !fullName || !phone || !pin}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {isSubmitting ? 'Đang tạo...' : `Tạo tài khoản ${selectedRole?.label || ''}`}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
