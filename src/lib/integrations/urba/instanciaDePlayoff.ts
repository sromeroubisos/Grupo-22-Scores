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
