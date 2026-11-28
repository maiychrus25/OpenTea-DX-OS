// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EDITABLE_ROLES, NO_ROLE_MESSAGE } from './member-types';
import styles from './member-list.module.css';

interface RolesDialogProps {
  memberId: string;
  memberName: string;
  initialRoles: string[];
  /** A manager keeps the manager role, so an empty secondary set is valid. */
  isManager: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function RolesDialog({ memberId, memberName, initialRoles, isManager, onClose, onSaved }: RolesDialogProps) {
  const [roles, setRoles] = useState<string[]>(initialRoles.filter((r) => EDITABLE_ROLES.some((o) => o.value === r)));
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const invalid = !isManager && roles.length === 0;

  const toggle = (value: string) =>
    setRoles((prev) => (prev.includes(value) ? prev.filter((r) => r !== value) : [...prev, value]));

  const save = async () => {
    setSaving(true);
    setServerError('');
    try {
      const res = await fetch(`/api/members/${memberId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Không lưu được vai. Vui lòng thử lại.');
      }
      onSaved();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Không lưu được vai. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const message = invalid ? NO_ROLE_MESSAGE : serverError;

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title={`Sửa vai: ${memberName}`} size="sm">
      <div className={styles.rolesForm}>
        <fieldset className={styles.roleChoices} disabled={saving}>
          <legend>Vai trong hợp tác xã</legend>
          {EDITABLE_ROLES.map((role) => (
            <label key={role.value}>
              <input type="checkbox" checked={roles.includes(role.value)} onChange={() => toggle(role.value)} />
              {role.label}
            </label>
          ))}
        </fieldset>
        {message && <p role="alert" className={styles.formError}>{message}</p>}
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Hủy</Button>
          <Button variant="primary" onClick={save} disabled={saving || invalid}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
        </div>
      </div>
    </Modal>
  );
}
