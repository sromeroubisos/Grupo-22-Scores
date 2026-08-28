import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * El token que ata la confirmacion al plan que se mostro.
 *
 * El alta de partido va en dos pasos: el primero resuelve nombres contra el
 * catalogo y devuelve QUE entendio; el segundo crea. Entre uno y otro el plan
 * no puede cambiar, y ahi entra este token: viaja firmado, asi que el segundo
 * paso crea exactamente lo que el primero mostro y no lo que el bot se acuerde.
 *
 * Va firmado y no guardado en una tabla a proposito: no hay nada que limpiar
 * despues, y un plan vencido no deja basura. El precio es que no se puede
 * revocar un token suelto — por eso vence en quince minutos y queda atado a la
 * key que lo pidio.
 */

const TOKEN_TTL_MS = 15 * 60_000;
const DOMAIN = 'g22:fixture-draft:v1';

export type FixtureDraftPlan = {
  tournamentId: string;
  phaseId: string;
  roundLabel: string | null;
  homeClubId: string;
  awayClubId: string;
  dateTime: string;
  venue: string;
};

type SignedEnvelope = {
  plan: FixtureDraftPlan;
  /** La key que pidio el plan. Otra key no puede confirmarlo. */
  keyId: string;
  expiresAt: number;
};

export type TokenVerification =
  | { ok: true; plan: FixtureDraftPlan; reason?: undefined }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'other_key' };

function secret() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY para firmar el plan del partido.');
  }
  return `${DOMAIN}|${key}`;
}

function sign(body: string) {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

/**
 * Compara firmas sin filtrar por timing donde dejan de coincidir. Es el unico
 * lugar del sistema de keys donde hace falta: aca SI hay una comparacion, no
 * un lookup por hash.
 */
function signatureEquals(candidate: string, expected: string) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `keyId` es null cuando el pedido entro por un secret de entorno, que no tiene
 * fila. Se firma igual, con un marcador: lo que importa es que un plan pedido
 * por una key no lo pueda confirmar otra.
 */
export function issueFixtureDraftToken(
  plan: FixtureDraftPlan,
  keyId: string | null,
  now = Date.now(),
): string {
  const envelope: SignedEnvelope = {
    plan,
    keyId: keyId ?? 'env',
    expiresAt: now + TOKEN_TTL_MS,
  };

  const body = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyFixtureDraftToken(
  token: string,
  keyId: string | null,
  now = Date.now(),
): TokenVerification {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }

  const [body, signature] = parts;

  // La firma se valida ANTES de mirar el contenido: sin esto, un plan armado a
  // mano decidiria a que torneo va el partido.
  if (!signatureEquals(signature, sign(body))) {
    return { ok: false, reason: 'bad_signature' };
  }

  let envelope: SignedEnvelope;
  try {
    envelope = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedEnvelope;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!envelope?.plan || typeof envelope.expiresAt !== 'number') {
    return { ok: false, reason: 'malformed' };
  }

  if (envelope.expiresAt <= now) {
    return { ok: false, reason: 'expired' };
  }

  if (envelope.keyId !== (keyId ?? 'env')) {
    return { ok: false, reason: 'other_key' };
  }

  return { ok: true, plan: envelope.plan };
}

export const FIXTURE_DRAFT_TTL_MS = TOKEN_TTL_MS;
