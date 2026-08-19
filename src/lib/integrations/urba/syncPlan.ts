import type { MatchRow } from './planMatches.ts';

/**
 * Qué se le permite tocar al cron de sincronización, y qué no.
 *
 * La lista blanca no es una precaución genérica: `matches` tiene columnas que un
 * humano edita a mano y que URBA no conoce. Si el cron escribiera la fila entera
 * —como hizo la carga inicial, que era un INSERT— borraría el trabajo de la
 * gente en cada pasada.
 */
export const CAMPOS_SINCRONIZABLES = [
  'date_time',
  'status',
  'score',
  'round_label',
  'home_base_points',
  'away_base_points',
  'home_bonus_points',
  'away_bonus_points',
  'points_autocalculated',
] as const;

export type CampoSincronizable = (typeof CAMPOS_SINCRONIZABLES)[number];

/**
 * Lo que el cron NO toca nunca, con el motivo. Está declarado —y testeado— para
 * que agregar una columna a `MatchRow` obligue a decidir de qué lado cae.
 *
 *  · `venue`      URBA no publica sede. La fila del conector lleva `null`, y
 *                 escribirlo borraría la cancha que cargó una persona.
 *  · `is_visible` la publicación la decide un humano, no el proveedor.
 *  · `phase_id`   se asigna una vez, al crear. Reasignarlo mueve el partido de
 *                 tabla de posiciones.
 *  · `tournament_id`, `home_club_id`, `away_club_id`  la identidad del partido.
 *                 Si cambian, no es el mismo partido: es uno nuevo.
 *  · `external_id` la identidad ante URBA.
 */
export const CAMPOS_INTOCABLES = [
  'venue',
  'is_visible',
  'phase_id',
  'tournament_id',
  'home_club_id',
  'away_club_id',
  'external_id',
] as const;

export interface PatchDeSync {
  external_id: string;
  patch: Partial<Record<CampoSincronizable, unknown>>;
  cambios: CampoSincronizable[];
  /** true si el partido pasa a 'final' en esta pasada */
  seFinaliza: boolean;
}

/**
 * Traduce el `actualizar` del conector a un PATCH acotado a la lista blanca.
 *
 * Devuelve `null` cuando no queda nada que escribir: un partido cuyo único
 * "cambio" cae fuera de la lista no se toca, y sobre todo no se le mueve el
 * `updated_at` — que es lo que dispara el trigger de notificaciones.
 */
export function construirPatch(
  entrada: { fila: MatchRow; cambios: string[] },
  statusActual: string | null | undefined,
): PatchDeSync | null {
  const permitidos = new Set<string>(CAMPOS_SINCRONIZABLES);
  const cambios = entrada.cambios.filter((c): c is CampoSincronizable => permitidos.has(c));
  if (cambios.length === 0) return null;

  const patch: Partial<Record<CampoSincronizable, unknown>> = {};
  for (const campo of cambios) patch[campo] = entrada.fila[campo as keyof MatchRow];

  const eraFinal = String(statusActual ?? '').toLowerCase() === 'final';
  return {
    external_id: entrada.fila.external_id,
    patch,
    cambios,
    seFinaliza: !eraFinal && entrada.fila.status === 'final',
  };
}

/**
 * Desde qué torneo arranca esta corrida.
 *
 * No hay cursor persistido: el punto de partida sale del reloj. Cada ventana de
 * 20 minutos —el intervalo con el que está declarada la jornada— corre el
 * arranque `paso` lugares, y la lista se devuelve ENTERA a partir de ahí. Quién
 * corta es el presupuesto de tiempo del llamador, no esta función.
 *
 * Antes cortaba acá, con el mismo número que usaba de paso: devolvía 50 torneos
 * y avanzaba de a 50. Mientras una corrida alcanzaba a leer los 50 daba igual;
 * cuando el recálculo de posiciones entró al presupuesto, una corrida pasó a
 * leer once. Con 55 candidatos el arranque sólo alternaba entre el 0 y el 50, o
 * sea que los del medio —el 12 al 49— no encabezaban una tanda nunca y nadie los
 * leía. La corrida seguía respondiendo `ok`.
 *
 * El paso tiene que parecerse a lo que una corrida alcanza a hacer de verdad, no
 * a lo que le gustaría: si se queda corto sólo se repite trabajo barato (un
 * torneo sin cambios es un pedido y dos lecturas), y si se pasa, quedan torneos
 * sin visitar por una vuelta entera.
 */
export function rotarPorReloj<T>(items: T[], paso: number, ahoraMs: number): T[] {
  if (items.length === 0 || paso <= 0) return items;
  const ventana = Math.floor(ahoraMs / (20 * 60 * 1000));
  const desde = (((ventana * paso) % items.length) + items.length) % items.length;
  return [...items.slice(desde), ...items.slice(0, desde)];
}

/**
 * En cuántas partes se corta el barrido, y cuál le toca hoy.
 *
 * El barrido completo de una temporada son ~116 s y el techo de la función son
 * 60: hay que partirlo. Qué parte toca sale del DÍA, y ese detalle es todo el
 * asunto.
 *
 * Antes salía de la HORA (`floor(ahora / 1 h) % 3`), y el barrido corre una sola
 * vez por día, siempre a la misma hora UTC. Entre dos corridas consecutivas pasan
 * 24 horas exactas, y 24 es múltiplo de 3: la cuenta daba SIEMPRE el mismo resto.
 * Comprobado sobre diez días seguidos del `schedule` real (`0 9 * * *`), las diez
 * corridas cayeron en la parte 0 — dos tercios de los torneos no se barrían
 * nunca, y la respuesta seguía en verde porque los que sí se barrían no tenían
 * nada que traer.
 *
 * Eso no era un barrido lento: era una cola de correcciones que no llegaba. El
 * 24% de los partidos de URBA se corrige después de las 24 h, y ésa es justo la
 * parte que el barrido existe para levantar; la ventana de jornada no la ve
 * porque para entonces el partido ya no juega "hoy ni ayer".
 *
 * La cuenta es `(día + hora) % partes`, las dos en UTC igual que el `schedule` de
 * Vercel, y cada sumando resuelve un problema distinto:
 *
 *  · el DÍA hace que un barrido diario rote — es el arreglo del bug de arriba;
 *  · la HORA hace que VARIOS barridos del mismo día caigan en partes distintas.
 *    Con las tres entradas declaradas a las 09, 10 y 11 UTC, un día cualquiera
 *    toca `(d+9)%3`, `(d+1+9)%3` y `(d+2+9)%3`: las tres partes, todos los días.
 *    O sea que el catálogo entero se barre a diario y la cola de correcciones no
 *    espera tres días —que es lo que tardaba el ciclo— para que le llegue el
 *    turno a un torneo.
 *
 * Las dos propiedades se sostienen juntas: sacando dos de las tres entradas, el
 * barrido sigue rotando de a una parte por día en vez de quedarse clavado.
 */
export const PARTES_DEL_BARRIDO = 3;

export function parteDelBarrido(ahoraMs: number, partes = PARTES_DEL_BARRIDO): number {
  const dia = Math.floor(ahoraMs / 86_400_000);
  const hora = Math.floor(ahoraMs / 3_600_000) % 24;
  return (((dia + hora) % partes) + partes) % partes;
}
