import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

export const dynamic = 'force-dynamic';

type QueryError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null;

type TelegramUserRow = {
  id: string;
  telegram_user_id: string;
  telegram_phone_number: string | null;
  user_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  permissions: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string | null;
};

type OrderedTelegramUsersQuery = PromiseLike<{
  data: TelegramUserRow[] | null;
  error: QueryError;
}> & {
  order: (column: string, options?: { ascending?: boolean }) => OrderedTelegramUsersQuery;
};

type SingleTelegramUserQuery = PromiseLike<{
  data: TelegramUserRow | null;
  error: QueryError;
}>;

type TelegramUsersTable = {
  select: (columns: string) => OrderedTelegramUsersQuery;
  insert: (payload: Record<string, unknown>) => {
    select: (columns: string) => {
      single: () => SingleTelegramUserQuery;
    };
  };
  update: (payload: Record<string, unknown>) => {
    eq: (column: string, value: unknown) => {
      select: (columns: string) => {
        single: () => SingleTelegramUserQuery;
      };
    };
  };
  delete: () => {
    eq: (column: string, value: unknown) => {
      select: (columns: string) => {
        single: () => SingleTelegramUserQuery;
      };
    };
  };
};

type AuditLogTable = {
  insert: (payload: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: QueryError;
  }>;
};

const TELEGRAM_USER_COLUMNS = [
  'id',
  'telegram_user_id',
  'telegram_phone_number',
  'user_id',
  'username',
  'first_name',
  'last_name',
  'role',
  'permissions',
  'is_active',
  'created_at',
].join(', ');

function getTelegramUsersTable() {
  return createAdminClient().from('admin_telegram_users') as unknown as TelegramUsersTable;
}

function getAuditLogTable() {
  return createAdminClient().from('admin_audit_log') as unknown as AuditLogTable;
}

function jsonError(message: string, status = 500, details: unknown = null) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePhone(value: unknown) {
  return readText(value).replace(/\D+/g, '');
}

function parseTelegramUserId(value: unknown, required: boolean) {
  const text = readText(value);

  if (!text) {
    if (required) {
      throw new Error('Ingresa el Telegram user ID del usuario autorizado.');
    }
    return undefined;
  }

  if (!/^\d+$/.test(text)) {
    throw new Error('El Telegram user ID debe ser un numero entero positivo.');
  }

  return text;
}

function parseOptionalUuid(value: unknown) {
  const text = readText(value);
  if (!text) return null;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error('El user_id debe ser un UUID valido.');
  }

  return text;
}

function parsePermissions(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('permissions debe ser un objeto JSON.');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof Error && error.message === 'permissions debe ser un objeto JSON.') {
        throw error;
      }
      throw new Error('permissions debe ser JSON valido.');
    }
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new Error('permissions debe ser un objeto JSON.');
}

function normalizeDatabaseError(error: QueryError) {
  if (isMissingTableError(error, 'admin_telegram_users')) {
    return {
      message: 'Falta aplicar la migracion admin_telegram_users para configurar autorizaciones del bot de Telegram.',
      status: 503,
    };
  }

  const haystack = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  if (error?.code === '23505' || haystack.includes('duplicate') || haystack.includes('unique')) {
    return {
      message: 'Ya existe un usuario autorizado con ese telefono o Telegram user ID.',
      status: 409,
    };
  }

  if (error?.code === '23514') {
    return {
      message: 'El numero de telefono no puede estar vacio.',
      status: 400,
    };
  }

  return {
    message: error?.message || 'No se pudo guardar la autorizacion de Telegram.',
    status: 500,
  };
}

function buildTelegramUserPayload(body: Record<string, unknown>, partial = false) {
  const changes: Record<string, unknown> = {};

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'telegram_user_id')) {
    const telegramUserId = parseTelegramUserId(body.telegram_user_id, !partial);
    if (telegramUserId !== undefined) {
      changes.telegram_user_id = telegramUserId;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'telegram_phone_number')) {
    const rawPhone = readText(body.telegram_phone_number);
    const normalizedPhone = normalizePhone(rawPhone);
    changes.telegram_phone_number = normalizedPhone ? rawPhone : null;
  }

  (['username', 'first_name', 'last_name', 'role'] as const).forEach((key) => {
    if (!partial || Object.prototype.hasOwnProperty.call(body, key)) {
      changes[key] = readText(body[key]) || null;
    }
  });

  if (!partial && !changes.role) {
    changes.role = 'superadmin';
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'user_id')) {
    changes.user_id = parseOptionalUuid(body.user_id);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'permissions')) {
    changes.permissions = parsePermissions(body.permissions);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'is_active')) {
    changes.is_active = typeof body.is_active === 'boolean' ? body.is_active : true;
  }

  return changes;
}

async function writeAudit(actorUserId: string, action: string, row: Partial<TelegramUserRow> | null) {
  try {
    await getAuditLogTable().insert({
      actor_user_id: actorUserId,
      entity_type: 'system',
      entity_id: row?.id ? `admin_telegram_user:${row.id}` : 'admin_telegram_users',
      action,
      changes: {
        scope: 'telegram_bot_authorization',
        telegram_user_id: row?.telegram_user_id ?? null,
        telegram_phone_number: row?.telegram_phone_number ?? null,
        role: row?.role ?? null,
        is_active: row?.is_active ?? null,
      },
      source: 'super-admin-telegram-users',
    });
  } catch {
    // Audit should not block authorization management.
  }
}

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch {
    return jsonError('Unauthorized', 401);
  }

  const { data, error } = await getTelegramUsersTable()
    .select(TELEGRAM_USER_COLUMNS)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    const normalized = normalizeDatabaseError(error);
    return jsonError(normalized.message, normalized.status, error);
  }

  return NextResponse.json({
    ok: true,
    data: {
      users: data ?? [],
    },
  });
}

export async function POST(request: NextRequest) {
  let actorUserId = '';

  try {
    const user = await requireSuperAdmin();
    actorUserId = user.id;
  } catch {
    return jsonError('Unauthorized', 401);
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError('Payload invalido.', 400);
    }

    const payload = buildTelegramUserPayload(body as Record<string, unknown>);
    const { data, error } = await getTelegramUsersTable()
      .insert(payload)
      .select(TELEGRAM_USER_COLUMNS)
      .single();

    if (error) {
      const normalized = normalizeDatabaseError(error);
      return jsonError(normalized.message, normalized.status, error);
    }

    await writeAudit(actorUserId, 'create', data);
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'No se pudo crear la autorizacion.', 400);
  }
}

export async function PATCH(request: NextRequest) {
  let actorUserId = '';

  try {
    const user = await requireSuperAdmin();
    actorUserId = user.id;
  } catch {
    return jsonError('Unauthorized', 401);
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError('Payload invalido.', 400);
    }

    const record = body as Record<string, unknown>;
    const id = readText(record.id);
    if (!id) {
      return jsonError('Falta un ID valido de usuario autorizado.', 400);
    }

    const changes = buildTelegramUserPayload(record, true);
    if (Object.keys(changes).length === 0) {
      return jsonError('No hay cambios para guardar.', 400);
    }

    const { data, error } = await getTelegramUsersTable()
      .update(changes)
      .eq('id', id)
      .select(TELEGRAM_USER_COLUMNS)
      .single();

    if (error) {
      const normalized = normalizeDatabaseError(error);
      return jsonError(normalized.message, normalized.status, error);
    }

    await writeAudit(actorUserId, 'update', data);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'No se pudo actualizar la autorizacion.', 400);
  }
}

export async function DELETE(request: NextRequest) {
  let actorUserId = '';

  try {
    const user = await requireSuperAdmin();
    actorUserId = user.id;
  } catch {
    return jsonError('Unauthorized', 401);
  }

  const id = readText(new URL(request.url).searchParams.get('id'));
  if (!id) {
    return jsonError('Falta un ID valido de usuario autorizado.', 400);
  }

  const { data, error } = await getTelegramUsersTable()
    .delete()
    .eq('id', id)
    .select(TELEGRAM_USER_COLUMNS)
    .single();

  if (error) {
    const normalized = normalizeDatabaseError(error);
    return jsonError(normalized.message, normalized.status, error);
  }

  await writeAudit(actorUserId, 'delete', data);
  return NextResponse.json({ ok: true, data });
}
