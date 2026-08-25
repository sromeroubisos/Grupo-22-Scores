import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveMatchTabs,
    toMatchStatusKind,
    type MatchProvider,
    type MatchTabCounts,
    type MatchTabId,
} from './matchTabs';

const EMPTY: MatchTabCounts = {
    events: 0, lineups: 0, players: 0, stats: 0, h2h: 0, standings: 0, commentary: 0, videos: 0,
};

const ids = (provider: MatchProvider, status: 'scheduled' | 'live' | 'final', counts: Partial<MatchTabCounts>) =>
    resolveMatchTabs({ provider, status, counts }).tabs.map((t) => t.id);

// ── La regla que reemplaza al if/else de cinco ramas ────────────────────────

test('una pestana sin dato no se dibuja', () => {
    const { hidden } = resolveMatchTabs({ provider: 'local', status: 'final', counts: EMPTY });

    // Nueve de diez caen; la decima la sostiene el piso (test siguiente).
    assert.equal(hidden.length, 9, 'las que no tienen dato salen por hidden con su motivo');
    assert.ok(hidden.every((h) => h.reason.length > 0), 'ningun motivo queda vacio');
});

test('el piso: la barra nunca queda vacia', () => {
    // Un partido cargado a mano —resultado y nada mas— es lo normal en los
    // torneos locales. Sin piso, la pagina se quedaba sin una sola pestana.
    const jugado = resolveMatchTabs({ provider: 'local', status: 'final', counts: EMPTY });
    assert.deepEqual(jugado.tabs.map((t) => t.id), ['summary']);
    assert.equal(jugado.defaultTab, 'summary');
    assert.ok(!jugado.hidden.some((h) => h.id === 'summary'), 'la que sostiene el piso no figura oculta');

    // Programado sin nada no necesita el piso: le queda la promesa de los
    // planteles, que es un dato real —todavia no llego, pero va a llegar—.
    const programado = resolveMatchTabs({ provider: 'local', status: 'scheduled', counts: EMPTY });
    assert.deepEqual(programado.tabs.map((t) => t.id), ['lineups']);
    assert.equal(programado.tabs[0].state, 'pending');
    assert.equal(programado.defaultTab, 'lineups');

    // Vale para cualquier fuente, incluso las de cobertura mas pobre.
    for (const provider of ['rugby-api-sports', 'espn-american-football', 'fih', 'espn-soccer', 'flashscore'] as MatchProvider[]) {
        for (const status of ['scheduled', 'live', 'final'] as const) {
            const { tabs } = resolveMatchTabs({ provider, status, counts: EMPTY });
            assert.ok(tabs.length >= 1, `${provider}/${status} se quedo sin pestanas`);
        }
    }
});

test('el partido auditado: programado con historial y tabla deja cuatro pestanas', () => {
    const { tabs, defaultTab } = resolveMatchTabs({
        provider: 'local',
        status: 'scheduled',
        counts: { h2h: 4, standings: 12 },
    });

    assert.deepEqual(tabs.map((t) => t.id), ['previa', 'lineups', 'h2h', 'standings']);
    assert.equal(defaultTab, 'previa', 'antes del pitazo se abre en la antesala');

    // Alineaciones se dibuja pero avisa que todavia no llego.
    const lineups = tabs.find((t) => t.id === 'lineups');
    assert.equal(lineups?.state, 'pending');
    assert.ok(lineups?.hint, 'una pestana pending sin promesa no sirve de nada');

    // Y las que hoy salen vacias no se dibujan.
    for (const gone of ['summary', 'videos', 'timeline', 'players', 'stats', 'commentary'] as MatchTabId[]) {
        assert.ok(!tabs.some((t) => t.id === gone), `${gone} no deberia dibujarse`);
    }
});

test('el estado del partido manda la pestana de entrada', () => {
    const full = { events: 20, lineups: 30, players: 22, stats: 8, h2h: 5, standings: 12, commentary: 40 };

    assert.equal(resolveMatchTabs({ provider: 'local', status: 'live', counts: full }).defaultTab, 'timeline');
    assert.equal(resolveMatchTabs({ provider: 'local', status: 'final', counts: full }).defaultTab, 'summary');
    assert.equal(
        resolveMatchTabs({ provider: 'local', status: 'scheduled', counts: full }).defaultTab,
        'previa',
    );
});

test('la pestana de entrada siempre existe entre las dibujadas', () => {
    const casos: Array<[MatchProvider, 'scheduled' | 'live' | 'final', Partial<MatchTabCounts>]> = [
        ['local', 'scheduled', { standings: 12 }],
        ['local', 'live', { events: 3 }],
        ['local', 'final', { stats: 6 }],
        ['rugby-api-sports', 'final', { lineups: 30 }],
        ['fih', 'live', { commentary: 0, events: 0 }],
        ['espn-soccer', 'final', { h2h: 3 }],
    ];

    for (const [provider, status, counts] of casos) {
        const { tabs, defaultTab } = resolveMatchTabs({ provider, status, counts });
        if (tabs.length === 0) continue;
        assert.ok(
            tabs.some((t) => t.id === defaultTab),
            `${provider}/${status}: la entrada ${defaultTab} no esta en la barra`,
        );
    }
});

// ── Las capacidades por fuente ──────────────────────────────────────────────

test('lo que la fuente no publica nunca no aparece, aunque lleguen datos', () => {
    // A API-Sports le pasamos eventos y planilla: no los publica, no se dibujan.
    const tabs = ids('rugby-api-sports', 'final', {
        events: 99, players: 99, stats: 99, commentary: 99, lineups: 30, h2h: 4, standings: 12,
    });

    assert.deepEqual(tabs, ['summary', 'lineups', 'h2h', 'standings']);
});

test('la misma fuente con el mismo estado da la misma barra (equivalencia)', () => {
    const counts = { events: 12, lineups: 30, stats: 7, h2h: 3, standings: 10 };
    const a = resolveMatchTabs({ provider: 'espn-soccer', status: 'live', counts });
    const b = resolveMatchTabs({ provider: 'espn-soccer', status: 'live', counts: { ...counts } });

    assert.deepEqual(a.tabs, b.tabs, 'dos llamadas iguales tienen que dar lo mismo');
    assert.equal(a.defaultTab, b.defaultTab);
});

test('el motor no muta lo que recibe', () => {
    const counts = { events: 4, standings: 8 };
    const copia = { ...counts };
    resolveMatchTabs({ provider: 'local', status: 'live', counts });

    assert.deepEqual(counts, copia, 'los counts entran de solo lectura');
});

test('FIH nunca ofrece relato y local si, cuando hay', () => {
    assert.ok(!ids('fih', 'final', { commentary: 50, events: 9 }).includes('commentary'));
    assert.ok(ids('local', 'final', { commentary: 50, events: 9 }).includes('commentary'));
});

// ── Los casos de borde que rompian la pagina ────────────────────────────────

test('en vivo sin eventos todavia: cronologia se dibuja con la promesa, no vacia', () => {
    const { tabs } = resolveMatchTabs({ provider: 'local', status: 'live', counts: { standings: 12 } });
    const timeline = tabs.find((t) => t.id === 'timeline');

    assert.equal(timeline?.state, 'pending');
    assert.ok(timeline?.hint);
});

test('terminado sin alineaciones: la pestana desaparece en vez de prometer', () => {
    const { tabs } = resolveMatchTabs({ provider: 'local', status: 'final', counts: { events: 10 } });

    assert.ok(!tabs.some((t) => t.id === 'lineups'), 'ya no las van a cargar');
});

test('programado sin historial ni tabla no inventa una previa', () => {
    const { tabs } = resolveMatchTabs({ provider: 'local', status: 'scheduled', counts: EMPTY });

    assert.ok(!tabs.some((t) => t.id === 'previa'), 'sin nada que anticipar no hay antesala');
});

test('todo rotulo corto entra en el ancho de un telefono', () => {
    const { tabs } = resolveMatchTabs({
        provider: 'local',
        status: 'final',
        counts: { events: 9, lineups: 30, players: 22, stats: 6, h2h: 4, standings: 12, commentary: 12 },
    });

    for (const tab of tabs) {
        assert.ok(tab.shortLabel.length > 0, `${tab.id} sin rotulo corto`);
        // 10 caracteres es lo que entra en 390/4 sin cortarse. Medido en el
        // navegador: con "Jugadores" (9) y el gap, el riel ya no trunca.
        assert.ok(
            tab.shortLabel.length <= 10,
            `${tab.id}: "${tab.shortLabel}" tiene ${tab.shortLabel.length} caracteres y se va a cortar`,
        );
    }
});

// ── Normalizacion del estado crudo ──────────────────────────────────────────

test('toMatchStatusKind reduce el estado crudo a las tres formas', () => {
    for (const live of ['live', 'LIVE', 'inplay', 'in_play']) {
        assert.equal(toMatchStatusKind(live), 'live', live);
    }
    for (const final of ['final', 'finished', 'ft', 'FT', 'ended']) {
        assert.equal(toMatchStatusKind(final), 'final', final);
    }
    // Lo desconocido cae en programado: nunca se muestran datos que no hay.
    for (const scheduled of ['scheduled', 'postponed', '', null, undefined, 'cualquier-cosa']) {
        assert.equal(toMatchStatusKind(scheduled), 'scheduled', String(scheduled));
    }
});

// ── Quien administra ve todas las secciones ─────────────────────────────────

test('con permiso de edicion se dibujan todas, aunque esten vacias', () => {
    // Un partido de API sin nada cargado: el hincha ve lo poco que hay, quien
    // administra ve las puertas para cargar el resto.
    const fan = resolveMatchTabs({ provider: 'rugby-api-sports', status: 'final', counts: { h2h: 4 } });
    const admin = resolveMatchTabs({ provider: 'rugby-api-sports', status: 'final', counts: { h2h: 4 }, canManage: true });

    assert.ok(admin.tabs.length > fan.tabs.length, 'el admin tiene que ver mas secciones');
    // Se abren las que se cargan a mano, aunque la API no las traiga.
    assert.ok(admin.tabs.some((t) => t.id === 'lineups'));
    assert.ok(admin.tabs.some((t) => t.id === 'stats'));

    // Pero NO las que se derivan de los eventos: vacias no llevan a ningun lado.
    for (const derivada of ['timeline', 'players', 'commentary'] as MatchTabId[]) {
        assert.ok(!admin.tabs.some((t) => t.id === derivada),
            `${derivada} vacia no deberia dibujarse ni para el admin`);
    }

    // Las vacias que si se abren se marcan pending, con donde cargarlas.
    const vacia = admin.tabs.find((t) => t.id === 'lineups');
    assert.equal(vacia?.state, 'pending');
    assert.match(String(vacia?.hint), /cargar/i);

    // Y la que si tiene dato sigue siendo ready.
    assert.equal(admin.tabs.find((t) => t.id === 'h2h')?.state, 'ready');
});

test('el admin no ve Previa en un partido terminado', () => {
    const { tabs } = resolveMatchTabs({ provider: 'local', status: 'final', counts: { events: 5 }, canManage: true });
    assert.ok(!tabs.some((t) => t.id === 'previa'), 'la antesala se deriva, no se carga');
});

// ── Videos: highlights y partido completo ───────────────────────────────────

test('videos se dibuja en cualquier fuente y estado si hay links, y no si no hay', () => {
    // Los links son nuestros, no del proveedor: la cobertura de la API no manda.
    for (const provider of ['local', 'flashscore', 'rugby-api-sports', 'espn-american-football', 'espn-soccer', 'fih'] as MatchProvider[]) {
        for (const status of ['scheduled', 'live', 'final'] as const) {
            assert.ok(ids(provider, status, { videos: 2 }).includes('videos'), `${provider}/${status} con links`);
            assert.ok(!ids(provider, status, { videos: 0, events: 5 }).includes('videos'), `${provider}/${status} sin links`);
        }
    }

    const { hidden } = resolveMatchTabs({ provider: 'local', status: 'final', counts: { events: 5 } });
    assert.ok(hidden.some((h) => h.id === 'videos' && h.reason.length > 0), 'oculta con motivo');
});

test('videos va despues del resumen y antes de la cronologia', () => {
    assert.deepEqual(ids('local', 'final', { events: 9, videos: 1, lineups: 30 }), ['summary', 'videos', 'timeline', 'lineups']);
});

test('un partido a mano con resultado y un video abre en los videos', () => {
    // Lo normal en un torneo local: resultado, ningun evento, y el link de los
    // highlights que subio el club. No hace falta el piso: la unica pestana
    // que hay es la de entrada.
    const { tabs, defaultTab } = resolveMatchTabs({ provider: 'local', status: 'final', counts: { videos: 1 } });
    assert.deepEqual(tabs.map((t) => t.id), ['videos']);
    assert.equal(defaultTab, 'videos');
});

test('quien administra ve videos vacia como puerta para cargar', () => {
    const admin = resolveMatchTabs({ provider: 'flashscore', status: 'final', counts: { events: 5 }, canManage: true });
    const videos = admin.tabs.find((t) => t.id === 'videos');
    assert.equal(videos?.state, 'pending');
    assert.match(String(videos?.hint), /link/i);
});
