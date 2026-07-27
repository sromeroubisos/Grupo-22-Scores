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
    const s = stateWith({ employment: 'amateur', startRoute: 'amateur', seasonsPlayed: 2 });
    assert.equal(familyBoost('env-amateur-derby', s), familyBoost('env-amateur-derby', s));
});

test('un id sin familia conocida no recibe boost', () => {
    const s = stateWith({ employment: 'amateur', startRoute: 'amateur', seasonsPlayed: 0 });
    assert.equal(familyBoost('vaya-a-saber-que', s), 1);
    assert.equal(familyBoost('singuion', s), 1);
});

test('el amateur ve más entorno y vida, y menos prensa y selección', () => {
    const s = stateWith({ employment: 'amateur', startRoute: 'amateur', seasonsPlayed: 1 });
    assert.ok(familyBoost('env-amateur-commute', s) > 1.5, 'el entorno tiene que pesar más');
    assert.ok(familyBoost('per-family', s) > 1.5, 'la vida personal tiene que pesar más');
    assert.ok(familyBoost('med-sponsor', s) < 0.5, 'la prensa tiene que pesar menos');
    assert.ok(familyBoost('nt-captaincy', s) < 0.7, 'la selección tiene que pesar menos');
});

test('el profesional ve más selección y prensa que el amateur', () => {
    const amateur = stateWith({ employment: 'amateur', startRoute: 'amateur', seasonsPlayed: 6 });
    const pro = stateWith({ employment: 'full-time-professional', startRoute: 'professional', seasonsPlayed: 6 });
    assert.ok(familyBoost('nt-captaincy', pro) > familyBoost('nt-captaincy', amateur));
    assert.ok(familyBoost('med-sponsor', pro) > familyBoost('med-sponsor', amateur));
    assert.ok(familyBoost('env-amateur-commute', amateur) > familyBoost('env-amateur-commute', pro));
});

test('NINGÚN boost llega a cero: el peso se mueve, no se filtra', () => {
    const families = ['env', 'club', 'per', 'mil', 'nt', 'tac', 'med', 'inj'];
    const employments: EmploymentStatus[] = ['amateur', 'amateur-compensated', 'semi-professional', 'full-time-professional'];
    const routes: StartRouteId[] = ['amateur', 'development', 'professional'];

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

test('el empujón de la ruta se diluye con las temporadas', () => {
    // Mismo entorno, distinta antigüedad: al principio la ruta amateur empuja
    // el entorno; para la temporada 5 ya no aporta nada por sí sola.
    const debut = stateWith({ employment: 'semi-professional', startRoute: 'amateur', seasonsPlayed: 0 });
    const veterano = stateWith({ employment: 'semi-professional', startRoute: 'amateur', seasonsPlayed: 5 });
    assert.ok(
        familyBoost('env-lo-que-sea', debut) > familyBoost('env-lo-que-sea', veterano),
        'la ruta inicial tiene que pesar más al principio de la carrera',
    );
});

test('pasada la ventana de dilución, manda el entorno y no la ruta sellada', () => {
    // El que arrancó amateur y llegó a profesional tiene que ver el mundo
    // profesional, no seguir diez temporadas en el amateur.
    const subio = stateWith({ employment: 'full-time-professional', startRoute: 'amateur', seasonsPlayed: 10 });
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

test('la ruta amateur produce una mezcla de eventos distinta de la profesional', () => {
    const amateur = familyShare('amateur', 60);
    const pro = familyShare('professional', 60);

    assert.ok(
        (amateur.get('env') ?? 0) > (pro.get('env') ?? 0),
        'la ruta amateur tiene que ver más eventos de entorno que la profesional',
    );
    assert.ok(
        (pro.get('med') ?? 0) > (amateur.get('med') ?? 0),
        'la ruta profesional tiene que ver más prensa que la amateur',
    );
});

test('la ruta amateur igual puede ver eventos de otras familias', () => {
    const amateur = familyShare('amateur', 60);
    // No es un filtro: club, táctica y lesiones tienen que seguir apareciendo.
    for (const f of ['club', 'tac', 'inj']) {
        assert.ok((amateur.get(f) ?? 0) > 0, `la ruta amateur nunca vio un evento de la familia ${f}`);
    }
});
