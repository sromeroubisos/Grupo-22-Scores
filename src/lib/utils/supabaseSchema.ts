type SupabaseSchemaError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null | undefined;

function buildSchemaErrorHaystack(error: SupabaseSchemaError) {
  return `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
}

export function getMissingTournamentPriorityMessage(): string {
  return "La columna 'priority' no existe en `public.tournaments` o PostgREST todavia no recargo ese cambio. Aplica la migracion de Supabase `20260327220000_repair_tournament_priority_schema.sql` y recarga el esquema.";
}

export function isMissingColumnError(error: SupabaseSchemaError, column: string): boolean {
  if (!error) return false;

  const haystack = buildSchemaErrorHaystack(error);
  const normalizedColumn = column.toLowerCase();

  if (
    haystack.includes(`column ${normalizedColumn}`) ||
    haystack.includes(`column "${normalizedColumn}"`) ||
    haystack.includes(`column '${normalizedColumn}'`) ||
    haystack.includes(`"${normalizedColumn}" column`) ||
    haystack.includes(`'${normalizedColumn}' column`) ||
    haystack.includes(`could not find the '${normalizedColumn}' column`) ||
    haystack.includes(`could not find the "${normalizedColumn}" column`) ||
    haystack.includes(`${normalizedColumn} does not exist`) ||
    haystack.includes(`${normalizedColumn} not found`) ||
    haystack.includes(`schema cache for column ${normalizedColumn}`)
  ) {
    return true;
  }

  return (
    (error.code === 'PGRST204' || error.code === '42703') &&
    (haystack.includes(normalizedColumn) || haystack.includes('column'))
  );
}

export function isMissingTableError(error: SupabaseSchemaError, table: string): boolean {
  if (!error) return false;

  const haystack = buildSchemaErrorHaystack(error);
  const normalizedTable = table.toLowerCase();

  if (
    haystack.includes(`table ${normalizedTable}`) ||
    haystack.includes(`table "${normalizedTable}"`) ||
    haystack.includes(`table '${normalizedTable}'`) ||
    haystack.includes(`relation ${normalizedTable}`) ||
    haystack.includes(`relation "${normalizedTable}"`) ||
    haystack.includes(`relation '${normalizedTable}'`) ||
    haystack.includes(`could not find the table '${normalizedTable}'`) ||
    haystack.includes(`could not find the table "${normalizedTable}"`) ||
    haystack.includes(`${normalizedTable} does not exist`) ||
    (haystack.includes('schema cache') && haystack.includes(normalizedTable))
  ) {
    return true;
  }

  return (
    (error.code === 'PGRST205' || error.code === 'PGRST200' || error.code === '42P01') &&
    (haystack.includes(normalizedTable) || haystack.includes('table') || haystack.includes('relation'))
  );
}
