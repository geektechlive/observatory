import { z } from 'zod'

export const SwpcAlertSchema = z.object({
  productId: z.string(),
  issued: z.string(),
  summary: z.string(),
})

export const SwpcAlertsSchema = z.object({
  alerts: z.array(SwpcAlertSchema),
  updatedAt: z.string(),
})

export type SwpcAlert = z.infer<typeof SwpcAlertSchema>
export type SwpcAlerts = z.infer<typeof SwpcAlertsSchema>
