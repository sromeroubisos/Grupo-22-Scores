import { z } from "zod";

const matchLookupShape = {
  match_id: z.string().min(1).optional()
    .describe("ID exacto del partido como texto. Si se envia, tiene prioridad sobre los demas filtros."),
  tournament: z.string().min(1).optional()
    .describe("Nombre o slug del torneo."),
  category: z.string().min(1).optional()
    .describe("Categoria del partido, por ejemplo division, edad o rama."),
  home_team: z.string().min(1).optional()
    .describe("Equipo local."),
  away_team: z.string().min(1).optional()
    .describe("Equipo visitante."),
  match_date: z.string().min(1).optional()
    .describe("Fecha del partido. Preferentemente usar formato YYYY-MM-DD."),
  round: z.string().min(1).optional()
    .describe("Ronda, fecha o jornada del partido.")
};

export const searchMatchInputSchema = z.object(matchLookupShape).strict();

export const updateResultInputSchema = z.object({
  ...matchLookupShape,
  home_score: z.number().int().nonnegative()
    .describe("Puntos/goles del equipo local. Requerido."),
  away_score: z.number().int().nonnegative()
    .describe("Puntos/goles del equipo visitante. Requerido."),
  observations: z.string().min(1).optional()
    .describe("Notas visibles o internas sobre la carga del resultado."),
  corrections: z.string().min(1).optional()
    .describe("Correcciones o metadatos de ajuste en texto."),
  status: z.string().min(1).optional()
    .describe("Estado del partido, por ejemplo finished, postponed o cancelled."),
  source: z.string().min(1).optional()
    .describe("Fuente del resultado informado."),
  bonus_point: z.boolean().optional()
    .describe("Campo legacy/atajo de punto bonus, si la API lo admite."),
  bonus_target: z.enum(["home", "away", "both", "none"]).optional()
    .describe("Equipo al que aplica bonus_point."),
  home_bonus_points: z.number().int().nonnegative().optional()
    .describe("Puntos bonus explicitos para el local."),
  away_bonus_points: z.number().int().nonnegative().optional()
    .describe("Puntos bonus explicitos para el visitante.")
}).strict();

export const apiToolOutputSchema = z.object({
  ok: z.boolean(),
  endpoint: z.string(),
  http_status: z.number().int().optional(),
  api_response: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  }).optional()
}).strict();

export type SearchMatchInput = z.infer<typeof searchMatchInputSchema>;
export type UpdateResultInput = z.infer<typeof updateResultInputSchema>;
export type ApiToolOutput = z.infer<typeof apiToolOutputSchema>;
