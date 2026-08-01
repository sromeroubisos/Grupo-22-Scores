// EL CONTRATO de un Momento.
//
// Acá no se prueba ningún minijuego: se prueba que el CARRIL cumpla lo que
// promete, porque es lo que van a dar por cierto los catorce que faltan. Cuatro
// garantías, y cada una existe porque romperla no rompe nada visible hasta que
// es tarde:
//
//   1. `resolve` no ve el contexto — si lo viera, la jugada daría distinto
//      antes y después de un F5, y ningún test de determinismo lo agarraría
//      porque los tests no recargan la página.
//   2. Una cadena se resuelve a lo sumo una vez, y nunca a sí misma.
//   3. `rollMoment` consume exactamente lo mismo del stream principal que antes
//      de que existieran los Momentos por puesto — es lo que hace que el digest
//      congelado se mueva solo donde un Momento cambió el resultado.
//   4. El registry es consistente: cada def declara el kind con el que está
//      indexada. Es lo que hace honesto el borrado de genéricos.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptainState, CreateCaptainInput } from '../../types/captain.ts';
import type { MomentResult, MomentSetupCtx } from '../../types/moment-def.ts';
import type { PendingMoment } from '../../types/moment.ts';
import type { CaptainAction } from '../../state/captain-actions.ts';
import { TIME_SLOTS, TIME_TOKENS_PER_SEASON } from '../../types/currencies.ts';
import { ALL_FAMILIES, baseAttributes } from '../../data/positions.ts';
import { captainReducer, createInitialCaptain } from '../../state/captain-reducer.ts';
import { createRng } from '../random.ts';
import { MOMENT_DEFS } from '../moment-defs/index.ts';
import { applyMomentDeltas, momentSeed, nextChain, pickMomentKind, proficiencyFor, rollMoment } from '../moments.ts';

const TERCERA: CreateCaptainInput = {
    name: 'Ciro',
    surname: 'Bertranou',
    family: 'tercera-linea',
    countryCode: 'ar',
};

function repartir(state: CaptainState): CaptainState {
    const acciones: CaptainAction[] = [];
    for (let i = 0; i < TIME_TOKENS_PER_SEASON; i += 1) {
        acciones.push({ type: 'SPEND_TIME', slot: TIME_SLOTS[i % TIME_SLOTS.length] });
    }
    acciones.push({ type: 'CONFIRM_TIME' });
    return acciones.reduce(captainReducer, state);
}

/** Avanza hasta que quede un jackal pendiente. `null` si no salió ninguno. */
function hastaElJackal(max = 40): CaptainState | null {
    for (let seed = 1; seed <= max; seed += 1) {
        let s = createInitialCaptain(TERCERA, seed);
        for (let i = 0; i < 3 && s.phase !== 'retired'; i += 1) {
            s = repartir(s);
            if (s.phase === 'moment' && s.pendingMoment?.kind === 'jackal') return s;
            if (s.phase !== 'moment') {
                s = captainReducer(s, { type: 'ADVANCE' });
                if (s.phase === 'event') break; // sin chooser no se puede seguir
            } else {
                break; // salió otro kind: probamos otra semilla
            }
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  1 · `resolve` NO VE EL CONTEXTO
// ═══════════════════════════════════════════════════════════════════════════

test('resolve recibe DOS argumentos y nunca un tercero', () => {
    // Guardia estructural, barata y contundente: el día que alguien le agregue
    // un `ctx` a `resolve` para salir del paso, esto se pone en rojo antes de
    // que el bug exista. La aridad es lo único que se puede chequear sin correr
    // la función.
    for (const def of MOMENT_DEFS) {
        assert.equal(def.resolve.length, 2, `${def.kind}: resolve tiene que ser (setup, input) y nada más`);
    }
});

test('LA JUGADA SE RESUELVE IGUAL ANTES Y DESPUÉS DE UN F5', () => {
    // El paso 3 del §8 de CLAUDE.md, hecho test. La recarga es exactamente esto:
    // el estado se serializa, se rehidrata, y la misma mano tiene que dar el
    // mismo resultado. Si `resolve` leyera el estado en vez del Setup, cualquier
    // cosa que se recalcule al rehidratar movería la jugada.
    const s = hastaElJackal();
    if (!s) return;

    const mano: CaptainAction = { type: 'RESOLVE_MOMENT', outcome: { kind: 'jackal', reactions: [180, 250, 400] } };
    const directo = captainReducer(s, mano);

    const recargado = JSON.parse(JSON.stringify(s)) as CaptainState;
    const despuesDelF5 = captainReducer(recargado, mano);

    assert.deepEqual(despuesDelF5, directo, 'la jugada dio distinto después de recargar');
});

test('el Setup viaja entero en el guardado: nada se recalcula al rehidratar', () => {
    const s = hastaElJackal();
    if (!s) return;

    const setup = s.pendingMoment!.setup;
    assert.ok(setup, 'un Momento del contrato tiene que llevar su Setup');

    const viajado = JSON.parse(JSON.stringify(setup));
    assert.deepEqual(viajado, setup, 'el Setup no es JSON puro');
    assert.equal(typeof setup!.seed, 'number', 'el Setup tiene que llevar su semilla adentro');
});

test('el mismo Setup con la misma mano da el mismo resultado, siempre', () => {
    for (const def of MOMENT_DEFS) {
        const ctx: MomentSetupCtx = {
            kind: def.kind,
            season: 4,
            minute: 63,
            scoreDelta: -3,
            pressure: 0.7,
            family: 'tercera-linea',
            proficiency: 1,
            attrs: baseAttributes('tercera-linea'),
            bodyDamage: 12,
            seed: momentSeed(777, def.kind, 4, 0),
        };
        const a = def.setup(ctx);
        const b = def.setup(ctx);
        assert.deepEqual(b, a, `${def.kind}: dos setups con el mismo ctx dieron distinto`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  2 · LA CADENA
// ═══════════════════════════════════════════════════════════════════════════

const PENDIENTE: PendingMoment = { kind: 'tackle', minute: 63, scoreDelta: -3, pressure: 0.7 };
const conChain = (chain?: PendingMoment['kind']): MomentResult => ({
    deltas: {},
    result: 'x',
    text: 'x',
    ...(chain ? { chain } : {}),
});

test('sin chain no hay cadena', () => {
    assert.equal(nextChain(PENDIENTE, conChain()), null);
});

test('con chain, la cadena sale una vez', () => {
    assert.equal(nextChain(PENDIENTE, conChain('bunker')), 'bunker');
});

test('UNA CADENA SE RESUELVE A LO SUMO UNA VEZ', () => {
    // Lo que llegó encadenado ya no encadena. Sin esto, dos Momentos que se
    // llamen entre sí dejan la carrera girando y el jugador no tiene salida:
    // la fase nunca vuelve a `season` y el botón de jugar la temporada no
    // aparece más.
    const encadenado: PendingMoment = { ...PENDIENTE, kind: 'bunker', chained: true };
    assert.equal(nextChain(encadenado, conChain('tackle')), null);
    assert.equal(nextChain(encadenado, conChain('jackal')), null);
});

test('UN MOMENTO NO SE PUEDE ENCADENAR A SÍ MISMO', () => {
    // Aunque una sola vuelta no sea un bucle infinito, encadenarse a sí mismo es
    // siempre un error de escritura: lo que se quería era otra ronda del mismo
    // minijuego, y eso se resuelve adentro del Momento.
    assert.equal(nextChain(PENDIENTE, conChain('tackle')), null);

    const jackal: PendingMoment = { ...PENDIENTE, kind: 'jackal' };
    assert.equal(nextChain(jackal, conChain('jackal')), null);
});

// ═══════════════════════════════════════════════════════════════════════════
//  3 · EL STREAM PRINCIPAL NO SE MUEVE
// ═══════════════════════════════════════════════════════════════════════════

test('ROLLMOMENT CONSUME EXACTAMENTE TRES TIRADAS, NI UNA MÁS', () => {
    // Es la garantía que hace revisable el digest congelado. Si elegir el kind
    // saliera del stream de la carrera, agregar un Momento consumiría una tirada
    // más por temporada y correría TODAS las carreras: el digest se movería
    // entero, en los tres casos, y el diff diría "se movió todo, confiá".
    //
    // Las tres son `chance` (¿hay jugada?) + `int` (minuto) + `int` (marcador).
    // El kind y los márgenes salen de semillas derivadas.
    let base = createInitialCaptain(TERCERA, 5);
    base = repartir(base);
    // Un estado listo para volver a tirar, sin importar en qué fase quedó.
    const estado: CaptainState = { ...base, phase: 'offseason', pendingMoment: null };

    let conJugada = 0;
    let sinJugada = 0;

    for (let seed = 1; seed <= 60; seed += 1) {
        const rng = createRng(seed);
        const salio = rollMoment(estado, rng);

        const espejo = createRng(seed);
        // `chance` y `int` consumen una tirada cada uno, así que para comparar
        // ESTADOS alcanza con contar tiradas: no hace falta conocer la
        // probabilidad ni los rangos, que son calibración y pueden cambiar.
        espejo.next();
        if (salio) {
            espejo.next();
            espejo.next();
            conJugada += 1;
        } else {
            sinJugada += 1;
        }

        assert.equal(
            rng.state,
            espejo.state,
            `semilla ${seed}: rollMoment consumió del stream principal algo que no era chance+int+int`,
        );
    }

    // Y que el barrido haya visto los dos caminos, si no el test no probó nada.
    assert.ok(conJugada > 0, 'ninguna semilla produjo jugada: el test no probó el camino largo');
    assert.ok(sinJugada > 0, 'todas produjeron jugada: el test no probó el corte temprano');
});

test('elegir el kind no depende del rng de la carrera, solo de la semilla', () => {
    const a = pickMomentKind(1234, 7, 'tercera-linea');
    const b = pickMomentKind(1234, 7, 'tercera-linea');
    assert.equal(b, a, 'la elección tiene que ser función de (semilla, temporada, familia)');
});

test('EL CRUCE: casi siempre te toca lo tuyo, y cada tanto lo de otro', () => {
    // El rugby real está lleno de cruces —el 10 sale y patea el fullback, el
    // centro llega primero al ruck— pero son raros. Lo que este test cuida es la
    // FORMA: que el cruce exista y que sea excepción, no que valga exactamente
    // 0,08. La banda es ancha a propósito; si algún día se calibra, este test no
    // se pone en rojo por eso.
    let propios = 0;
    let cruces = 0;

    for (const family of ALL_FAMILIES) {
        for (let season = 1; season <= 200; season += 1) {
            const kind = pickMomentKind(909, season, family);
            if (proficiencyFor(kind, family) < 1) cruces += 1;
            else propios += 1;
        }
    }

    const total = propios + cruces;
    const tasa = cruces / total;
    assert.ok(tasa > 0.02, `el cruce no aparece nunca (${(tasa * 100).toFixed(1)}%): proficiency queda dormido`);
    assert.ok(tasa < 0.2, `el cruce dejó de ser excepción (${(tasa * 100).toFixed(1)}%)`);
});

test('el que juega una jugada prestada la juega con menos oficio', () => {
    // Es la otra mitad del cruce: sin esto, recibir un Momento ajeno sería
    // gratis y el puesto dejaría de significar algo.
    assert.equal(proficiencyFor('jackal', 'tercera-linea'), 1);
    assert.ok(proficiencyFor('jackal', 'wing-fullback') < 1);
    assert.equal(proficiencyFor('palos', 'apertura'), 1);
    assert.ok(proficiencyFor('palos', 'primera-linea') < 1);
    // El tackle es transversal: lo juegan los quince con el mismo oficio.
    for (const family of ALL_FAMILIES) {
        assert.equal(proficiencyFor('tackle', family), 1, `${family} tacklea con oficio prestado`);
    }
});

test('las semillas del minijuego no se repiten entre kind, temporada ni jugada', () => {
    const vistas = new Set<number>();
    for (const kind of ['tackle', 'jackal'] as const) {
        for (let season = 1; season <= 20; season += 1) {
            for (let idx = 0; idx < 3; idx += 1) {
                const seed = momentSeed(4242, kind, season, idx);
                assert.ok(!vistas.has(seed), `semilla repetida en ${kind}:${season}:${idx}`);
                vistas.add(seed);
            }
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  4 · EL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

test('cada def declara el kind con el que está indexada y su setup lo repite', () => {
    // Es lo que hace HONESTO el borrado de genéricos del registry: sin esto, la
    // conversión de `MomentDef<S, I>` a `AnyMomentDef` sería una promesa que
    // nadie verifica.
    for (const def of MOMENT_DEFS) {
        const ctx: MomentSetupCtx = {
            kind: def.kind,
            season: 1,
            minute: 55,
            scoreDelta: 0,
            pressure: 0.5,
            family: 'tercera-linea',
            proficiency: 1,
            attrs: baseAttributes('tercera-linea'),
            bodyDamage: 0,
            seed: momentSeed(1, def.kind, 1, 0),
        };
        assert.equal(def.setup(ctx).kind, def.kind, `${def.kind}: el setup devuelve otro kind`);
        assert.ok(def.weight > 0, `${def.kind}: un peso de cero lo saca del sorteo sin decirlo`);
        assert.ok(def.labelEs.length > 0, `${def.kind}: sin título no hay nada que dibujar`);
        if (def.families !== null) {
            assert.ok(def.families.length > 0, `${def.kind}: lista de familias vacía — usá null si es transversal`);
        }
    }
});

test('LA REGLA DEL statBoost: ningún Momento cobra dos veces su propia gloria', () => {
    // La regla está escrita arriba del registry: `statBoost` es para Momentos
    // cuyo premio NO ES YA la métrica-gloria del puesto. Los cuatro que hay hoy
    // pagan exactamente en la gloria de su familia —penales de scrum, line-outs,
    // turnovers, puntos— así que ninguno puede usarlo: si lo usara, el jugador
    // vería la jugada en la crónica Y otra vez inflada en la planilla de fin de
    // año.
    //
    // Si algún día entra un Momento cuyo premio NO es la gloria de su puesto,
    // se agrega acá a la lista de excepciones CON el motivo escrito. Que haya que
    // tocar este test es la idea: obliga a decir por qué.
    const PUEDEN_USARLO: string[] = [];

    for (const def of MOMENT_DEFS) {
        if (PUEDEN_USARLO.includes(def.kind)) continue;

        const setup = def.setup({
            kind: def.kind,
            season: 3,
            minute: 61,
            scoreDelta: -3,
            pressure: 0.6,
            family: (def.families ?? ALL_FAMILIES)[0],
            proficiency: 1,
            attrs: baseAttributes((def.families ?? ALL_FAMILIES)[0]),
            bodyDamage: 15,
            seed: momentSeed(5150, def.kind, 3, 0),
        });

        // Un abanico de manos que cubre bien y mal en los cinco minijuegos. Las
        // que no correspondan al kind las ignora `resolve` por su propia forma.
        const manos: MomentOutcome[] = [
            { kind: 'jackal', reactions: [10, 10, 10] },
            { kind: 'jackal', reactions: [-90, null, 9_000] },
            { kind: 'ancla', pushes: 0 },
            { kind: 'ancla', pushes: 3 },
            { kind: 'codigo', call: [0, 1, 2, 3] },
            { kind: 'codigo', call: [] },
            { kind: 'palos', aim: 0 },
            { kind: 'palos', aim: 1 },
        ].filter((m) => m.kind === def.kind);

        for (const mano of manos) {
            const { deltas } = def.resolve(setup, mano);
            assert.equal(
                deltas.statBoost,
                undefined,
                `${def.kind} usa statBoost y su premio ya es la gloria de su puesto: estaría cobrando dos veces`,
            );
        }
    }
});

test('una mano que no es de esta jugada no rompe nada', () => {
    // Mismo trato que una opción que no existe: la acción no vale y el estado no
    // se mueve. El chequeo vive en el armazón porque el registry borra los
    // genéricos, y ahí es donde se pierde la garantía de tipos.
    const s = hastaElJackal();
    if (!s) return;
    const conManoDeOtro = captainReducer(s, { type: 'RESOLVE_MOMENT', outcome: { kind: 'tackle', zone: 'legal', at: 0.5 } });
    assert.equal(conManoDeOtro, s, 'una mano de otro Momento movió el estado');
});

// ═══════════════════════════════════════════════════════════════════════════
//  5 · LOS CARRILES
// ═══════════════════════════════════════════════════════════════════════════

test('cada carril de MomentDeltas cae donde dice', () => {
    const base = createInitialCaptain(TERCERA, 11);
    const s: CaptainState = structuredClone({ ...base, fame: 20 });

    applyMomentDeltas(s, {
        fame: 3,
        belonging: 2,
        statBoost: 1,
        sanction: 2,
        playingTime: -1,
        bodyDamage: 5,
        headDamage: 1,
    });

    assert.equal(s.fame, 23);
    assert.ok(s.belonging.byClub[s.player.clubId!] > 0, 'la Pertenencia no se movió');
    assert.equal(s.pendingStatBoost, 1);
    assert.equal(s.pendingSanction, 2);
    assert.equal(s.pendingPlayingTime, -1);
    assert.equal(s.damage.cuerpo, 5);
    assert.ok(s.damage.cabeza > 0, 'el HIA no se contó');
});

test('la cabeza no baja ni aunque un Momento lo pida', () => {
    // La regla vive en `damage.ts` y este test la mira DESDE el carril de los
    // Momentos: un delta negativo tiene que ser inofensivo por acá también.
    const s = structuredClone(createInitialCaptain(TERCERA, 11));
    applyMomentDeltas(s, { headDamage: 2 });
    const despues = s.damage.cabeza;
    applyMomentDeltas(s, { headDamage: -5 });
    assert.equal(s.damage.cabeza, despues);
});
