import 'server-only';
import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_MEMBERS_PER_LINK, linkExpiry, type LinkMember, type SavedLink } from '@/lib/overlay/overlayLinks';
import { getOverlayPlan } from '@/lib/server/overlayPlanStore';

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

/** Nombre para mostrar de cada usuario (nombre o, si no tiene, el mail). */
async function userNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data } = await createAdminClient().from('users').select('id, name, email').in('id', unique);
  return new Map(((data ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map((row) => [row.id, row.name?.trim() || row.email || 'Usuario de G22']));
}

/**
 * "Mis overlays": los PROPIOS (con su link para compartir y quiénes los
 * gestionan) y los COMPARTIDOS CONMIGO (con su dueño y el plan del dueño).
 */
export async function listUserLinks(userId: string): Promise<SavedLink[]> {
  const admin = createAdminClient();
  const [own, memberships] = await Promise.all([
    admin.from('overlay_links').select(`${COLUMNS}, share_token`).eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
    admin.from('overlay_link_members').select('link_id').eq('user_id', userId).limit(500),
  ]);
  if (own.error) throw new Error(own.error.message);
  const ownRows = (own.data ?? []) as Array<Row & { share_token: string | null }>;

  // Quiénes gestionan cada overlay propio.
  const ownIds = ownRows.map((row) => row.id);
  const members = ownIds.length
    ? await admin.from('overlay_link_members').select('link_id, user_id').in('link_id', ownIds)
    : { data: [] as Array<{ link_id: string; user_id: string }> };
  const memberRows = (members.data ?? []) as Array<{ link_id: string; user_id: string }>;

  // Los compartidos conmigo (si la tabla de miembros falla, la lista propia igual sale).
  const sharedIds = ((memberships.data ?? []) as Array<{ link_id: string }>).map((row) => row.link_id);
  const shared = sharedIds.length
    ? await admin.from('overlay_links').select(COLUMNS).in('id', sharedIds)
    : { data: [] as Row[] };
  const sharedRows = ((shared.data ?? []) as Row[]).filter((row) => row.user_id !== userId);

  const names = await userNames([...memberRows.map((row) => row.user_id), ...sharedRows.map((row) => row.user_id)]);
  const plans = new Map<string, Awaited<ReturnType<typeof getOverlayPlan>>>();
  await Promise.all([...new Set(sharedRows.map((row) => row.user_id))].map(async (owner) => {
    plans.set(owner, await getOverlayPlan(owner).catch(() => 'basico' as const));
  }));

  const mine: SavedLink[] = ownRows.map((row) => ({
    ...toLink(row),
    access: 'owner',
    shareToken: row.share_token,
    members: memberRows
      .filter((member) => member.link_id === row.id)
      .map((member): LinkMember => ({ userId: member.user_id, name: names.get(member.user_id) ?? 'Usuario de G22' })),
  }));
  const theirs: SavedLink[] = sharedRows
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => ({ ...toLink(row), access: 'member', ownerName: names.get(row.user_id) ?? null, ownerPlan: plans.get(row.user_id) ?? 'basico' }));
  return [...mine, ...theirs];
}

/** ¿Este usuario tiene overlays compartidos con él? (deja entrar al generador sin el rol). */
export async function hasSharedLinks(userId: string): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from('overlay_link_members')
    .select('link_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** Qué puede este usuario sobre un enlace: dueño, co-gestor o nada. */
export async function linkAccess(userId: string, id: string): Promise<'owner' | 'member' | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('overlay_links').select('user_id').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if ((data as { user_id: string }).user_id === userId) return 'owner';
  const member = await admin.from('overlay_link_members').select('link_id').eq('link_id', id).eq('user_id', userId).maybeSingle();
  return member.data ? 'member' : null;
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
  // El dueño y quienes lo gestionan por un link compartido.
  if (!(await linkAccess(userId, id))) return null;
  const { data, error } = await createAdminClient()
    .from('overlay_links')
    .update(update)
    .eq('id', id)
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

/* ─────────────── compartir ─────────────── */

/** El dueño genera (o vuelve a leer) el link para compartir. Devuelve null si no es suyo. */
export async function enableShare(userId: string, id: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('overlay_links').select('id, share_token').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const existing = (data as { share_token: string | null }).share_token;
  if (existing) return existing;
  const token = newLinkToken();
  const { error: updateError } = await admin.from('overlay_links').update({ share_token: token }).eq('id', id).eq('user_id', userId);
  if (updateError) throw new Error(updateError.message);
  return token;
}

/**
 * Corta el link para compartir: quien no entró todavía ya no puede. Los que ya
 * lo gestionan siguen (se sacan de a uno con `removeMember`).
 */
export async function disableShare(userId: string, id: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('overlay_links').update({ share_token: null }).eq('id', id).eq('user_id', userId).select('id');
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

/** El dueño saca a alguien. */
export async function removeMember(ownerId: string, id: string, memberId: string): Promise<boolean> {
  if ((await linkAccess(ownerId, id)) !== 'owner') return false;
  const { error } = await createAdminClient().from('overlay_link_members').delete().eq('link_id', id).eq('user_id', memberId);
  if (error) throw new Error(error.message);
  return true;
}

/** Un co-gestor deja de gestionarlo (el overlay sigue existiendo para el dueño). */
export async function leaveLink(userId: string, id: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('overlay_link_members').delete().eq('link_id', id).eq('user_id', userId).select('link_id');
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

export type AcceptResult =
  | { status: 'ok'; linkId: string; title: string }
  | { status: 'own'; linkId: string }
  | { status: 'invalid' }
  | { status: 'full' };

/** Quien abre el link para compartir (ya con sesión) queda como co-gestor. */
export async function acceptShare(userId: string, shareToken: string): Promise<AcceptResult> {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(shareToken)) return { status: 'invalid' };
  const admin = createAdminClient();
  const { data, error } = await admin.from('overlay_links').select('id, user_id, title').eq('share_token', shareToken).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { status: 'invalid' };
  const link = data as { id: string; user_id: string; title: string };
  if (link.user_id === userId) return { status: 'own', linkId: link.id };
  const already = await admin.from('overlay_link_members').select('link_id').eq('link_id', link.id).eq('user_id', userId).maybeSingle();
  if (already.data) return { status: 'ok', linkId: link.id, title: link.title };
  const { count } = await admin.from('overlay_link_members').select('user_id', { count: 'exact', head: true }).eq('link_id', link.id);
  if ((count ?? 0) >= MAX_MEMBERS_PER_LINK) return { status: 'full' };
  const { error: insertError } = await admin.from('overlay_link_members').insert({ link_id: link.id, user_id: userId });
  if (insertError && insertError.code !== '23505') throw new Error(insertError.message);
  return { status: 'ok', linkId: link.id, title: link.title };
}

/**
 * ¿Este usuario puede manejar el panel de un overlay manual sin la clave? Sí si
 * lo creó, o si tiene (propio o compartido) un enlace guardado que apunta a él.
 */
export async function canManageManual(userId: string, manualId: string, createdBy: string | null): Promise<boolean> {
  if (createdBy && createdBy === userId) return true;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('overlay_links')
    .select('id, user_id')
    .or(`path.eq./overlay/manual/${manualId},path.like./overlay/manual/${manualId}?*`)
    .limit(50);
  if (error || !data?.length) return false;
  const rows = data as Array<{ id: string; user_id: string }>;
  if (rows.some((row) => row.user_id === userId)) return true;
  const member = await admin.from('overlay_link_members').select('link_id').eq('user_id', userId).in('link_id', rows.map((row) => row.id)).limit(1);
  return Boolean(member.data?.length);
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
