// Peso de eventos por entorno y ruta (Fase 4).
//
// La regla de diseño que estos tests protegen es "MOVER LA FRECUENCIA, NUNCA
// FILTRAR DURO": un amateur tiene que poder recibir un evento de club, solo que
// mucho menos seguido que uno de entorno. Si algún día alguien convierte el
// boost en un filtro, el test de cobertura de abajo se pone en rojo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { familyBoost, runCareer, hashSeed, type Chooser } from '../../index.ts';
import type { CareerState, StartRouteId } from '../../types/career.ts';
import type { EmploymentStatus, SquadTrack } from '../contracts.ts';

/** Estado mínimo con lo único que `familyBoost` mira. */
function stateWith(opts: {
    employment: EmploymentStatus;
    startRoute: StartRouteId;
    seasonsPlayed: number;
    squadTrack?: SquadTrack;
}): CareerState {
    return {
        startRoute: opts.startRoute,
        player: {
            employment: opts.employment,
            squadTrack: opts.squadTrack ?? 'senior',
            seasonsPlayed: opts.seasonsPlayed,
        },
    } as unknown as CareerState;
}

test('el boost es una función pura y estable', () => {
    const s = stateWith({ employment: 'amateur', startRoute: 'development', seasonsPlayed: 2 });
    assert.equal(familyBoost('env-amateur-derby', s), familyBoost('env-amateur-derby', s));
});

test('un id sin familia conocida no recibe boost', () => {
    const s = stateWith({ employment: 'amateur', startRoute: 'development', seasonsPlayed: 0 });
    assert.equal(familyBoost('vaya-a-saber-que', s), 1);
    assert.equal(familyBoost('singuion', s), 1);
});

test('el amateur ve más entorno y vida, y menos prensa y selección', () => {
    const s = stateWith({ employment: 'amateur', startRoute: 'development', seasonsPlayed: 1 });
    assert.ok(familyBoost('env-amateur-commute', s) > 1.5, 'el entorno tiene que pesar más');
    assert.ok(familyBoost('per-family', s) > 1.5, 'la vida personal tiene que pesar más');
    assert.ok(familyBoost('med-sponsor', s) < 0.5, 'la prensa tiene que pesar menos');
    assert.ok(familyBoost('nt-captaincy', s) < 0.7, 'la selección tiene que pesar menos');
});

test('el profesional ve más selección y prensa que el amateur', () => {
    const amateur = stateWith({ employment: 'amateur', startRoute: 'development', seasonsPlayed: 6 });
    const pro = stateWith({ employment: 'full-time-professional', startRoute: 'professional', seasonsPlayed: 6 });
    assert.ok(familyBoost('nt-captaincy', pro) > familyBoost('nt-captaincy', amateur));
    assert.ok(familyBoost('med-sponsor', pro) > familyBoost('med-sponsor', amateur));
    assert.ok(familyBoost('env-amateur-commute', amateur) > familyBoost('env-amateur-commute', pro));
});

test('NINGÚN boost llega a cero: el peso se mueve, no se filtra', () => {
    const families = ['env', 'club', 'per', 'mil', 'nt', 'tac', 'med', 'inj'];
    const employments: EmploymentStatus[] = ['amateur', 'amateur-compensated', 'semi-professional', 'full-time-professional'];
    const routes: StartRouteId[] = ['development', 'professional'];

    for (const employment of employments) {
        for (const startRoute of routes) {
            for (const squadTrack of ['senior', 'development'] as SquadTrack[]) {
                for (const seasonsPlayed of [0, 3, 8]) {
                    const s = stateWith({ employment, startRoute, seasonsPlayed, squadTrack });
                    for (const f of families) {
                        const boost = familyBoost(`${f}-lo-que-sea`, s);
                        assert.ok(
                            boost > 0 && Number.isFinite(boost),
                            `${employment}/${startRoute}/${squadTrack}/${seasonsPlayed} anuló la familia ${f} (boost ${boost})`,
                        );
                    }
                }
            }
        }
    }
});

test('la RAMA no pesa: el boost sale del entorno vivo y de nada más', () => {
    // Acá se protegia lo contrario: que la ruta empujara al principio y se
    // diluyera hacia la temporada 5. Ese eje se fue en 1.26.0 porque dejó de decir
    // nada — las dos ramas arrancan en el MISMO mundo (18 años, club amateur, sin
    // contrato), así que un boost indexado por rama era un multiplicador constante
    // disfrazado de tabla.
    //
    // El invariante nuevo es el simétrico, y es el que impide que alguien lo
    // reintroduzca sin darse cuenta: con el mismo entorno, la rama NO puede mover
    // la frecuencia de ninguna familia, ni al debutar ni diez temporadas después.
    for (const seasonsPlayed of [0, 2, 5, 10]) {
        const larga = stateWith({ employment: 'semi-professional', startRoute: 'development', seasonsPlayed });
        const rapida = stateWith({ employment: 'semi-professional', startRoute: 'professional', seasonsPlayed });
        for (const f of ['env', 'club', 'per', 'mil', 'nt', 'tac', 'med', 'inj']) {
            assert.equal(
                familyBoost(`${f}-lo-que-sea`, larga),
                familyBoost(`${f}-lo-que-sea`, rapida),
                `la rama movió la familia ${f} en la temporada ${seasonsPlayed}`,
            );
        }
    }
});

test('pasada la ventana de dilución, manda el entorno y no la ruta sellada', () => {
    // El que arrancó amateur y llegó a profesional tiene que ver el mundo
    // profesional, no seguir diez temporadas en el amateur.
    const subio = stateWith({ employment: 'full-time-professional', startRoute: 'development', seasonsPlayed: 10 });
    const nacioAdentro = stateWith({ employment: 'full-time-professional', startRoute: 'professional', seasonsPlayed: 10 });
    for (const f of ['env', 'nt', 'med', 'per']) {
        assert.equal(
            familyBoost(`${f}-lo-que-sea`, subio),
            familyBoost(`${f}-lo-que-sea`, nacioAdentro),
            `la ruta sellada seguía pesando en la familia ${f} diez temporadas después`,
        );
    }
});

// ── Efecto observable sobre carreras completas ───────────────────────────────

const rotatingChooser: Chooser = (event, state) => {
    const idx = hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length;
    return event.options[idx].id;
};

function familyShare(route: StartRouteId, runs: number): Map<string, number> {
    const counts = new Map<string, number>();
    let total = 0;
    for (let i = 0; i < runs; i++) {
        const state = runCareer(
            { position: (['flyhalf', 'prop', 'wing', 'lock'] as const)[i % 4], nationalityCountryCode: 'ar', startRoute: route },
            4000 + i * 41,
            rotatingChooser,
        );
        for (const d of state.decisionLog) {
            const f = d.eventId.slice(0, d.eventId.indexOf('-'));
            counts.set(f, (counts.get(f) ?? 0) + 1);
            total++;
        }
    }
    for (const [k, v] of counts) counts.set(k, v / total);
    return counts;
}

test('el ENTORNO manda: el amateur ve más vida y menos prensa que el profesional', () => {
    // Se medía por ruta y ahora se mide por lo único que quedo importando: el
    // escalón de empleo. Es la misma regla de diseño —mover la frecuencia, nunca
    // filtrar duro— comprobada sobre el eje correcto.
    const amateur = stateWith({ employment: 'amateur', startRoute: 'development', seasonsPlayed: 1 });
    const pro = stateWith({ employment: 'full-time-professional', startRoute: 'development', seasonsPlayed: 8 });

    assert.ok(
        familyBoost('env-lo-que-sea', amateur) > familyBoost('env-lo-que-sea', pro),
        'el amateur tiene que ver más entorno que el profesional',
    );
    assert.ok(
        familyBoost('per-lo-que-sea', amateur) > familyBoost('per-lo-que-sea', pro),
        'y más vida personal',
    );
    assert.ok(
        familyBoost('med-lo-que-sea', pro) > familyBoost('med-lo-que-sea', amateur),
        'el profesional tiene que ver más prensa',
    );
});

test('la mezcla de eventos de una carrera cubre TODAS las familias', () => {
    // No es un filtro: sobre carreras completas tienen que aparecer las ocho
    // familias, venga el jugador de donde venga.
    for (const rama of ['development', 'professional'] as const) {
        const mezcla = familyShare(rama, 60);
        for (const f of ['env', 'club', 'per', 'tac', 'inj']) {
            assert.ok((mezcla.get(f) ?? 0) > 0, `la rama ${rama} nunca vio un evento de la familia ${f}`);
        }
    }
});
