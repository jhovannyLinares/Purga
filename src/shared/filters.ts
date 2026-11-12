import { z } from 'zod'
import { MarkActionSchema, OriginSchema } from './model'

/** Filtros combinables de la búsqueda (F-17). Todo campo vacío o null no filtra. */
export const SearchFiltersSchema = z.object({
  text: z.string().default(''),
  origins: z.array(OriginSchema).default([]),
  minDaysUnopened: z.number().int().positive().nullable().default(null),
  minDaysUnmodified: z.number().int().positive().nullable().default(null),
  actions: z.array(MarkActionSchema).default([]),
  tags: z.array(z.string()).default([]),
  tagMode: z.enum(['all', 'any']).default('any'),
  minSizeBytes: z.number().nonnegative().nullable().default(null),
  maxSizeBytes: z.number().nonnegative().nullable().default(null),
  rootIds: z.array(z.number()).default([]),
  extensions: z.array(z.string()).default([])
})
export type SearchFilters = z.infer<typeof SearchFiltersSchema>

export const EMPTY_FILTERS: SearchFilters = SearchFiltersSchema.parse({})

export const SavedSearchSchema = z.object({ searchId: z.number(), name: z.string(), filters: SearchFiltersSchema })
export type SavedSearch = z.infer<typeof SavedSearchSchema>
