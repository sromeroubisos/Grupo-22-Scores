import 'server-only';
import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { linkExpiry, type SavedLink } from '@/lib/overlay/overlayLinks';

/**
 * Lectura y escritura de `overlay_links` (enlaces guardados, "Mis overlays").
 * Solo el servidor, con service_role: la tabla no tiene políticas de RLS.
 */

type Row = {
  id: string;
  token: string;
  user_id: string;
  title: string;
  kind: string;
  path: string;
  created_at: string;
  renewed_at: string;
  expires_at: string;
};

const COLUMNS = 'id, token, user_id, title, kind, path, created_at, renewed_at, expires_at';

const toLink = (row: Row): SavedLink => ({
  id: row.id,
  token: row.token,
  title: row.title,
  kind: row.kind,
  path: row.path,
  createdAt: row.created_at,
  renewedAt: row.renewed_at,
  expiresAt: row.expires_at,
});

export const newLinkToken = () => randomBytes(16).toString('base64url');

export async function listUserLinks(userId: string): Promise<SavedLink[]> {
  const { data, error } = await createAdminClient()
    .from('overlay_links')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toLink);
}

export async function countUserLinks(userId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from('overlay_links')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function insertUserLink(userId: string, link: { title: string; kind: string; path: string }): Promise<SavedLink> {
  const now = Date.now();
  const { data, error } = await createAdminClient()
    .from('overlay_links')
    .insert({
      user_id: userId,
      token: newLinkToken(),
      title: link.title,
      kind: link.kind,
      path: link.path,
      created_at: new Date(now).toISOString(),
      renewed_at: new Date(now).toISOString(),
      expires_at: linkExpiry(now),
    })
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'insert vacío');
  return toLink(data as Row);
}

/**
 * Cambios del dueño: renovar (otros 15 días desde HOY, mismo token), renombrar
 * y/o EDITAR (otra ruta con el mismo token: la URL de OBS no cambia y la página
 * al aire se pasa sola a la configuración nueva).
 */
export async function updateUserLink(userId: string, id: string, patch: { renew?: boolean; title?: string; path?: string; kind?: string }): Promise<SavedLink | null> {
  const now = Date.now();
  const update: Record<string, string> = {};
  if (patch.renew) {
    update.renewed_at = new Date(now).toISOString();
    update.expires_at = linkExpiry(now);
  }
  if (patch.title) update.title = patch.title;
  if (patch.path) update.path = patch.path;
  if (patch.kind) update.kind = patch.kind;
  if (!Object.keys(update).length) return null;
  const { data, error } = await createAdminClient()
    .from('overlay_links')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toLink(data as Row) : null;
}

export async function deleteUserLink(userId: string, id: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('overlay_links')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

/** El enlace de un token y su dueño, sin importar de quién es (lo usa la página al aire). */
export async function findLinkByToken(token: string): Promise<(SavedLink & { userId: string }) | null> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  const { data, error } = await createAdminClient()
    .from('overlay_links')
    .select(COLUMNS)
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...toLink(data as Row), userId: (data as Row).user_id } : null;
}

/** El enlace que más dura de los que apuntan a un overlay manual (su panel lo muestra con el aviso de vencimiento). */
export async function latestLinkForManual(id: string): Promise<SavedLink | null> {
  const { data, error } = await createAdminClient()
    .from('overlay_links')
    .select(COLUMNS)
    .or(`path.eq./overlay/manual/${id},path.like./overlay/manual/${id}?*`)
    .order('expires_at', { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return toLink(data[0] as Row);
}
