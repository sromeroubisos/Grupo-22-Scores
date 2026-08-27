import test from 'node:test';
import assert from 'node:assert/strict';

import type { PartidoArusa } from './client.ts';
import { filaSegunArusa, planArusaMatches, rotarCompetencias, type PartidoExistente } from './sync.ts';

const partido = (over: Partial<PartidoArusa> = {}): PartidoArusa => ({
    id: '144833532',
    fecha: 'Fecha 4',
    ordenFecha: 4,
    inicioLocal: '2026-08-23 14:00:00',
    zona: 'America/Santiago',
    local: { id: '900', nombre: 'UC' },
    visita: { id: '901', nombre: 'Old Green RC' },
    puntosLocal: null,
    puntosVisita: null,
    tablaLocal: null,
    tablaVisita: null,
    cancha: 'San Carlos de Apoquindo',
    anulado: false,
    postergado: false,
    libre: false,
    jugado: false,
    ...over,
});

const fila = (fuente: PartidoArusa, over: Partial<PartidoExistente> = {}): PartidoExistente => ({
    ...(filaSegunArusa(fuente, 'club-uc', 'club-old-green') as unknown as PartidoExistente),
    id: 'fila-1',
    ...over,
});

const plan = (fuente: PartidoArusa, existente: PartidoExistente) => planArusaMatches({
    partidos: [fuente],
    existentes: [existente],
    resolverClub: (e) => (e.id === '900' ? 'club-uc' : 'club-old-green'),
    plantillaDeAlta: {},
    nuevoId: () => 'nuevo-1',
});

/* ── los tres estados de la fuente ──────────────────────────────────────── */

test('sin jugar y sin flag -> scheduled', () => {
    const r = filaSegunArusa(partido(), 'club-uc', 'club-old-green');
    assert.equal(r.status, 'scheduled');
});

/**
 * El caso que motivó esto: `arusa:145348015` (Old Navy — Old Johns, M14
 * Segunda) llegó postergado el 23/8/2026 y en G22 quedaba `scheduled` con su
 * horario original, o sea idéntico a un partido que todavía se va a jugar a esa
 * hora. La ficha decía una cosa y ARUSA otra.
 */
test('postergado en la fuente -> postponed, no scheduled', () => {
    const r = filaSegunArusa(partido({ postergado: true }), 'club-uc', 'club-old-green');
    assert.equal(r.status, 'postponed');
});

/**
 * ARUSA no siempre limpia `postponed` cuando el partido se juega en la fecha
 * nueva. Lo jugado manda: si hay marcador, es final, y los puntos de tabla se
 * reparten igual que en cualquier otro partido.
 */
test('jugado gana sobre postergado -> final con sus puntos', () => {
    const r = filaSegunArusa(
        partido({ postergado: true, jugado: true, puntosLocal: 27, puntosVisita: 12, tablaLocal: 5, tablaVisita: 0 }),
        'club-uc', 'club-old-green',
    );
    assert.equal(r.status, 'final');
    assert.deepEqual(r.score, { home: 27, away: 12 });
    assert.equal(r.home_base_points, 4);
    assert.equal(r.home_bonus_points, 1);
});

/* ── qué hace el plan con ese estado ────────────────────────────────────── */

test('un partido que pasa a postergado se parchea y rehace la tabla', () => {
    const antes = partido();
    const p = plan(partido({ postergado: true }), fila(antes));
    assert.equal(p.actualizar.length, 1);
    assert.equal(p.actualizar[0].patch.status, 'postponed');
    assert.deepEqual(p.actualizar[0].cambios, ['estado scheduled → postponed']);
    assert.equal(p.actualizar[0].tocaResultado, true, 'un cambio de estado pide recalcular la fase');
});

/**
 * El caso de vuelta, que es el que se olvida: ARUSA levanta la postergación y
 * reprograma. Si el parche solo supiera ir hacia `postponed`, la ficha se
 * quedaría aplazada para siempre.
 */
test('si ARUSA levanta la postergación, vuelve a scheduled', () => {
    const p = plan(partido(), fila(partido({ postergado: true })));
    assert.equal(p.actualizar.length, 1);
    assert.equal(p.actualizar[0].patch.status, 'scheduled');
});

test('sin cambios en la fuente, un postergado no genera parche', () => {
    const fuente = partido({ postergado: true });
    const p = plan(fuente, fila(fuente));
    assert.equal(p.actualizar.length, 0);
    assert.equal(p.sinCambios, 1);
});

test('rotarCompetencias: es una rotación, no pierde ni repite, y el arranque cambia entre corridas', () => {
    const lista = ['a', 'b', 'c', 'd', 'e'];
    const a15 = Date.UTC(2026, 7, 27, 15); // jue 27/8 15:00 UTC, la corrida diaria
    const r = rotarCompetencias(lista, a15);
    assert.deepEqual([...r].sort(), lista);
    assert.equal(r.length, lista.length);
    // Mismo instante, mismo orden: la corrida es reproducible.
    assert.deepEqual(rotarCompetencias(lista, a15), r);
    // Al día siguiente a la misma hora empieza un lugar más adelante.
    const manana = rotarCompetencias(lista, a15 + 86_400_000);
    assert.equal(manana[0], lista[(lista.indexOf(r[0]) + 1) % lista.length]);
    // Las corridas del finde, cada dos horas, no repiten arranque entre sí.
    const arranques = [16, 18, 20, 22].map((h) => rotarCompetencias(lista, Date.UTC(2026, 7, 29, h))[0]);
    assert.equal(new Set(arranques).size, arranques.length);
    // Con una sola competencia (`?slug=`) no hay nada que rotar.
    assert.deepEqual(rotarCompetencias(['solo'], a15), ['solo']);
});
