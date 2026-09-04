import test from 'node:test';
import assert from 'node:assert/strict';

import {
    NATIONAL_TEAM_LINK_PROVIDER,
    getNationalTeamLinksForClub,
    nationalTeamLinkKey,
    nationalTeamLinkKeysForRef,
    parseNationalTeamLinkKey,
    resolveLinkedNationalTeamClub,
} from './nationalTeamLinks.ts';

/**
 * Un `club_external_ids` de mentira: guarda filas y contesta las dos consultas
 * que hace el módulo. No valida nada más que lo que el módulo le pide, que es
 * justo lo que hay que probar: el filtro por proveedor no se puede olvidar.
 */
function baseFalsa(filas: Array<{ provider: string; external_id: string; club_id: string }>) {
    return {
        from(tabla: string) {
            assert.equal(tabla, 'club_external_ids');
            const estado: { provider?: string; ids?: string[]; clubId?: string } = {};
            const query: any = {
                select: () => query,
                eq(columna: string, valor: string) {
                    if (columna === 'provider') estado.provider = valor;
                    if (columna === 'club_id') estado.clubId = valor;
                    return query;
                },
                in(columna: string, valores: string[]) {
                    assert.equal(columna, 'external_id');
                    estado.ids = valores;
                    return query;
                },
                then(resolve: (r: { data: unknown; error: null }) => void) {
                    const data = filas.filter((f) => (
                        (!estado.provider || f.provider === estado.provider)
                        && (!estado.ids || estado.ids.includes(f.external_id))
                        && (!estado.clubId || f.club_id === estado.clubId)
                    ));
                    resolve({ data, error: null });
                },
            };
            return query;
        },
    };
}

const ARG_F = { provider: 'fih', external_id: 'w|ARG', club_id: 'seleccion-argentina-femenina-de-hockey' };
const ARG_M = { provider: 'fih', external_id: 'm|ARG', club_id: 'seleccion-argentina-masculina-de-hockey' };

test('la llave guarda el genero y el pais, no la edicion del Mundial', () => {
    // El ref del feed cambia de edicion en edicion (1867 es el Mundial Femenino
    // 2026); el par (genero, pais) no. Por eso se guarda el par.
    assert.equal(nationalTeamLinkKey('w', 'arg'), 'w|ARG');
    assert.deepEqual(parseNationalTeamLinkKey('w|ARG'), { key: 'w', code: 'ARG' });
    assert.deepEqual(parseNationalTeamLinkKey(' m|ned '), { key: 'm', code: 'NED' });

    assert.equal(parseNationalTeamLinkKey('w|ARGENTINA'), null, 'el codigo es de tres letras');
    assert.equal(parseNationalTeamLinkKey('x|ARG'), null, 'no hay tercer genero en el feed');
    assert.equal(parseNationalTeamLinkKey('ARG'), null, 'sin genero no es una llave');
    assert.equal(parseNationalTeamLinkKey(null), null);
});

test('un ref con genero busca una llave; uno sin genero, las dos', () => {
    assert.deepEqual(nationalTeamLinkKeysForRef('fih-wc-1867-ARG'), ['w|ARG']);
    assert.deepEqual(nationalTeamLinkKeysForRef('fih-wc-1866-ARG'), ['m|ARG']);
    // El viejo id de las filas de partidos no dice el genero.
    assert.deepEqual(nationalTeamLinkKeysForRef('fih-team-arg'), ['m|ARG', 'w|ARG']);
    // Lo que no nombra a una seleccion no busca nada.
    assert.deepEqual(nationalTeamLinkKeysForRef('los-tilos'), []);
    assert.deepEqual(nationalTeamLinkKeysForRef(null), []);
});

test('el ref del Mundial cae en la ficha de la base de ESE genero', async () => {
    const db = baseFalsa([ARG_F, ARG_M]);

    const femenina = await resolveLinkedNationalTeamClub(db, 'fih-wc-1867-ARG');
    assert.equal(femenina?.clubId, 'seleccion-argentina-femenina-de-hockey');
    assert.equal(femenina?.key, 'w');
    assert.equal(femenina?.ref, 'fih-wc-1867-ARG', 'el ref vuelve normalizado');

    const masculina = await resolveLinkedNationalTeamClub(db, 'fih-wc-1866-ARG');
    assert.equal(masculina?.clubId, 'seleccion-argentina-masculina-de-hockey');

    // Las dos ramas son equipos distintos: nunca comparten ficha.
    assert.notEqual(femenina?.clubId, masculina?.clubId);
});

test('sin genero y con las dos fichas vinculadas no se elige ninguna', async () => {
    // `fih-team-ARG` no dice si es Las Leonas o Los Leones. Adivinar seria
    // mandar a la gente al equipo equivocado: se queda con la ficha del feed,
    // que muestra las dos competencias.
    const conLasDos = await resolveLinkedNationalTeamClub(baseFalsa([ARG_F, ARG_M]), 'fih-team-ARG');
    assert.equal(conLasDos, null);

    // Con una sola vinculada no hay ambiguedad y si resuelve.
    const soloFemenina = await resolveLinkedNationalTeamClub(baseFalsa([ARG_F]), 'fih-team-ARG');
    assert.equal(soloFemenina?.clubId, 'seleccion-argentina-femenina-de-hockey');
});

test('un pais sin ficha en la base sigue viviendo en el feed', async () => {
    const db = baseFalsa([ARG_F, ARG_M]);
    assert.equal(await resolveLinkedNationalTeamClub(db, 'fih-wc-1867-JPN'), null);
    assert.equal(await resolveLinkedNationalTeamClub(db, 'seleccion-argentina-femenina-de-hockey'), null,
        'el id de un club no es un ref del feed');
});

test('el vinculo no se lee de otro proveedor', async () => {
    // `w|ARG` como alias de la AAMH es otra cosa: sin el filtro por proveedor,
    // un alias ajeno se leeria como una seleccion.
    const ajena = baseFalsa([{ provider: 'aamh', external_id: 'w|ARG', club_id: 'otro-club' }]);
    assert.equal(await resolveLinkedNationalTeamClub(ajena, 'fih-wc-1867-ARG'), null);
    assert.equal(NATIONAL_TEAM_LINK_PROVIDER, 'fih');
});

test('desde el club se llega a sus refs del feed', async () => {
    const db = baseFalsa([ARG_F, ARG_M]);
    const links = await getNationalTeamLinksForClub(db, 'seleccion-argentina-femenina-de-hockey');
    assert.deepEqual(links, [{
        key: 'w',
        code: 'ARG',
        clubId: 'seleccion-argentina-femenina-de-hockey',
        ref: 'fih-wc-1867-ARG',
    }]);

    // Un club cualquiera no tiene vinculo, y eso no es un error.
    assert.deepEqual(await getNationalTeamLinksForClub(db, 'los-tilos'), []);
    assert.deepEqual(await getNationalTeamLinksForClub(db, ''), []);
});
