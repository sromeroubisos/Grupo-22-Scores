import { createClient } from '@/lib/supabase/client';
import { normalizeText } from './normalize';

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

function inferExtension(mimeType: string) {
  return MIME_TO_EXTENSION[mimeType.toLowerCase()] || 'png';
}

function isBucketMissingError(message: string | null | undefined) {
  return typeof message === 'string' && /bucket not found/i.test(message);
}

export async function persistTournamentLogo(
  tournamentId: string,
  rawValue: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeText(rawValue);
  if (!normalized) return null;

  if (!normalized.startsWith('data:')) {
    return normalized;
  }

  const mimeType = normalized.match(/^data:([^;,]+)[;,]/i)?.[1] || 'image/png';
  const extension = inferExtension(mimeType);
  const filePath = `logos/${tournamentId}-${Date.now()}.${extension}`;

  const response = await fetch(normalized);
  if (!response.ok) {
    throw new Error('No se pudo procesar el archivo del logo.');
  }

  const blob = await response.blob();
  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from('tournaments')
    .upload(filePath, blob, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    if (isBucketMissingError(uploadError.message)) {
      return normalized;
    }

    throw new Error(`No se pudo subir el logo: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from('tournaments').getPublicUrl(filePath);
  return data.publicUrl;
}
