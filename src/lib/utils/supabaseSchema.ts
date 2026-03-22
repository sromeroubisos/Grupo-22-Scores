type SupabaseSchemaError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null | undefined;

export function isMissingColumnError(error: SupabaseSchemaError, column: string): boolean {
  if (!error) return false;

  const haystack = `${error.message || ''} ${error.details || ''}`.toLowerCase();
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
