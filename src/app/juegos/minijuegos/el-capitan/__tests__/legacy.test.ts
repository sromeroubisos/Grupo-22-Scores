// EL LEGADO SE CONSTRUYE CON DECISIONES, Y EL OBJETIVO NO MUEVE LOS DADOS.
//
// `legacy.ts` es presentación —no se persiste, no consume azar—, así que acá no
// hay digest. Lo que se prueba es lo que el módulo AFIRMA:
//
//   · QUEDARSE Y RECORRER DEJAN LEGADOS DISTINTOS. Es la premisa del juego
//     («las dos escaleras se pelean de verdad», calibration.test.ts). Si el
//     brazo que se queda y el que acepta todo terminaran con el mismo legado
//     principal, el sistema estaría midiendo el dado y no la carrera.
//   · EL OBJETIVO NO CAMBIA LA CARRERA. Se anota en `player.flags` y el motor
//     no lo lee: misma semilla con y sin objetivo, misma trayectoria. Si un día
//     alguien lo hace leer al motor, este test lo avisa y obliga a subir
//     `CAPTAIN_ENGINE_VERSION` a conciencia.
//   · CADA PUNTO TIENE SU RENGLÓN. El puntaje de un eje es la suma de los
//     renglones que se muestran, recortada a 0–100. Un número sin porqué es
//     justo lo que el sistema no puede ser.
//
// Las proporciones se piden contra la PREMISA (CLAUDE.md de captain §1.3): «la
// mayoría», no «el 77,5% que da hoy».

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../../../../features/captain/types/captain.ts';
import type { PositionFamilyId } from '../../../../../features/captain/types/player.ts';
import type { MomentOutcome } from '../../../../../features/captain/types/moment.ts';
import { ALL_FAMILIES } from '../../../../../features/captain/data/positions.ts';
import { trainingsFor } from '../../../../../features/captain/data/trainings.ts';
import { captainReducer, createInitialCaptain } from '../../../../../features/captain/state/captain-reducer.ts';
import { playTournament } from '../../../../../features/captain/state/captain-autoplay.ts';
import { getPendingEvent } from '../../../../../features/captain/engine/event-selector.ts';
import { getMomentDef, isContractKind } from '../../../../../features/captain/engine/moment-defs/index.ts';
import { tacklePlayAt, tackleZones } from '../../../../../features/captain/engine/moments.ts';
import {
    LEGACY_LEVELS,
    careerGoals,
    goalFlagOf,
    goalOf,
    goalProgressOf,
    legacyLevelOf,
    legacyOf,
    type CareerGoalId,
} from '../legacy.ts';

/** La mano del jugador de referencia: la misma que usa `calibration.test.ts`. */
function mano(state: CaptainState): MomentOutcome {
    const p = state.pendingMoment!;
    if (isContractKind(p.kind)) return getMomentDef(p.kind)!.playAt(p.setup!, 'bien', 0.5);
    if (p.kind === 'bunker') return { kind: 'bunker' };
    const zones = tackleZones(state.player, state.damage.cuerpo, p.pressure);
    const { at, zone } = tacklePlayAt(zones, 'bien', 0.5);
    return { kind: 'tackle', zone, at };
}

/** Pedida por tier y no por índice (§1.5): la carta media del oficio. */
function carta(family: PositionFamilyId): string {
    const t = trainingsFor(family).find((x) => x.tier === 'media');
    assert.ok(t, `${family} no ofrece carta media`);
    return t.id;
}

function jugar(seed: number, family: PositionFamilyId, fiel: boolean, goal?: string): CaptainState {
    const input: CreateCaptainInput = { name: 'X', surname: 'Y', family, countryCode: 'ar', goal };
    let s = createInitialCaptain(input, seed);
    let vuelta = 0;
    while (s.phase !== 'retired') {
        assert.ok(vuelta < 60, `carrera trabada en '${s.phase}'`);
        s = captainReducer(s, { type: 'CHOOSE_TRAINING', trainingId: carta(s.player.family) });
        let g = 0;
        while (s.phase === 'moment' && g++ < 4) s = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: mano(s) });
        s = playTournament(captainReducer(s, { type: 'ADVANCE' }));
        let d = 0;
        while (s.phase === 'event' && d++ < 4) {
            const e = getPendingEvent(s)!;
            const i = fiel && e.category === 'mercado' ? e.options.length - 1 : vuelta % e.options.length;
            s = captainReducer(s, { type: 'CHOOSE', optionId: e.options[i].id });
        }
        vuelta += 1;
    }
    return s;
}

const POR_FAMILIA = 3;
function muestra(fiel: boolean): CaptainState[] {
    const out: CaptainState[] = [];
    for (const family of ALL_FAMILIES) {
        for (let i = 0; i < POR_FAMILIA; i += 1) out.push(jugar(4100 + i * 13, family, fiel));
    }
    return out;
}

const FIELES = muestra(true);
const VIAJEROS = muestra(false);
const prop = (xs: CaptainState[], f: (s: CaptainState) => boolean) => xs.filter(f).length / xs.length;

function conMeta(s: CaptainState, id: CareerGoalId): CaptainState {
    return { ...s, player: { ...s.player, flags: { ...s.player.flags, [goalFlagOf(id)]: 1 } } };
}

test('QUEDARSE Y RECORRER DEJAN LEGADOS DISTINTOS', () => {
    // El que se queda: su nombre queda en el club. La mayoría, no todos —una
    // lesión temprana o un club que desciende también son carreras—.
    const fielesDelClub = prop(FIELES, (s) => legacyOf(s).main?.id === 'club');
    assert.ok(fielesDelClub >= 0.5, `sólo ${fielesDelClub} de los que se quedan terminan como gente del club`);

    // El que acepta cada oferta no puede ser ídolo de nadie: pasa por ocho clubes.
    const viajerosDelClub = prop(VIAJEROS, (s) => legacyOf(s).main?.id === 'club');
    assert.ok(viajerosDelClub <= 0.15, `${viajerosDelClub} de los que rotan terminan como ídolos de un club`);
});

test('el objetivo se juzga contra lo que elegiste, y la decisión lo mueve', () => {
    // «Ser ídolo» se cumple quedándose y no recorriendo; «jugar afuera», al revés.
    const cumple = (xs: CaptainState[], id: CareerGoalId) =>
        prop(xs, (s) => goalProgressOf(conMeta(s, id))!.status === 'cumplido');

    const idoloFiel = cumple(FIELES, 'idolo');
    const idoloViajero = cumple(VIAJEROS, 'idolo');
    const afueraFiel = cumple(FIELES, 'exterior');
    const afueraViajero = cumple(VIAJEROS, 'exterior');

    assert.ok(idoloFiel > idoloViajero + 0.5, `ídolo: fiel ${idoloFiel} vs viajero ${idoloViajero}`);
    assert.ok(afueraViajero > afueraFiel + 0.5, `exterior: viajero ${afueraViajero} vs fiel ${afueraFiel}`);
});

test('EL OBJETIVO NO MUEVE LOS DADOS', () => {
    for (const family of ['apertura', 'primera-linea'] as PositionFamilyId[]) {
        const sin = jugar(777, family, false);
        const con = jugar(777, family, false, 'titulos');
        assert.deepEqual(con.history, sin.history, `${family}: la trayectoria cambió con el objetivo`);
        assert.equal(con.rngState, sin.rngState);
        assert.equal(goalOf(con)?.id, 'titulos');
        assert.equal(goalOf(sin), null);
    }
});

test('cada punto tiene su renglón, y el escalón sale del puntaje', () => {
    for (const s of [...FIELES, ...VIAJEROS]) {
        for (const eje of legacyOf(s).axes) {
            const suma = eje.reasons.reduce((acc, r) => acc + r.points, 0);
            assert.equal(eje.score, Math.max(0, Math.min(100, suma)), `${eje.id}: el puntaje no es la suma de sus renglones`);
            assert.equal(eje.level, legacyLevelOf(eje.score));
            assert.equal(eje.headline === '', eje.level === 'ninguno');
            for (const r of eje.reasons) assert.notEqual(r.points, 0, `${eje.id}: renglón vacío «${r.text}»`);
        }
    }
});

test('el legado principal es el eje más alto, y no hay principal sin huella', () => {
    const huella = LEGACY_LEVELS.find((l) => l.id === 'huella')!.min;
    for (const s of [...FIELES, ...VIAJEROS]) {
        const { axes, main } = legacyOf(s);
        const tope = Math.max(...axes.map((a) => a.score));
        if (tope < huella) assert.equal(main, null);
        else assert.equal(main?.score, tope);
    }
});

test('es puro: no toca el estado y da siempre lo mismo', () => {
    const s = FIELES[0];
    const antes = JSON.stringify(s);
    assert.deepEqual(legacyOf(s), legacyOf(s));
    assert.equal(JSON.stringify(s), antes);
});

test('los cinco objetivos existen, y la selección se nombra como en la cancha', () => {
    const ar = careerGoals('ar');
    assert.equal(ar.length, 5);
    assert.equal(new Set(ar.map((g) => g.id)).size, 5);
    assert.ok(ar.some((g) => g.label === 'Llegar a Los Pumas'));
    for (const g of ar) {
        assert.ok(!g.label.includes('!') && !g.hint.includes('!'), 'sin signos de exclamación');
        assert.ok(g.hint.length > 0, `${g.id} sin hint: el costo tiene que estar dicho`);
    }
});
