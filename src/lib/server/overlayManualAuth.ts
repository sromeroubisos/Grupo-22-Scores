import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getOverlayAccess } from '@/lib/auth/overlayAccess';
import { canManageManual } from '@/lib/server/overlayLinksStore';

/**
 * Quién puede escribir en un overlay manual (marcador, titular, sponsors):
 *
 *   - quien tiene la CLAVE del panel (`x-overlay-key`), como siempre; o
 *   - con SESIÓN de G22, quien lo creó o tiene un enlace guardado que apunta a
 *     él, propio o compartido con él. Así un overlay compartido se maneja desde
 *     "Mis overlays" → Panel, sin pasarse la clave.
 */

export function keyMatches(key: string, hash: string) {
  const given = Buffer.from(createHash('sha256').update(key).digest('hex'));
  const stored = Buffer.from(hash);
  return given.length === stored.length && timingSafeEqual(given, stored);
}

export async function canWriteManual(
  key: string,
  row: { id: string; edit_key_hash: string; created_by: string | null },
): Promise<boolean> {
  if (key) return keyMatches(key, row.edit_key_hash);
  const access = await getOverlayAccess().catch(() => null);
  if (!access || access.status === 'signed-out') return false;
  return canManageManual(access.userId, row.id, row.created_by).catch(() => false);
}
