import { z } from 'zod'

export const SpaceNewsArticleSchema = z.object({
  title: z.string(),
  site: z.string(),
  publishedAt: z.string(),
  url: z.string(),
})

export const SpaceNewsSchema = z.object({
  articles: z.array(SpaceNewsArticleSchema),
  updatedAt: z.string(),
})

export type SpaceNewsArticle = z.infer<typeof SpaceNewsArticleSchema>
export type SpaceNews = z.infer<typeof SpaceNewsSchema>
