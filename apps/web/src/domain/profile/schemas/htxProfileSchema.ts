import { z } from 'zod'

export const htxProfileUpdateSchema = z.object({
  name: z.string().min(1, 'Tên HTX không được để trống').max(200, 'Tên HTX không được vượt quá 200 ký tự'),
  address: z.string().min(1, 'Địa chỉ không được để trống').max(500, 'Địa chỉ không được vượt quá 500 ký tự'),
  contact_phone: z.string().nullable().optional(),
  contact_email: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => !val || z.string().email().safeParse(val).success,
      'Email không hợp lệ',
    ),
  crop_types: z.array(z.string()).optional().default([]),
  season_label: z.string().nullable().optional(),
})

export type HtxProfileUpdateInput = z.infer<typeof htxProfileUpdateSchema>
