// deduced.json → extract/2026.json con el formato del Dos Orillas (SPEC.md),
// más `torneo` (Campeonato | Reserva) por partido, fase y tabla.
import fs from 'node:fs';

const { competencias } = JSON.parse(fs.readFileSync('deduced.json', 'utf8'));
// Día del boletín por número, para los partidos programados sin día.
const fechaBoletin = new Map(JSON.parse(fs.readFileSync('parsed.json', 'utf8')).bulletins.map((b) => [b.n, b.date]));
/** El sábado siguiente a una fecha ISO. */
const sabadoTras = (iso) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); };
const HOY = '2026-09-30';
// La última tabla publicada es la del boletín Nº 34 (22/9): lo programado después
// de esa fecha puede estar jugado, pero el resultado sale en el boletín siguiente.
const ULTIMA_TABLA = '2026-09-23';

const sinTilde = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
function claveEquipo(nombre) {
  const s = sinTilde(nombre).toLowerCase().replace(/\((gp|pp)\)/g, '').trim();
  const b = /"\s*b\s*"|\bb"|\s"b"$|"(azul|verde|negro) b"|"verde" b$|negro\s*"b"|"negro "b"/.test(s);
  const color = (s.match(/\b(verde|negro|azul|blanco|gris)\b/) || [])[1] || '';
  const club = /aguara/.test(s) ? 'AGUARA' : /cardenales/.test(s) ? 'CARDENALES' : /coipu/.test(s) ? 'COIPU'
    : /huirapuca/.test(s) ? 'HUIRAPUCA' : /jockey/.test(s) ? 'JOCKEY' : /querencia/.test(s) ? 'QUERENCIA'
    : /lince/.test(s) ? 'LINCE' : /liceo/.test(s) ? 'LICEO' : /tarcos/.test(s) ? 'TARCOS'
    : /nat(acion|\.)/.test(s) ? 'NATACION' : /san martin/.test(s) ? 'SANMARTIN'
    : /lawn|l\.\s*t/.test(s) ? 'LAWN' : /tucuman rugby|tuc\. rugby/.test(s) ? 'TRUGBY'
    : /universitario|^uni/.test(s) ? 'UNI' : null;
  return { club, color, b };
}

const NOMBRE_CLUB = {
  AGUARA: 'Aguará Guazú', CARDENALES: 'Cardenales', COIPU: 'Coipú', HUIRAPUCA: 'Huirapuca',
  JOCKEY: 'Jockey Club', QUERENCIA: 'La Querencia', LINCE: 'Lince', LICEO: 'Liceo',
  TARCOS: 'Los Tarcos', NATACION: 'Natación y Gimnasia', SANMARTIN: 'San Martín',
  LAWN: 'Lawn Tennis', TRUGBY: 'Tucumán Rugby', UNI: 'Universitario',
};
const COLOR = { verde: 'Verde', negro: 'Negro', azul: 'Azul', blanco: 'Blanco', gris: 'Gris', '': '' };

/** "TUCUMAN RUGBY "NEGRO B"" → "Tucumán Rugby Negro B". */
function alias(nombreTabla) {
  const k = claveEquipo(nombreTabla);
  if (!k.club) throw new Error(`club desconocido: ${nombreTabla}`);
  return [NOMBRE_CLUB[k.club], COLOR[k.color], k.b ? 'B' : ''].filter(Boolean).join(' ');
}

const fase = (c) => (c.torneo === 'INICIACION' ? `Iniciación · Zona ${c.grupo}`
  : c.copa ? `Anual · Copa de ${c.copa === 'ORO' ? 'Oro' : 'Plata'}` : 'Anual · Primera ronda');

const out = {
  year: 2026,
  format: 'Torneo Juvenil de la Unión de Rugby de Tucumán 2026, reconstruido de los boletines semanales: '
    + 'Torneo Iniciación (zonas A y B) y Torneo Anual (primera ronda y segunda ronda en Copa de Oro y Copa de Plata), '
    + 'cada división en Campeonato y en Reserva. Los boletines no publican resultados: cada marcador sale de la '
    + 'diferencia entre la tabla de una semana y la anterior.',
  champions: [], phases: [], matches: [], standings: [], issues: [],
};

for (const c of competencias) {
  if (!c.snapshots.length || (c.torneo === 'INICIACION' && !c.grupo)) continue;
  const torneo = c.zona === 'RESERVA' ? 'Reserva' : 'Campeonato';
  const division = c.div + (torneo === 'Reserva' ? 'R' : '');
  const phase = fase(c);
  const equipos = [...new Set(c.snapshots.flatMap((s) => s.filas.map((f) => f.equipo)))];
  out.phases.push({ division, torneo, phase, group: null, teams: equipos.map(alias) });
  const ult = c.snapshots[c.snapshots.length - 1];
  out.standings.push({
    division, torneo, phase, group: null, afterRound: null, src: `boletin-${ult.boletin}`,
    rows: ult.filas.map((f) => ({ club: alias(f.equipo), pts: f.pts, pj: f.pj, pg: f.pg, pe: f.pe, pp: f.pp, tf: f.tf, tc: f.tc, bTry: f.bTry, bTantos: f.bTantos, bDestrezas: f.bDestrezas, tryF: f.tryF, tryC: f.tryC })),
    fecha: ult.fecha, boletin: ult.boletin,
  });
  for (const p of c.partidos) {
    const round = Number((p.etapa.match(/Fecha (\d+)/) || [])[1]) || (p.etapa === 'Semifinal' ? 90 : p.etapa === 'Final' ? 99 : null);
    const base = {
      division, torneo, phase, group: null, round, roundLabel: p.etapa,
      date: p.dia || p.ventana?.fecha || sabadoTras(fechaBoletin.get(p.primerBoletin)),
      fechaEstimada: !p.dia, time: p.hora || null, venue: p.cancha || null,
      home: alias(p.local), away: alias(p.visitante), src: `boletin-${p.primerBoletin}`,
    };
    if (p.estado === 'jugado' && !p.sinMarcador) {
      if (p.wo) out.matches.push({ ...base, status: 'walkover', hs: p.hs, as: p.as, hp: p.hp ?? null, ap: p.ap ?? null, note: `GP ${p.wo}` });
      else out.matches.push({ ...base, status: 'final', hs: p.hs, as: p.as, hp: p.hp ?? null, ap: p.ap ?? null,
        htries: p.htries ?? null, atries: p.atries ?? null, note: '' });
    } else if (p.estado === 'jugado') {
      out.matches.push({ ...base, status: 'not_played', hs: null, as: null, hp: null, ap: null,
        note: `Jugado según la tabla; marcador no deducible${p.motivo ? ` (${p.motivo})` : ''}` });
      out.issues.push(`${division} ${torneo} ${phase} ${p.etapa}: ${base.home} - ${base.away} sin marcador`);
    } else {
      const futuro = base.date && base.date > ULTIMA_TABLA;
      out.matches.push({ ...base, status: futuro ? 'scheduled' : 'postponed', hs: null, as: null, hp: null, ap: null,
        note: futuro ? (base.date <= HOY ? 'Resultado pendiente del próximo boletín de la URT' : '') : 'Programado; no figura jugado en las tablas siguientes' });
    }
  }
}

fs.mkdirSync('extract', { recursive: true });
fs.writeFileSync('extract/2026.json', JSON.stringify(out, null, 1));
const cuenta = {};
for (const m of out.matches) cuenta[m.status] = (cuenta[m.status] || 0) + 1;
console.log('partidos', out.matches.length, cuenta, 'fases', out.phases.length);
console.log('alias:', [...new Set(out.phases.flatMap((f) => f.teams))].sort().join(' · '));
