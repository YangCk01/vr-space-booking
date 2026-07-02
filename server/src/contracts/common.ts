import { z } from 'zod'

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

export const keywordSchema = z.object({
  keyword: z.string().trim().optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid(),
})

export const listQuerySchema = paginationSchema
  .merge(sortSchema)
  .merge(dateRangeSchema)
  .merge(keywordSchema)

export type PaginationInput = z.infer<typeof paginationSchema>
export type SortInput = z.infer<typeof sortSchema>
export type DateRangeInput = z.infer<typeof dateRangeSchema>
export type ListQueryInput = z.infer<typeof listQuerySchema>
