/**
 * ¿La ronda que publica URBA es una instancia de playoff?
 *
 * URBA no distingue fase: todo llega en una sola lista y la instancia viaja en
 * el nombre de la ronda ("PLAYOFF", "SEMI FINAL", "FINAL"). Las fechas del
 * regular se llaman "FECHA 12" y compañía, así que el nombre alcanza.
 *
 * Una semifinal que se cargó como partido de la fase regular juega la tabla
 * con una instancia que no es de la tabla: por eso el sync tiene que mandarla
 * a la fase de playoff del torneo cuando existe.
 */
export type InstanciaDePlayoff = 'semifinal' | 'final';

export function instanciaDePlayoff(roundLabel: string | null | undefined): InstanciaDePlayoff | null {
  const etiqueta = String(roundLabel ?? '').trim().toLowerCase();
  if (/^(playoff|semi ?final)$/.test(etiqueta)) return 'semifinal';
  if (etiqueta === 'final') return 'final';
  return null;
}

export interface RondaDeFase {
  id: string;
  name: string;
  order_index: number | null;
}

/** Cómo se llama la ronda que el sync crea cuando la fase todavía no la tiene. */
export function nombreDeRonda(instancia: InstanciaDePlayoff): string {
  return instancia === 'final' ? 'Final' : 'Semifinales';
}

/**
 * La ronda de la fase de playoff a la que pertenece una instancia.
 *
 * El cuadro del torneo cruza los partidos con sus rondas por `round_uuid` en
 * cuanto la fase tiene rondas: un partido que entra a la fase sin ronda no se
 * dibuja. Se reconoce por el nombre porque es lo único que comparten las rondas
 * que armó el constructor ("Semifinal · Copa"), las importadas ("Promotion
 * semifinals", "Final por el ascenso") y las que crea el sync ("Semifinales").
 * La final arranca con "Final": "Semifinales" contiene la palabra y no cuenta.
 */
export function rondaDeInstancia<R extends RondaDeFase>(
  rondas: readonly R[],
  instancia: InstanciaDePlayoff,
): R | null {
  const coincide = instancia === 'final' ? /^final\b/i : /semi/i;
  const ordenadas = [...rondas].sort(
    (a, b) => (a.order_index ?? Number.MAX_SAFE_INTEGER) - (b.order_index ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id),
  );
  return ordenadas.find((r) => coincide.test(String(r.name ?? '').trim())) ?? null;
}
