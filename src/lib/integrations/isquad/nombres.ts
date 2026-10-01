/**
 * Identidad de iSquad (resultadosrugby.isquad.es, el sistema de resultados de
 * la Real Federación Española de Rugby) dentro del proyecto.
 *
 * iSquad numera todo y los números son estables durante la temporada:
 *
 *   campeonato  `416` DH masculina, `419` Liga Iberdrola…  → `tournaments.external_id = isquad:2627:419`
 *   grupo       `1298` "1ª FASE", `1300` "GRUPO A - 1ª FASE" → `tournament_phases.settings.isquad.grupos`
 *   partido     `17739` (el de `mostrarPrevio` / `acta.php`) → `matches.external_id = isquad:p17739`
 *   equipo      `id_equipo=2057`                            → `club_external_ids` (provider `isquad`, `equipo:2057`)
 *
 * Lo que iSquad llama "torneo" es un GRUPO de una fase: la DH B tiene cuatro
 * (A, B, C, D) y cada uno pide su página. Por eso el mapa de grupos vive en la
 * fase y no en el torneo: cuando la federación abre la 2ª fase aparecen ids
 * nuevos, y eso es una fase nueva acá, no un torneo nuevo.
 *
 * ## El equipo se resuelve por id, no por nombre
 *
 * Al revés que en la AAHBA, acá el id de equipo SÍ identifica a un equipo:
 * cada inscripción tiene el suyo (Complutense Cisneros es `188` en la DH, `2047`
 * en la DH B como "Zeta", `2049` en la DH B femenina y `267` en el M23). Y el
 * nombre no sirve: viene con el patrocinador adelante y con la Ç y la Ñ
 * convertidas en "?" ("BAR?A RUGBI", "RIALTA CRAT CORU?A.").
 */

export const ISQUAD_PROVIDER = 'isquad';
export const ISQUAD_ID_PREFIX = 'isquad:';

/** `isquad:2627:419` → temporada `2627`, campeonato `419`. */
export function parseTournamentExternalId(externalId: string): { temporada: string; campeonato: string } | null {
  const m = /^isquad:(\d{4}):(\d+)$/.exec(externalId ?? '');
  return m ? { temporada: m[1], campeonato: m[2] } : null;
}

export const buildTournamentExternalId = (temporada: string, campeonato: string | number) =>
  `${ISQUAD_ID_PREFIX}${temporada}:${campeonato}`;

export const buildMatchExternalId = (partidoId: string | number) => `${ISQUAD_ID_PREFIX}p${partidoId}`;

export const claveDeEquipo = (equipoId: string | number) => `equipo:${equipoId}`;

/**
 * Hora de pared de Madrid → instante ISO con su offset.
 *
 * Madrid tiene horario de verano, así que el offset no es fijo como el de
 * Buenos Aires: la J1 del 27/09 es +02:00 y la del 13/12 es +01:00. El offset
 * se pide a `Intl` para ESE día —nada de tablas a mano que envejecen—. Se mide
 * al mediodía UTC del día, lejos de las 2-3 de la madrugada en que cambia la
 * hora, que es donde nadie juega al rugby.
 */
export function madridAIso(fecha: string, hora: string): string | null {
  const f = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((fecha ?? '').trim());
  const h = /^(\d{1,2}):(\d{2})$/.exec((hora ?? '').trim());
  if (!f || !h) return null;
  const [, d, mes, a] = f;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  if (Number(h[1]) > 23 || Number(h[2]) > 59) return null;
  const mediodia = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d), 12));
  const nombre = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' })
    .formatToParts(mediodia)
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
  const o = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(nombre);
  if (!o) return null;
  const offset = `${o[1]}${o[2].padStart(2, '0')}:${o[3] ?? '00'}`;
  return `${a}-${mes}-${d}T${h[1].padStart(2, '0')}:${h[2]}:00${offset}`;
}
