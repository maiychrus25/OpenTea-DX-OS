import { z } from 'zod'

export const partnerCreateSchema = z.object({
  name: z.string().min(1),
  partner_type: z.string().min(1),
  address: z.string().optional(),
  contact_phone: z.string().optional(),
  primary_commodities: z.array(z.string()).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export const partnerUpdateSchema = partnerCreateSchema.partial()

export type PartnerCreate = z.infer<typeof partnerCreateSchema>
export type PartnerUpdate = z.infer<typeof partnerUpdateSchema>
