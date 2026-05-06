import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { UserNotification } from '@/lib/notifications/types';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type SupabaseResult<T> = {
  data: T | null;
  error: PostgrestError | null;
  count?: number | null;
};

type SupabaseQuery<T> = PromiseLike<SupabaseResult<T>> & {
  select: (columns?: string, options?: { count?: 'exact'; head?: boolean }) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  is: (column: string, value: null) => SupabaseQuery<T>;
  in: (column: string, values: unknown[]) => SupabaseQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQuery<T>;
  limit: (count: number) => SupabaseQuery<T>;
  update: (values: Record<string, unknown>) => SupabaseQuery<T>;
};

type LooseSupabaseClient = {
  from: <T = unknown>(table: string) => SupabaseQuery<T>;
};

const notificationColumns = [
  'id',
  'user_id',
  'type',
  'title',
  'body',
  'entity_type',
  'entity_id',
  'match_id',
  'club_id',
  'tournament_id',
  'event_id',
  'metadata',
  'read_at',
  'created_at',
].join(', ');

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return NextResponse.json(body, { ...init, headers });
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsed)));
}

function isNotificationsSchemaMissing(error: PostgrestError | null | undefined) {
  if (!error) return false;
  const haystack = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    haystack.includes('user_notifications') ||
    haystack.includes('schema cache')
  );
}

function parseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 100);
}

async function getAuthenticatedUserOrNull(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch (error) {
    console.warn('[api/notifications] Auth lookup failed:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthenticatedUserOrNull(supabase);

  if (!user) {
    return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = supabase as unknown as LooseSupabaseClient;
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
  const unreadOnly = request.nextUrl.searchParams.get('unread') === 'true';

  let notificationsQuery = db
    .from<UserNotification[]>('user_notifications')
    .select(notificationColumns)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    notificationsQuery = notificationsQuery.is('read_at', null);
  }

  const unreadCountQuery = db
    .from<unknown>('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  const [notificationsResult, unreadCountResult] = await Promise.all([
    notificationsQuery,
    unreadCountQuery,
  ]);

  if (isNotificationsSchemaMissing(notificationsResult.error) || isNotificationsSchemaMissing(unreadCountResult.error)) {
    return jsonNoStore({
      notifications: [],
      unreadCount: 0,
      schemaReady: false,
    });
  }

  if (notificationsResult.error) {
    return jsonNoStore(
      { error: notificationsResult.error.message || 'No se pudieron cargar las notificaciones.' },
      { status: 500 },
    );
  }

  if (unreadCountResult.error) {
    return jsonNoStore(
      { error: unreadCountResult.error.message || 'No se pudo calcular el contador.' },
      { status: 500 },
    );
  }

  return jsonNoStore({
    notifications: notificationsResult.data ?? [],
    unreadCount: unreadCountResult.count ?? 0,
    schemaReady: true,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthenticatedUserOrNull(supabase);

  if (!user) {
    return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const ids = parseIds(body.ids);
  const markAll = body.all === true;
  const shouldRead = body.read !== false;

  if (!markAll && ids.length === 0) {
    return jsonNoStore(
      { error: 'Envia ids o all=true para actualizar notificaciones.' },
      { status: 400 },
    );
  }

  const db = supabase as unknown as LooseSupabaseClient;
  const readAt = shouldRead ? new Date().toISOString() : null;

  let updateQuery = db
    .from<Array<Pick<UserNotification, 'id' | 'read_at'>>>('user_notifications')
    .update({ read_at: readAt })
    .eq('user_id', user.id);

  if (markAll) {
    if (shouldRead) {
      updateQuery = updateQuery.is('read_at', null);
    }
  } else {
    updateQuery = updateQuery.in('id', ids);
  }

  const result = await updateQuery.select('id, read_at');

  if (isNotificationsSchemaMissing(result.error)) {
    return jsonNoStore({
      ok: true,
      updatedCount: 0,
      schemaReady: false,
    });
  }

  if (result.error) {
    return jsonNoStore(
      { error: result.error.message || 'No se pudieron actualizar las notificaciones.' },
      { status: 500 },
    );
  }

  return jsonNoStore({
    ok: true,
    updatedCount: result.data?.length ?? 0,
    schemaReady: true,
  });
}
