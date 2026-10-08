import test from 'node:test';
import assert from 'node:assert/strict';

import { leerCsv, leerFecha, leerHora, parseFixture, parseTabla, type FilaCraa } from './parse.ts';
import {
  claveDeEquipo, horaLocalAIso, nombreDeCompetencia, noEsEquipo, normalizarNombre, parseTournamentExternalId, tocaCorrer,
} from './fuentes.ts';
import {
  NOTA_SIN_HORARIO, NOTA_SIN_RESULTADO, PREFIJO_NOTA, planCraa, semanaDe, type DestinoCraa, type ExistenteCraa, type PestanaCraa,
} from './planMatches.ts';

const AHORA = new Date('2026-10-08T12:00:00Z');

// ── CSV con la forma real de las dos exportaciones ───────────────────────────

/** gviz (D1A): todo entre comillas y U+202F antes de AM/PM. */
const GVIZ = [
  '"DATE ","TIME","HOME","SCORE","AWAY","SCORE","COMPETITION"',
  '"Sat, Sep 26, 2026","11:00 AM","Navy","26","Army","14","RUGBY EAST"',
  '"Sat, Oct 10, 2026","","Illinois","","Michigan State","","BIG TEN"',
  '"Fri, Oct 16, 2026","7:00 PM","Ohio State","","Indiana","","BIG TEN"',
].join('\n');

/** pub?output=csv (las demás): comillas solo en la fecha. */
const PUB = [
  'DATE ,TIME,HOME,SCORE,AWAY,SCORE,COMPETITION',
  '"Sat, Sep 5, 2026",TBA,Trine,19,Indiana II,12,INDEPENDENT',
  '"Sat, Nov 14, 2026",TBA,Cal Poly Maritime 10\'s Tournament,,,,WEST COAST',
  '"Sat, Mar 6, 2027",TBA,NorCal Semifinal,,,,NORCAL',
  '"Sat, Oct 3, 2026",1:00 PM,Life,W,Mary Washington,FF,RUGBY EAST',
].join('\r\n');

test('leerCsv: comillas, comas adentro y comillas escapadas', () => {
  assert.deepEqual(leerCsv('a,"b, c","d ""e"""\n1,2,3\n\n'), [['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
});

test('leerFecha y leerHora: las formas de la planilla', () => {
  assert.equal(leerFecha('Sat, Sep 26, 2026'), '2026-09-26');
  assert.equal(leerFecha('Sun, Nov 1, 2026'), '2026-11-01');
  assert.equal(leerFecha('9/5/2026'), '2026-09-05');
  assert.equal(leerFecha('cualquier cosa'), null);
  assert.equal(leerHora('11:00 AM'), '11:00');
  assert.equal(leerHora('7:30 PM'), '19:30');
  assert.equal(leerHora('12:00 PM'), '12:00');
  assert.equal(leerHora('12 AM'), '00:00');
  assert.equal(leerHora('TBA'), null);
  assert.equal(leerHora(''), null);
});

test('parseFixture: las dos exportaciones dan las mismas columnas', () => {
  const d1a = parseFixture(GVIZ) as FilaCraa[];
  assert.equal(d1a.length, 3);
  const { texto: _t, ...primera } = d1a[0];
  assert.deepEqual(primera, {
    fecha: '2026-09-26', hora: '11:00', local: 'Navy', visitante: 'Army', puntosLocal: 26, puntosVisitante: 14,
    marcadorRaro: false, competencia: 'RUGBY EAST',
  });
  assert.equal(d1a[1].hora, null);
  assert.equal(d1a[1].puntosLocal, null);

  const d1aa = parseFixture(PUB) as FilaCraa[];
  assert.equal(d1aa.length, 4);
  assert.equal(d1aa[0].visitante, 'Indiana II');
  assert.equal(d1aa[0].puntosVisitante, 12);
  // Un tanteo que no es un número: sin resultado y marcado.
  assert.equal(d1aa[3].marcadorRaro, true);
  assert.equal(d1aa[3].puntosLocal, null);
});

test('parseFixture: otra cabecera no es "sin partidos"', () => {
  assert.equal(parseFixture('<!DOCTYPE html><html>login</html>'), null);
  assert.equal(parseFixture(''), null);
});

test('parseTabla: la tabla general de la D1A', () => {
  const csv = [
    '"","School","MP","Win","Loss","Tie","For","Against","Differential","Winning %"',
    '"1","Navy","5","5","0","0","278","28","250","1.000"',
    '"8","Army","5","4","1","0","245","84","161","0.800"',
  ].join('\n');
  assert.deepEqual(parseTabla(csv), [
    { posicion: 1, nombre: 'Navy', pj: 5, pg: 5, pp: 0, pe: 0, pf: 278, pc: 28 },
    { posicion: 8, nombre: 'Army', pj: 5, pg: 4, pp: 1, pe: 0, pf: 245, pc: 84 },
  ]);
  assert.equal(parseTabla('"","Equipo","PJ"\n"1","Navy","5"'), null);
});

test('horaLocalAIso: el huso del campus, con el cambio de horario de EE.UU.', () => {
  // Horario de verano del Este hasta el domingo 1/11/2026 a las 2.
  assert.equal(horaLocalAIso('2026-09-26', '11:00', 'America/New_York'), '2026-09-26T11:00:00-04:00');
  assert.equal(horaLocalAIso('2026-10-31', '13:00', 'America/New_York'), '2026-10-31T13:00:00-04:00');
  // El MISMO domingo del cambio, de tarde, ya es -05:00.
  assert.equal(horaLocalAIso('2026-11-01', '15:00', 'America/New_York'), '2026-11-01T15:00:00-05:00');
  assert.equal(horaLocalAIso('2026-11-07', '13:00', 'America/Los_Angeles'), '2026-11-07T13:00:00-08:00');
  // Arizona no cambia la hora.
  assert.equal(horaLocalAIso('2026-09-26', '18:00', 'America/Phoenix'), '2026-09-26T18:00:00-07:00');
  assert.equal(horaLocalAIso('2027-01-23', '18:00', 'America/Phoenix'), '2027-01-23T18:00:00-07:00');
  assert.equal(horaLocalAIso('2026-09-26', '11:00', 'Huso/Inexistente'), null);
  assert.equal(horaLocalAIso('2026-13-01', '11:00', 'America/New_York'), null);
});

test('nombres: alias normalizados, competencias en castellano y filas que no son equipos', () => {
  assert.equal(normalizarNombre("Mount St. Mary's"), 'mount-st-marys');
  assert.equal(normalizarNombre('San José State'), normalizarNombre('San Jose State'));
  assert.equal(normalizarNombre('Texas A&M'), 'texas-a-and-m');
  assert.equal(claveDeEquipo('Cal', 'femenino'), 'femenino:cal');
  assert.equal(nombreDeCompetencia('ROCKY MOUNTAIN'), 'Rocky Mountain');
  assert.equal(nombreDeCompetencia('HEART OF AMERICA'), 'Heart of America');
  assert.equal(nombreDeCompetencia('CROSS-DIVISON'), 'Cruce entre divisiones');
  assert.equal(nombreDeCompetencia('NON-LEAGUE'), 'Amistoso');
  assert.equal(nombreDeCompetencia(''), null);
  assert.ok(noEsEquipo("Cal Poly Maritime 10's Tournament"));
  assert.ok(noEsEquipo('NorCal Final'));
  assert.ok(noEsEquipo('Heart of America Finals'));
  assert.ok(noEsEquipo('TBA'));
  assert.ok(!noEsEquipo('Navy'));
  assert.deepEqual(parseTournamentExternalId('craa:d1a-men:2026-27'), { division: 'd1a-men', temporada: '2026-27' });
  assert.equal(parseTournamentExternalId('sporti:3542'), null);
});

test('tocaCorrer: los findes cada hora, en la semana una vez por día', () => {
  assert.equal(tocaCorrer(new Date('2026-10-09T19:13:00Z')), false); // viernes 15 del Este
  assert.equal(tocaCorrer(new Date('2026-10-09T20:13:00Z')), true);
  assert.equal(tocaCorrer(new Date('2026-10-10T03:13:00Z')), true); // sábado
  assert.equal(tocaCorrer(new Date('2026-10-12T05:13:00Z')), true); // lunes 5 UTC = domingo a la noche en el Pacífico
  assert.equal(tocaCorrer(new Date('2026-10-12T08:13:00Z')), false);
  assert.equal(tocaCorrer(new Date('2026-10-14T13:13:00Z')), true); // miércoles, la diaria
  assert.equal(tocaCorrer(new Date('2026-10-14T14:13:00Z')), false);
});

test('semanaDe: de lunes a domingo', () => {
  assert.deepEqual(semanaDe('2026-09-26'), { desde: '2026-09-21', hasta: '2026-09-27' });
  assert.deepEqual(semanaDe('2026-09-21'), { desde: '2026-09-21', hasta: '2026-09-27' });
  assert.deepEqual(semanaDe('2026-09-27'), { desde: '2026-09-21', hasta: '2026-09-27' });
});

// ── El plan ──────────────────────────────────────────────────────────────────

const fila = (o: Partial<FilaCraa> & Pick<FilaCraa, 'local' | 'visitante'>): FilaCraa => ({
  fecha: '2026-09-26', hora: '11:00', puntosLocal: null, puntosVisitante: null, marcadorRaro: false,
  competencia: 'RUGBY EAST', texto: `${o.local} vs ${o.visitante}`, ...o,
});

const CLUBES: Record<string, string> = {
  'masculino:navy': 'us-navy', 'masculino:army': 'us-army', 'masculino:life': 'us-life',
  'masculino:millennia-atlantic': 'us-millennia-atlantic', 'masculino:arkansas-state': 'us-arkansas-state',
  'masculino:loyola-new-orleans': 'us-loyola-new-orleans', 'masculino:st-bonaventure': 'us-st-bonaventure',
  'masculino:cal': 'us-cal', 'masculino:california': 'us-cal', 'masculino:stanford': 'us-stanford',
};
const ZONAS: Record<string, string> = { 'us-navy': 'America/New_York', 'us-cal': 'America/Los_Angeles', 'us-millennia-atlantic': 'America/New_York' };
const DESTINOS: Record<string, DestinoCraa> = {
  'd1a-men': { tournamentId: 't-d1a', phaseId: 'f-d1a', seasonId: 's-d1a' },
  'd1aa-men': { tournamentId: 't-d1aa', phaseId: 'f-d1aa', seasonId: 's-d1aa' },
};
const INTEGRANTES = new Map([
  ['d1a-men', new Set(['us-navy', 'us-army', 'us-life', 'us-arkansas-state', 'us-cal'])],
  ['d1aa-men', new Set(['us-millennia-atlantic', 'us-loyola-new-orleans', 'us-stanford'])],
]);

const planDe = (pestanas: PestanaCraa[], existentes: ExistenteCraa[] = []) => planCraa({
  pestanas,
  temporada: '2026-27',
  resolverEquipo: (nombre, rama) => CLUBES[claveDeEquipo(nombre, rama)] ?? null,
  zonaDe: (club) => ZONAS[club] ?? null,
  integrantes: INTEGRANTES,
  destinoDe: (division) => DESTINOS[division] ?? null,
  rondaDe: (division, fecha) => (fecha === '2026-09-26' ? { id: `r-${division}-4`, nombre: 'Fecha 4' } : null),
  existentes,
  ahora: AHORA,
});

const existente = (o: Partial<ExistenteCraa> & Pick<ExistenteCraa, 'id' | 'external_id'>): ExistenteCraa => ({
  tournament_id: 't-d1a', season_id: 's-d1a', phase_id: 'f-d1a', home_club_id: 'us-navy', away_club_id: 'us-army',
  date_time: '2026-09-26T11:00:00-04:00', status: 'final', score: { home: 26, away: 14 }, round_uuid: 'r-d1a-men-4',
  round_label: 'Fecha 4', notes: `${PREFIJO_NOTA}Rugby East`, home_base_points: 2, away_base_points: 0,
  home_bonus_points: 0, away_bonus_points: 0, ...o,
});

test('plan: un partido jugado se crea final, con 2/0, la hora del local y la ronda de su semana', () => {
  const plan = planDe([{ division: 'd1a-men', rama: 'masculino', filas: [fila({ local: 'Navy', visitante: 'Army', puntosLocal: 26, puntosVisitante: 14 })] }]);
  assert.equal(plan.crear.length, 1);
  assert.deepEqual(plan.crear[0], {
    external_id: 'craa:2026-27:us-navy~us-army:1', tournament_id: 't-d1a', season_id: 's-d1a', phase_id: 'f-d1a',
    home_club_id: 'us-navy', away_club_id: 'us-army', date_time: '2026-09-26T11:00:00-04:00', status: 'final',
    score: { home: 26, away: 14 }, round_uuid: 'r-d1a-men-4', round_label: 'Fecha 4', notes: `${PREFIJO_NOTA}Rugby East`,
    points_autocalculated: false, home_base_points: 2, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
  });
});

test('plan: sin horario va a la 1 de la tarde del lugar y lo dice la nota; sin tanteo y viejo, NO es postergado', () => {
  const plan = planDe([{ division: 'd1a-men', rama: 'masculino', filas: [
    fila({ local: 'Cal', visitante: 'Stanford', fecha: '2026-11-07', hora: null, competencia: 'D1A CROSSOVER' }),
    fila({ local: 'Navy', visitante: 'Life', fecha: '2026-10-03' }),
    fila({ local: 'Army', visitante: 'Life', fecha: '2026-10-06' }),
  ] }]);
  const de = (local: string) => plan.crear.find((c) => c.home_club_id === local)!;
  assert.equal(de('us-cal').date_time, '2026-11-07T13:00:00-08:00');
  assert.equal(de('us-cal').notes, `${PREFIJO_NOTA}Cruce entre conferencias · ${NOTA_SIN_HORARIO}`);
  assert.equal(de('us-cal').status, 'scheduled');
  // 5 días sin resultado: se jugó y la CRAA no lo cargó; "Postergado" sería falso.
  assert.equal(de('us-navy').status, 'scheduled');
  assert.equal(de('us-navy').notes, `${PREFIJO_NOTA}Rugby East · ${NOTA_SIN_RESULTADO}`);
  // 2 días: la CRAA todavía está a tiempo.
  assert.equal(de('us-army').status, 'scheduled');
  assert.equal(de('us-army').notes, `${PREFIJO_NOTA}Rugby East`);
  assert.equal(de('us-army').date_time, '2026-10-06T11:00:00-04:00'); // sin huso conocido: el del Este
});

test('plan: la hora que solo trae la otra planilla se usa igual', () => {
  const plan = planDe([
    { division: 'd1a-men', rama: 'masculino', filas: [fila({ local: 'Millennia Atlantic', visitante: 'Life', hora: '14:00' })] },
    { division: 'd1aa-men', rama: 'masculino', filas: [fila({ local: 'Millennia Atlantic', visitante: 'Life', hora: null })] },
  ]);
  assert.equal(plan.crear[0].tournament_id, 't-d1aa');
  assert.equal(plan.crear[0].date_time, '2026-09-26T14:00:00-04:00');
  assert.equal(plan.crear[0].notes.includes(NOTA_SIN_HORARIO), false);
});

test('plan: un cruce entre divisiones que figura en las dos planillas es UN partido, en la división del local', () => {
  const filaCruce = fila({ local: 'Millennia Atlantic', visitante: 'Life', puntosLocal: 35, puntosVisitante: 33, competencia: 'CROSS-DIVISION' });
  const plan = planDe([
    { division: 'd1a-men', rama: 'masculino', filas: [filaCruce] },
    { division: 'd1aa-men', rama: 'masculino', filas: [filaCruce] },
  ]);
  assert.equal(plan.crear.length, 1);
  assert.equal(plan.repetidosEntreDivisiones, 1);
  assert.equal(plan.crear[0].tournament_id, 't-d1aa'); // Millennia es de la D1AA aunque la D1A va primero
  assert.equal(plan.discrepancias.length, 0);
});

test('plan: si el local no es de ninguna, va a la del visitante; si las planillas no coinciden, manda el dueño y se avisa', () => {
  const plan = planDe([
    { division: 'd1a-men', rama: 'masculino', filas: [fila({ local: 'St. Bonaventure', visitante: 'Navy', puntosLocal: 0, puntosVisitante: 50 })] },
    { division: 'd1aa-men', rama: 'masculino', filas: [fila({ local: 'St. Bonaventure', visitante: 'Navy', puntosLocal: 0, puntosVisitante: 55 })] },
  ]);
  assert.equal(plan.crear.length, 1);
  assert.equal(plan.crear[0].tournament_id, 't-d1a');
  assert.deepEqual(plan.crear[0].score, { home: 0, away: 50 });
  assert.equal(plan.discrepancias.length, 1);
});

test('plan: el resultado que solo trae la otra planilla se usa igual', () => {
  const plan = planDe([
    { division: 'd1a-men', rama: 'masculino', filas: [fila({ local: 'Arkansas State', visitante: 'Loyola New Orleans' })] },
    { division: 'd1aa-men', rama: 'masculino', filas: [fila({ local: 'Arkansas State', visitante: 'Loyola New Orleans', puntosLocal: 48, puntosVisitante: 10 })] },
  ]);
  assert.equal(plan.crear[0].tournament_id, 't-d1a');
  assert.deepEqual(plan.crear[0].score, { home: 48, away: 10 });
  assert.equal(plan.crear[0].status, 'final');
});

test('plan: la identidad es el cruce, no la fecha ni el nombre escrito', () => {
  const plan = planDe([{ division: 'd1a-men', rama: 'masculino', filas: [
    fila({ local: 'Cal', visitante: 'Stanford', fecha: '2026-10-10' }),
    fila({ local: 'California', visitante: 'Stanford', fecha: '2027-02-20' }),
    fila({ local: 'Stanford', visitante: 'Cal', fecha: '2027-03-06' }),
  ] }]);
  assert.deepEqual(plan.crear.map((c) => c.external_id), [
    'craa:2026-27:us-cal~us-stanford:1',
    'craa:2026-27:us-cal~us-stanford:2',
    'craa:2026-27:us-stanford~us-cal:1',
  ]);
});

test('plan: una reprogramación actualiza la fecha del mismo partido', () => {
  const plan = planDe(
    [{ division: 'd1a-men', rama: 'masculino', filas: [fila({ local: 'Navy', visitante: 'Army', fecha: '2026-10-17', hora: '13:00' })] }],
    [existente({ id: 'm1', external_id: 'craa:2026-27:us-navy~us-army:1', status: 'scheduled', score: null, home_base_points: 0, round_uuid: null, round_label: null })],
  );
  assert.equal(plan.crear.length, 0);
  assert.equal(plan.actualizar.length, 1);
  assert.equal(plan.actualizar[0].patch.date_time, '2026-10-17T13:00:00-04:00');
});

test('plan: sin cambios no escribe; un resultado corregido sí, y se reporta', () => {
  const navyArmy: PestanaCraa[] = [{ division: 'd1a-men', rama: 'masculino', filas: [fila({ local: 'Navy', visitante: 'Army', puntosLocal: 26, puntosVisitante: 14 })] }];
  const igual = planDe(navyArmy, [existente({ id: 'm1', external_id: 'craa:2026-27:us-navy~us-army:1' })]);
  assert.equal(igual.sinCambios, 1);
  assert.equal(igual.actualizar.length, 0);

  const corregido = planDe(navyArmy, [existente({ id: 'm1', external_id: 'craa:2026-27:us-navy~us-army:1', score: { home: 14, away: 26 }, home_base_points: 0, away_base_points: 2 })]);
  assert.deepEqual(corregido.actualizar[0].patch.score, { home: 26, away: 14 });
  assert.equal(corregido.actualizar[0].patch.home_base_points, 2);
  assert.equal(corregido.correcciones.length, 1);
});

test('plan: una nota escrita por una persona no se pisa', () => {
  const plan = planDe(
    [{ division: 'd1a-men', rama: 'masculino', filas: [fila({ local: 'Navy', visitante: 'Army', puntosLocal: 26, puntosVisitante: 14, competencia: 'NON-LEAGUE' })] }],
    [existente({ id: 'm1', external_id: 'craa:2026-27:us-navy~us-army:1', notes: 'Se jugó en Annapolis por la lluvia' })],
  );
  assert.equal(plan.sinCambios, 1);
});

test('plan: los nombres sin alias se agrupan; las filas de torneo de 10 y las llaves sin definir no cuentan', () => {
  const plan = planDe([{ division: 'd1a-men', rama: 'masculino', filas: [
    fila({ local: 'Navy', visitante: 'Wofford' }),
    fila({ local: 'Wofford', visitante: 'Army', fecha: '2026-10-03' }),
    fila({ local: "Cal Poly Maritime 10's Tournament", visitante: '' }),
    fila({ local: 'NorCal Semifinal', visitante: '' }),
    fila({ local: 'TBA', visitante: 'Navy' }),
  ] }]);
  assert.equal(plan.crear.length, 0);
  assert.equal(plan.omitidos.length, 2);
  assert.deepEqual(plan.equiposSinAlias, ['masculino: Wofford (2)']);
});

test('plan: los guardados que ya no están en la planilla se reportan y no se tocan', () => {
  const plan = planDe([], [existente({ id: 'm9', external_id: 'craa:2026-27:us-navy~us-army:1' })]);
  assert.equal(plan.huerfanos.length, 1);
  assert.equal(plan.actualizar.length, 0);
});
