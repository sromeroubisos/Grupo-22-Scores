/**
 * La CRAA (College Rugby Association of America, craa.rugby) dentro del
 * proyecto: sus cinco divisiones y de dónde sale el fixture de cada una.
 *
 * craa.rugby es un WordPress que NO tiene el fixture: cada página de
 * "Schedule" baja por JavaScript una planilla pública de Google Sheets como CSV
 * y la dibuja (medido el 2026-10-08). Esas planillas son la fuente: una por
 * división, con una pestaña para el semestre de otoño y otra para el de
 * primavera, siempre las mismas siete columnas:
 *
 *   DATE | TIME | HOME | SCORE | AWAY | SCORE | COMPETITION
 *   "Sat, Sep 26, 2026" | "11:00 AM" | Navy | 26 | Army | 14 | RUGBY EAST
 *
 * La D1A además publica su tabla en la misma planilla (pestaña "D1A Overall").
 *
 * Pesan ~23 KB las diez juntas: el cron las baja enteras en cada corrida.
 *
 * ## Identidad
 *
 *   torneo   `craa:{division}:{temporada}`     `craa:d1a-men:2026-27`
 *   partido  `craa:{temporada}:{local}~{visitante}:{n}` con los club_id,
 *            n = la vez que ese local recibe a ese visitante en la temporada
 *   equipo   `club_external_ids` provider `craa`, `{rama}:{nombre normalizado}`
 *
 * La planilla no numera los partidos, así que la identidad es el cruce: una
 * reprogramación no lo duplica. Un mismo partido entre divisiones figura en LAS
 * DOS planillas (16 casos el 2026-10-08, con el mismo resultado): se carga una
 * vez, en el torneo de la división del local (ver `planCraa`).
 */

export const CRAA_PROVIDER = 'craa';
export const CRAA_ID_PREFIX = 'craa:';
export const CRAA_WEB = 'https://craa.rugby';

export type RamaCraa = 'masculino' | 'femenino';
export type SemestreCraa = 'otono' | 'primavera';

export interface DivisionCraa {
  id: string;
  nombre: string;
  rama: RamaCraa;
  planillas: Record<SemestreCraa, string>;
  /** CSV de la tabla oficial, si la división la publica */
  tabla?: string;
}

const GVIZ = (libro: string, hoja: string, rango?: string) =>
  `https://docs.google.com/spreadsheets/d/${libro}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(hoja)}${rango ? `&range=${rango}` : ''}`;
const PUBLICADA = (libro: string, gid: string) =>
  `https://docs.google.com/spreadsheets/d/e/${libro}/pub?gid=${gid}&single=true&output=csv`;

const LIBRO_D1A = '1MW_oamjojN8iFCLfCxSeDEFxxEQc30YxGEa15AD_6vM';
const LIBRO_D1AA = '2PACX-1vQhvadabhhUZVTfNX5hMSw-7woy537_Tn5vePvqB7-Vh9q-ymX7p3xvorLRphm2O2tHWLHIzchvefBb';
const LIBRO_D2 = '2PACX-1vQjVRp47eB9Qabr9KrzJ05yG-_nzfic9mQYNbf37VKNC3kSWNdFHnsmZDTPspyKIAge4JOp32esvQY9';
const LIBRO_D1F = '2PACX-1vQn7hjOAnDyjAk3s32ywo9ObslzV7xgxADrvFJmc9w-nMvO-L-LWykB__tcYht_OmwxAF6Otj2b1TZU';
const LIBRO_D2F = '2PACX-1vTJwpibqOM_Ctay3NJBMExsaJR4Xu9_j21jIWB8NPmINtP8f3_oaAmYT8mzQtov_xaC5_W5v3mzetRO';

/**
 * El ORDEN importa: un partido entre divisiones que figura en dos planillas y
 * cuyo local no es de ninguna de las dos queda en la primera de la lista.
 */
export const DIVISIONES: DivisionCraa[] = [
  {
    id: 'd1a-men', nombre: 'CRAA D1A', rama: 'masculino',
    planillas: { otono: GVIZ(LIBRO_D1A, 'Sheet1'), primavera: GVIZ(LIBRO_D1A, 'Sheet2') },
    tabla: GVIZ(LIBRO_D1A, 'D1A Overall', 'A4:J60'),
  },
  {
    id: 'd1aa-men', nombre: 'CRAA D1AA', rama: 'masculino',
    planillas: { otono: PUBLICADA(LIBRO_D1AA, '0'), primavera: PUBLICADA(LIBRO_D1AA, '934037742') },
  },
  {
    id: 'd2-men', nombre: 'CRAA D2', rama: 'masculino',
    planillas: { otono: PUBLICADA(LIBRO_D2, '0'), primavera: PUBLICADA(LIBRO_D2, '934037742') },
  },
  {
    id: 'd1-women', nombre: 'CRAA D1 Femenino', rama: 'femenino',
    planillas: { otono: PUBLICADA(LIBRO_D1F, '0'), primavera: PUBLICADA(LIBRO_D1F, '1108209514') },
  },
  {
    id: 'd2-women', nombre: 'CRAA D2 Femenino', rama: 'femenino',
    planillas: { otono: PUBLICADA(LIBRO_D2F, '0'), primavera: PUBLICADA(LIBRO_D2F, '934037742') },
  },
];

/** De lunes a viernes, la pasada diaria: 13 UTC = 9 del Este, antes de cualquier partido. */
export const HORA_DIARIA_UTC = 13;

/**
 * Si la llamada de esta hora del cron trabaja. Del viernes 20 UTC al lunes
 * 7 UTC —de la tarde del viernes en el Este a la noche del sábado en el
 * Pacífico— siempre; el resto de la semana, solo la pasada diaria.
 */
export function tocaCorrer(ahora: Date): boolean {
  const dia = ahora.getUTCDay();
  const hora = ahora.getUTCHours();
  if (dia === 5 && hora >= 20) return true;
  if (dia === 6 || dia === 0) return true;
  if (dia === 1 && hora < 7) return true;
  return hora === HORA_DIARIA_UTC;
}

export const buildTournamentExternalId =(division: string, temporada: string) => `${CRAA_ID_PREFIX}${division}:${temporada}`;

export function parseTournamentExternalId(externalId: string): { division: string; temporada: string } | null {
  const m = /^craa:([a-z0-9-]+):(\d{4}-\d{2})$/.exec(externalId ?? '');
  return m ? { division: m[1], temporada: m[2] } : null;
}

export const buildMatchExternalId = (temporada: string, local: string, visitante: string, n: number) =>
  `${CRAA_ID_PREFIX}${temporada}:${local}~${visitante}:${n}`;

/**
 * "Mount St. Mary's" → `mount-st-marys`. Sin tildes ni signos: la planilla
 * escribe "San Jose State" y "San José State" según quién la cargó.
 */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const claveDeEquipo = (nombre: string, rama: RamaCraa) => `${rama}:${normalizarNombre(nombre)}`;

/**
 * Nombres de la planilla que no son un equipo: los torneos de 10 de la D2
 * femenina y las llaves sin definir ("NorCal Final", "TBA"). Se saltean sin
 * contarlos como omitidos.
 */
const NO_ES_EQUIPO = [/tournament/i, /^tb[ad]$/i, /\bfinals?$/i, /\bsemifinals?$/i];
export const noEsEquipo = (nombre: string) => NO_ES_EQUIPO.some((r) => r.test(nombre.trim()));

const COMPETENCIAS: Record<string, string> = {
  'CROSSOVER': 'Cruce entre conferencias',
  'D1A CROSSOVER': 'Cruce entre conferencias',
  'D1AA CROSSOVER': 'Cruce entre conferencias',
  'CROSS-DIVISION': 'Cruce entre divisiones',
  'CROSS-DIVISON': 'Cruce entre divisiones',
  'NON-LEAGUE': 'Amistoso',
  'INDEPENDENT': 'Independientes',
  'D1A INDEPENDENT': 'Independientes',
  'NORCAL': 'NorCal',
};

/** "ROCKY MOUNTAIN" → "Rocky Mountain"; los cruces y amistosos, en castellano. */
export function nombreDeCompetencia(crudo: string): string | null {
  const limpio = (crudo ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!limpio) return null;
  if (COMPETENCIAS[limpio]) return COMPETENCIAS[limpio];
  return limpio.toLowerCase().replace(/\b([a-z])/g, (l) => l.toUpperCase()).replace(/\bOf\b/g, 'of');
}

/**
 * Hora de pared de un huso → instante ISO con su offset. El offset se le pide
 * a `Intl` para ESE instante, en dos pasadas: la primera estima con el offset
 * del mediodía y la segunda corrige si el cambio de horario cayó en el medio
 * (EE.UU. cambia la hora un domingo a las 2 y se juega también los domingos).
 */
export function horaLocalAIso(fecha: string, hora: string, zona: string): string | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
  const h = /^(\d{1,2}):(\d{2})$/.exec(hora ?? '');
  if (!f || !h) return null;
  const [a, mes, d] = [Number(f[1]), Number(f[2]), Number(f[3])];
  const [hh, mm] = [Number(h[1]), Number(h[2])];
  if (mes < 1 || mes > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;

  const offsetMin = (instante: number): number | null => {
    const nombre = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'shortOffset' })
      .formatToParts(new Date(instante)).find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (nombre === 'GMT') return 0;
    const o = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(nombre);
    if (!o) return null;
    return (o[1] === '-' ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3] ?? 0));
  };

  const pared = Date.UTC(a, mes - 1, d, hh, mm);
  let offset: number | null;
  try {
    offset = offsetMin(Date.UTC(a, mes - 1, d, 12));
    if (offset === null) return null;
    const corregido = offsetMin(pared - offset * 60_000);
    if (corregido === null) return null;
    offset = corregido;
  } catch {
    return null; // huso desconocido
  }
  const signo = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${f[1]}-${f[2]}-${f[3]}T${dos(hh)}:${dos(mm)}:00${signo}${dos(Math.floor(abs / 60))}:${dos(abs % 60)}`;
}
