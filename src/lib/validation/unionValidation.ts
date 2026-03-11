import { z } from 'zod';

export const unionSchema = z.object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    country: z.string().toUpperCase().optional(), // Ensures country is uppercase internally
    sport: z.string().toLowerCase().optional(), // Unifies sport safely inside zod
    union_level: z.string().toLowerCase().optional(),
    parent_union_id: z.string().optional()
});

export type UnionFormValues = z.infer<typeof unionSchema>;
