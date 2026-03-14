const IMPORT_SCHEMA_TABLES = [
  'import_jobs',
  'import_files',
  'import_rows',
  'import_match_previews',
  'club_aliases',
  'competition_aliases',
  'venue_aliases',
  'import_logs',
];

export const FIXTURE_IMPORT_SCHEMA_MESSAGE = 'El sistema de importación todavía no fue inicializado en la base de datos.';

function extractErrorData(error: unknown) {
  if (!error || typeof error !== 'object') {
    return {
      code: '',
      message: typeof error === 'string' ? error : '',
    };
  }

  const code = 'code' in error ? String((error as { code?: string }).code || '') : '';
  const message = 'message' in error ? String((error as { message?: string }).message || '') : '';

  return { code, message };
}

export function isMissingRelationError(error: unknown): boolean {
  const { code, message } = extractErrorData(error);
  return (
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('Could not find')
  );
}

export function isFixtureImportSchemaError(error: unknown): boolean {
  const { message } = extractErrorData(error);
  if (message.includes(FIXTURE_IMPORT_SCHEMA_MESSAGE)) {
    return true;
  }

  if (!isMissingRelationError(error)) {
    return false;
  }

  const normalizedMessage = message.toLowerCase();
  return IMPORT_SCHEMA_TABLES.some((tableName) => normalizedMessage.includes(tableName));
}
