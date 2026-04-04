import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

type QueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null;

type QueryResult<T extends Record<string, unknown>> = {
  data: T[] | null;
  error: QueryError;
};

export type MatchRowWithOptionalEvents<T extends Record<string, unknown>> = T & {
  events: unknown[] | null;
};

function normalizeRowsWithEvents<T extends Record<string, unknown>>(rows: T[] | null): Array<MatchRowWithOptionalEvents<T>> {
  return (rows ?? []).map((row) => {
    const source = row as T & { events?: unknown };

    return {
      ...row,
      events: Array.isArray(source.events) ? source.events : null,
    };
  });
}

export async function queryMatchesWithOptionalEvents<T extends Record<string, unknown>>(
  withEventsQuery: () => PromiseLike<QueryResult<T>>,
  withoutEventsQuery: () => PromiseLike<QueryResult<Omit<T, 'events'>>>,
): Promise<QueryResult<MatchRowWithOptionalEvents<T>>> {
  const primary = await Promise.resolve(withEventsQuery());

  if (!primary.error || !isMissingColumnError(primary.error, 'events')) {
    return {
      data: normalizeRowsWithEvents(primary.data),
      error: primary.error,
    };
  }

  const fallback = await Promise.resolve(withoutEventsQuery());

  return {
    data: (fallback.data ?? []).map((row) => ({
      ...row,
      events: null,
    })) as Array<MatchRowWithOptionalEvents<T>>,
    error: fallback.error,
  };
}
