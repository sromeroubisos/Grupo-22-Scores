// Categoría de edad de competición/jugador. Las selecciones absolutas
// ('senior') y las divisiones juveniles (U18/U19/U20) tienen rankings,
// calendarios y plantillas separados en el rugby internacional.

export type AgeCategory = 'senior' | 'u20' | 'u19' | 'u18'

export const AGE_CATEGORY_LABELS: Record<AgeCategory, string> = {
  senior: 'Absoluta',
  u20: 'Sub-20',
  u19: 'Sub-19',
  u18: 'Sub-18'
}
