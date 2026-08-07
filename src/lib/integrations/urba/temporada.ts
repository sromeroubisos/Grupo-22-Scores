/**
 * Cuál es la temporada en curso de URBA.
 *
 * ── Por qué no es una constante ────────────────────────────────────────────
 * Lo era: `const ANIO = 2026` en la ruta del cron. El 1 de enero de 2027 eso
 * habría dejado de ver la temporada nueva —le habría seguido pidiendo a URBA la
 * lista de 2026— y no habría fallado nada: el cron seguiría respondiendo `ok`,
 * con `torneosNuevos: []`, mientras los torneos de 2027 se acumulan sin cargar.
 * Un contador en verde con el trabajo sin hacer es el modo de falla que este
 * proyecto ya pagó dos veces.
 *
 * ── Por qué el año del CALENDARIO alcanza ──────────────────────────────────
 * Una temporada de URBA empieza y termina dentro del mismo año. Medido sobre los
 * 811 torneos cargados: la más temprana arranca el 15 de marzo y la más tardía
 * termina el 22 de noviembre. Ninguna cruza el 31 de diciembre, así que no hace
 * falta un calendario de temporadas ni una fecha de corte.
 *
 * ── Por qué en hora de Buenos Aires ────────────────────────────────────────
 * El servidor corre en UTC. Entre las 21:00 y la medianoche del 31 de diciembre,
 * hora argentina, en UTC ya es 1 de enero: sin zona, el cron cambiaría de
 * temporada tres horas antes que la unión. Es el mismo error de corrimiento de
 * día que ya se cometió una vez con `playdate`.
 */

/** La zona de la unión. La misma que `APP_TIMEZONE`, declarada acá para que el motor no dependa de la app. */
const ZONA_URBA = 'America/Argentina/Buenos_Aires';

/**
 * El año calendario en Buenos Aires.
 *
 * @param ahora para poder testearlo sin tocar el reloj del proceso.
 */
export function temporadaEnCurso(ahora: Date = new Date()): number {
  const anio = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_URBA,
    year: 'numeric',
  }).format(ahora);
  return Number(anio);
}

/** El rango de años que URBA tiene publicados. Fuera de esto no hay nada que pedir. */
export const PRIMER_ANIO_URBA = 2021;

/**
 * Interpreta el `?anio=` de la ruta del cron.
 *
 * La puerta al histórico es EXPLÍCITA a propósito: los 677 torneos de 2021-2025
 * están terminados y sus resultados no cambian más, así que sincronizarlos cada
 * 20 minutos son 677 pedidos para confirmar que nada se movió. Se los trae a
 * mano cuando URBA corrige algo viejo, y nunca por rotación automática.
 *
 * Devuelve `null` si el parámetro no sirve, para que el llamador conteste 400 en
 * vez de sincronizar en silencio un año que no era.
 */
export function parsearAnioPedido(
  valor: string | null | undefined,
  ahora: Date = new Date(),
): { anio: number; esHistorico: boolean } | null {
  const enCurso = temporadaEnCurso(ahora);
  if (valor == null || valor === '') return { anio: enCurso, esHistorico: false };

  if (!/^\d{4}$/.test(String(valor).trim())) return null;
  const anio = Number(String(valor).trim());
  // El techo es la temporada en curso, no un año fijo: pedir 2030 no es un
  // histórico, es un error de tipeo, y devolver 0 torneos lo escondería.
  if (anio < PRIMER_ANIO_URBA || anio > enCurso) return null;

  return { anio, esHistorico: anio !== enCurso };
}
