'use client'

import React, { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Card, Button } from '@/components/ui'
import { htxProfileUpdateSchema, type HtxProfileUpdateInput } from '@/domain/profile/schemas/htxProfileSchema'
import type { HtxProfile } from '@/domain/profile/entities/HtxProfile'
import styles from './ProfileForm.module.css'

// Normalized form values: crop_types is always string[] (never undefined) in the form.
// The schema uses .optional().default([]) for API flexibility, but UI always has []
type ProfileFormValues = Required<Pick<HtxProfileUpdateInput, 'name' | 'address' | 'crop_types'>> &
  Omit<HtxProfileUpdateInput, 'name' | 'address' | 'crop_types'>

interface ProfileFormProps {
  initialData: HtxProfile | null
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // profileData reflects latest saved state (updated from API response after save)
  const [profileData, setProfileData] = useState<HtxProfile | null>(initialData)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    // zodResolver type inference conflicts with react-hook-form strict mode — cast needed
    resolver: zodResolver(htxProfileUpdateSchema) as any,
    defaultValues: {
      name: initialData?.name ?? '',
      address: initialData?.address ?? '',
      contact_phone: initialData?.contact_phone ?? '',
      contact_email: initialData?.contact_email ?? '',
      crop_types: initialData?.crop_types ?? [],
      season_label: initialData?.season_label ?? '',
    },
  })

  const onSubmit = async (data: ProfileFormValues) => {
    try {
      setIsSubmitting(true)
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        // F6: Surface server error message when available
        const errorBody = await res.json().catch(() => null)
        const message = errorBody?.error?.message ?? 'Có lỗi xảy ra khi cập nhật thông tin'
        throw new Error(message)
      }

      // A3: Update form state from server response to reflect any server-side transforms
      const responseBody = await res.json()
      if (responseBody?.data) {
        setProfileData(responseBody.data)
        reset({
          name: responseBody.data.name ?? '',
          address: responseBody.data.address ?? '',
          contact_phone: responseBody.data.contact_phone ?? '',
          contact_email: responseBody.data.contact_email ?? '',
          crop_types: responseBody.data.crop_types ?? [],
          season_label: responseBody.data.season_label ?? '',
        })
      }

      toast.success('Cập nhật thông tin HTX thành công')
      setIsEditing(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Có lỗi xảy ra khi cập nhật thông tin'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    reset()
    setIsEditing(false)
  }

  if (!profileData) {
    return <Card><p>Không tìm thấy thông tin HTX.</p></Card>
  }

  return (
    <Card className={styles.container}>
      <div className={styles.header}>
        <h2>Hồ sơ Hợp tác xã</h2>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)}>Sửa</Button>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Tên HTX</label>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <>
                {isEditing ? (
                  <input {...field} className={styles.input} />
                ) : (
                  <div className={styles.value}>{field.value}</div>
                )}
              </>
            )}
          />
          {errors.name && <span className={styles.error}>{errors.name.message}</span>}
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Mã HTX</label>
          {/* htx_code is not editable — system-assigned identifier */}
          <div className={styles.value}>{profileData.htx_code}</div>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Địa chỉ</label>
          <Controller
            name="address"
            control={control}
            render={({ field }) => (
              <>
                {isEditing ? (
                  <input {...field} className={styles.input} />
                ) : (
                  <div className={styles.value}>{field.value}</div>
                )}
              </>
            )}
          />
          {errors.address && <span className={styles.error}>{errors.address.message}</span>}
        </div>

        <div className={styles.fieldGroup}>
          {/* A2: aria-label for phone input so getByLabel works in tests */}
          <label htmlFor="contact_phone" className={styles.label}>Số điện thoại liên hệ</label>
          <Controller
            name="contact_phone"
            control={control}
            render={({ field: { value, ...rest } }) => (
              <>
                {isEditing ? (
                  <input id="contact_phone" {...rest} value={value ?? ''} className={styles.input} />
                ) : (
                  <div className={styles.value}>{value || '-'}</div>
                )}
              </>
            )}
          />
          {/* E2: error display for contact_phone */}
          {errors.contact_phone && <span className={styles.error}>{errors.contact_phone.message}</span>}
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="contact_email" className={styles.label}>Email liên hệ</label>
          <Controller
            name="contact_email"
            control={control}
            render={({ field: { value, ...rest } }) => (
              <>
                {isEditing ? (
                  <input id="contact_email" type="email" {...rest} value={value ?? ''} className={styles.input} />
                ) : (
                  <div className={styles.value}>{value || '-'}</div>
                )}
              </>
            )}
          />
          {errors.contact_email && <span className={styles.error}>{errors.contact_email.message}</span>}
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="season_label" className={styles.label}>Vụ mùa hiện tại</label>
          <Controller
            name="season_label"
            control={control}
            render={({ field: { value, ...rest } }) => (
              <>
                {isEditing ? (
                  <input id="season_label" {...rest} value={value ?? ''} className={styles.input} />
                ) : (
                  <div className={styles.value}>{value || '-'}</div>
                )}
              </>
            )}
          />
          {/* E3: error display for season_label */}
          {errors.season_label && <span className={styles.error}>{errors.season_label.message}</span>}
        </div>

        {/* A2: crop_types editable UI — comma-separated input */}
        <div className={styles.fieldGroup}>
          <label htmlFor="crop_types" className={styles.label}>Loại cây trồng</label>
          <Controller
            name="crop_types"
            control={control}
            render={({ field: { value, onChange } }) => (
              <>
                {isEditing ? (
                  <input
                    id="crop_types"
                    className={styles.input}
                    value={(value ?? []).join(', ')}
                    onChange={(e) =>
                      onChange(
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="VD: Lúa, Xoài, Bưởi"
                  />
                ) : (
                  <div className={styles.value}>
                    {(value ?? []).length > 0 ? value!.join(', ') : '-'}
                  </div>
                )}
              </>
            )}
          />
          {errors.crop_types && <span className={styles.error}>{errors.crop_types.message}</span>}
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Tổng diện tích (ha)</label>
          {/* total_area_ha is auto-calculated, not directly editable */}
          <div className={styles.value}>{profileData.total_area_ha}</div>
        </div>

        {isEditing && (
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={isSubmitting}>Hủy</Button>
            <Button type="submit" isLoading={isSubmitting}>Lưu</Button>
          </div>
        )}
      </form>
    </Card>
  )
}
