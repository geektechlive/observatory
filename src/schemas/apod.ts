import { z } from 'zod'

export const ApodSchema = z.object({
  date: z.string(),
  title: z.string(),
  explanation: z.string(),
  url: z.url(),
  hdurl: z.url().optional(),
  media_type: z.enum(['image', 'video', 'other']),
  service_version: z.string(),
  copyright: z.string().optional(),
})

export type Apod = z.infer<typeof ApodSchema>
