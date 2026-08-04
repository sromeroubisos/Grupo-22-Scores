'use client';

import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';

/**
 * El escudo de un club, en la única escala que usa la consola de operación.
 *
 * Regla dura: donde se nombra un club va su escudo, y NUNCA sus iniciales ni un
 * ícono genérico en su lugar. Por eso, cuando el club llega sin `logo`, no se
 * cae a un placeholder dibujado acá: se pide igual a `/api/assets/team-logo`,
 * que resuelve el escudo real por clave. Si ese club de verdad no tiene logo
 * cargado, lo que hay que arreglar es el logo del club, no esta vista.
 *
 * Los cuatro tamaños son fijos a propósito. Antes cada panel elegía el suyo
 * (20px acá, 24 allá, 38 en otro lado) y dos tablas contiguas mostraban el mismo
 * escudo distinto.
 */
export type CrestSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<CrestSize, number> = {
  sm: 18, // junto a una cifra
  md: 22, // tabla y fila de partido
  lg: 30, // llave de playoff
  xl: 44, // cabecera de partido
};

export type CrestClub = {
  id?: string | null;
  name?: string | null;
  shortName?: string | null;
  logo?: string | null;
} | null | undefined;

export function Crest({
  club,
  size = 'md',
  /**
   * `true` (por defecto) cuando el nombre del club está al lado: el escudo es
   * decorativo y va con `alt=""` para que el lector de pantalla no lea la
   * entidad dos veces. `false` cuando el escudo va solo y tiene que nombrarla.
   */
  decorative = true,
  className = '',
}: {
  club: CrestClub;
  size?: CrestSize;
  decorative?: boolean;
  className?: string;
}) {
  const px = SIZE_PX[size];
  const name = club?.name || club?.shortName || '';
  const src = club?.logo || buildTeamLogoProxyUrl({ key: club?.id, name });

  if (!src) {
    // Sin logo y sin clave no hay forma de resolver un escudo real. Se reserva
    // el espacio para que la fila no salte, pero no se inventan iniciales.
    return (
      <span
        className={`op-crest op-crest-${size} ${className}`.trim()}
        style={{ width: px, height: px }}
        aria-hidden="true"
      />
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={decorative ? '' : (name ? `Escudo de ${name}` : '')}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      className={`op-crest op-crest-${size} ${className}`.trim()}
    />
  );
}
