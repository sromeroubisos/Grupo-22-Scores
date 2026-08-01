// TOKEN DE CARRERA COMPARTIBLE.
//
// La promesa del link es fuerte: el que lo abre tiene que ver EXACTAMENTE la
// carrera que jugó el que lo compartió. Como el token lleva la receta y no el
// resultado, esa promesa se apoya entera en el determinismo del motor. Estos
// tests la verifican de punta a punta en vez de darla por hecha.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildCareerSummary, decodeCareerToken, encodeCareerToken, ENGINE_VERSION, recipeFromCareer,
    replayRecipe, runCareer, acceptBestEligibleOfferChooser, hashSeed, startClubChoices,
    type CareerRecipe, type Chooser,
} from '../../index.ts';
import type { CreatePlayerInput } from '../create-player.ts';

const rotatingChooser: Chooser = (event, state) =>
    event.options[hashSeed(`${event.id}:${state.player.seasonsPlayed}`) % event.options.length].id;

interface Case { name: string; input: CreatePlayerInput; seed: number; chooser: Chooser }

const CASES: Case[] = [
    // Una carrera que se queda siempre, una que se mueve siempre y una mixta:
    // el diccionario del token se comporta distinto en cada una.
    { name: 'apertura argentino (mixta)', input: { position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: 'development', surname: 'Ledesma', number: 10 }, seed: 20260726, chooser: rotatingChooser },
    { name: 'pilar neozelandés (siempre se queda)', input: { position: 'prop', nationalityCountryCode: 'nz', startRoute: 'professional', paceMode: 'express' }, seed: 424242, chooser: (e) => e.options[0].id },
    { name: 'wing francés (siempre se va)', input: { position: 'wing', nationalityCountryCode: 'fr', startRoute: 'development', paceMode: 'normal', surname: 'Ñandú' }, seed: 7919, chooser: acceptBestEligibleOfferChooser },
];

function played({ input, seed, chooser }: Case) {
    return runCareer(input, seed, chooser);
}

test('ida y vuelta: el token decodifica a la misma receta', () => {
    for (const c of CASES) {
        const recipe = recipeFromCareer(played(c));
        const result = decodeCareerToken(encodeCareerToken(recipe));
        assert.equal(result.kind, 'ok', `${c.name}: el token no decodificó`);
        if (result.kind !== 'ok') continue;
        assert.deepEqual(result.recipe, recipe, `${c.name}: la receta cambió en el viaje`);
    }
});

test('el link reproduce la MISMA carrera, no una parecida', () => {
    for (const c of CASES) {
        const original = played(c);
        const decoded = decodeCareerToken(encodeCareerToken(recipeFromCareer(original)));
        assert.equal(decoded.kind, 'ok');
        if (decoded.kind !== 'ok') continue;

        const replay = replayRecipe(decoded.recipe);
        assert.equal(replay.kind, 'ok', `${c.name}: la receta divergió al re-correrse`);
        if (replay.kind !== 'ok') continue;

        // El estado entero, no un puñado de campos elegidos a dedo.
        assert.deepEqual(replay.state, original, `${c.name}: la carrera reconstruida no es la misma`);
        assert.deepEqual(
            buildCareerSummary(replay.state), buildCareerSummary(original),
            `${c.name}: el resumen compartido no coincide con el jugado`,
        );
    }
});

test('el apellido sobrevive al viaje, con acentos y eñes', () => {
    // El apellido lo escribe el jugador y va a una URL: si el códec no maneja
    // UTF-8, "Ñandú" vuelve roto en la tarjeta que se comparte.
    const base = recipeFromCareer(played(CASES[0]));
    for (const surname of ['Ñandú', 'Sáenz Peña', 'Bruno', 'Ōtaki']) {
        const decoded = decodeCareerToken(encodeCareerToken({ ...base, surname }));
        assert.equal(decoded.kind, 'ok');
        if (decoded.kind !== 'ok') continue;
        assert.equal(decoded.recipe.surname, surname);
    }
});

test('el token es URL-safe y no necesita escaparse', () => {
    for (const c of CASES) {
        const token = encodeCareerToken(recipeFromCareer(played(c)));
        assert.match(token, /^[A-Za-z0-9_-]+$/, `${c.name}: el token lleva caracteres que hay que escapar`);
        assert.equal(encodeURIComponent(token), token, `${c.name}: la URL lo reescribiría`);
    }
});

test('el diccionario paga: una carrera que se queda siempre no repite el id', () => {
    for (const c of CASES) {
        const recipe = recipeFromCareer(played(c));
        assert.ok(recipe.decisions.length >= 5, `${c.name}: sin decisiones la prueba no significa nada`);

        const token = encodeCareerToken(recipe);
        // MISMO payload, misma serialización, mismo base64: lo único que cambia
        // es guardar los ids repetidos en vez del diccionario. Así la
        // comparación mide el diccionario y no el encoding.
        const payload = JSON.parse(tokenJson(token));
        const flat = jsonToken(JSON.stringify({
            ...payload, k: recipe.decisions, d: recipe.decisions.map((_, i) => i),
        }));

        assert.ok(
            token.length <= flat.length,
            `${c.name}: el token (${token.length}) no comprime frente a repetir los ids (${flat.length})`,
        );
        // Y el link tiene que seguir siendo pegable en un chat.
        assert.ok(token.length < 1200, `${c.name}: el token quedó en ${token.length} caracteres`);
    }
});

test('un token de otro motor NO se aproxima: devuelve el recibo', () => {
    for (const c of CASES) {
        const original = played(c);
        const recipe = recipeFromCareer(original);
        assert.equal(decodeCareerToken(encodeCareerToken(recipe)).kind, 'ok', 'control: el token sano decodifica');

        const result = decodeCareerToken(encodeStaleToken(recipe, '0.0.1-viejo'));
        assert.equal(result.kind, 'engine-mismatch', `${c.name}: un motor distinto tiene que notarse`);
        if (result.kind !== 'engine-mismatch') continue;

        assert.equal(result.tokenEngine, '0.0.1-viejo');
        assert.equal(result.currentEngine, ENGINE_VERSION);

        // Lo que importa: el link NO muere. Trae la identidad y el recibo, y lo
        // que trae coincide con lo que la carrera fue de verdad.
        const summary = buildCareerSummary(original);
        assert.equal(result.identity.surname, original.player.surname);
        assert.equal(result.identity.position, original.player.position);
        assert.deepEqual(result.receipt, {
            archetype: summary.archetype.label,
            caps: summary.caps,
            seasons: summary.seasons,
            peakOvr: summary.peakOvr,
        }, `${c.name}: el recibo no dice lo que la carrera fue`);
    }
});

test('el recibo dice la verdad de la carrera, no una aproximación', () => {
    // Si el recibo se armara con datos derivados al vuelo en vez de con el
    // resumen real, este test lo agarra: se compara contra la carrera jugada.
    for (const c of CASES) {
        const original = played(c);
        const summary = buildCareerSummary(original);
        const receipt = recipeFromCareer(original).receipt;
        assert.ok(receipt !== null);
        assert.equal(receipt.seasons, summary.seasons);
        assert.equal(receipt.caps, summary.caps);
        assert.equal(receipt.peakOvr, summary.peakOvr);
        assert.equal(receipt.archetype, summary.archetype.label);
        assert.ok(receipt.archetype.length > 0, `${c.name}: el titular no puede venir vacío`);
    }
});

test('un token anterior al recibo sigue decodificando', () => {
    // El recibo es ADITIVO: se agregó sin subir SHARE_TOKEN_VERSION, así que un
    // token emitido antes tiene que seguir abriendo la carrera entera.
    const recipe = recipeFromCareer(played(CASES[0]));
    const sinRecibo = jsonToken(
        JSON.stringify({ ...JSON.parse(tokenJson(encodeCareerToken(recipe))), b: undefined }),
    );

    const result = decodeCareerToken(sinRecibo);
    assert.equal(result.kind, 'ok', 'un token sin recibo no es un token roto');
    if (result.kind !== 'ok') return;
    assert.equal(result.recipe.receipt, null, 'y se nota que no lo trae');
    assert.equal(replayRecipe(result.recipe).kind, 'ok', 'la carrera se reconstruye igual');
});

test('el club ELEGIDO viaja: sin él la carrera se reconstruye en otro club', () => {
    // El agujero real: `startClubId` es una entrada del motor que el jugador elige
    // y durante un tiempo NO viajaba en la receta. El token decodificaba bien, el
    // motor coincidía, y el replay sorteaba OTRO club de arranque: divergía toda la
    // carrera y el link caía al recibo. El que compartía veía su tarjeta completa en
    // pantalla y bajaba la de otro jugador.
    const club = startClubChoices('ar')[3].id;
    const input: CreatePlayerInput = {
        position: 'flyhalf', nationalityCountryCode: 'ar', startRoute: 'club',
        paceMode: 'normal', surname: 'Prueba', number: 10, startClubId: club,
    };
    const recipe = recipeFromCareer(runCareer(input, 20260801, (e) => e.options[0].id));

    assert.equal(recipe.startClubId, club, 'la receta tiene que llevar el club elegido');
    assert.equal(replayRecipe(recipe).kind, 'ok', 'con el club, la carrera se reconstruye entera');

    // El control negativo: es ESTE campo el que sostiene la reconstrucción, no otra cosa.
    assert.equal(
        replayRecipe({ ...recipe, startClubId: undefined }).kind,
        'diverged',
        'sin el club el motor sortea otro y la carrera ya no es la misma',
    );

    // Y sobrevive el viaje por el token, que es donde tiene que llegar.
    const vuelta = decodeCareerToken(encodeCareerToken(recipe));
    assert.equal(vuelta.kind, 'ok');
    if (vuelta.kind !== 'ok') return;
    assert.equal(vuelta.recipe.startClubId, club, 'el club no puede perderse al codificar');
    assert.equal(replayRecipe(vuelta.recipe).kind, 'ok');
});

test('un token anterior al club elegido sigue reconstruyendo', () => {
    // `startClubId` es ADITIVO como el recibo: se agregó sin subir
    // SHARE_TOKEN_VERSION. Un token de antes no lo trae y tiene que caer al sorteo,
    // que es exactamente lo que hacía cuando se generó.
    const recipe = recipeFromCareer(played(CASES[0]));
    const sinClub = jsonToken(
        JSON.stringify({ ...JSON.parse(tokenJson(encodeCareerToken(recipe))), g: undefined }),
    );

    const result = decodeCareerToken(sinClub);
    assert.equal(result.kind, 'ok', 'un token sin club no es un token roto');
    if (result.kind !== 'ok') return;
    assert.equal(result.recipe.startClubId, undefined, 'y se nota que no lo trae');
});

test('el costo del recibo se mantiene acotado', () => {
    // El número que justificó la decisión: ~73 caracteres medidos sobre carreras
    // reales. Si alguien engorda el recibo, que se entere acá y no en un chat.
    for (const c of CASES) {
        const recipe = recipeFromCareer(played(c));
        const conRecibo = encodeCareerToken(recipe).length;
        const sinRecibo = encodeCareerToken({ ...recipe, receipt: null }).length;
        assert.ok(
            conRecibo - sinRecibo <= 120,
            `${c.name}: el recibo pasó a costar ${conRecibo - sinRecibo} caracteres`,
        );
    }
});

test('basura, token cortado y token vacío no explotan', () => {
    const token = encodeCareerToken(recipeFromCareer(played(CASES[0])));
    const casos: [string, string][] = [
        ['vacío', ''],
        ['basura', 'no-soy-un-token'],
        ['cortado a la mitad', token.slice(0, Math.floor(token.length / 2))],
        ['con un carácter ajeno', `${token}$`],
        ['solo el final', token.slice(-10)],
    ];
    for (const [name, value] of casos) {
        const result = decodeCareerToken(value);
        assert.ok(
            result.kind === 'malformed' || result.kind === 'engine-mismatch',
            `${name}: tendría que rechazarse, devolvió ${result.kind}`,
        );
    }
});

// ── Utilidades del test: abrir y rearmar un token a mano ─────────────────────
//
// Existen para poder fabricar tokens que el códec NO produce (uno de otro
// motor, uno sin diccionario). No reimplementan el códec: sólo el base64url,
// que es la parte mecánica.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** El JSON crudo que hay dentro de un token. */
function tokenJson(token: string): string {
    const bytes: number[] = [];
    let acc = 0, bits = 0;
    for (const ch of token) {
        acc = (acc << 6) | B64.indexOf(ch);
        bits += 6;
        if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
    }
    return Buffer.from(bytes).toString('utf8');
}

/** El token que corresponde a un JSON crudo. */
function jsonToken(json: string): string {
    const bytes = [...Buffer.from(json, 'utf8')];
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
        out += B64[a >> 2];
        out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
        if (b === undefined) break;
        out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
        if (c === undefined) break;
        out += B64[c & 63];
    }
    return out;
}

/** Reconstruye un token con otra `ENGINE_VERSION`, como uno guardado hace meses. */
function encodeStaleToken(recipe: CareerRecipe, engineVersion: string): string {
    const json = tokenJson(encodeCareerToken(recipe))
        .replace(`"e":"${ENGINE_VERSION}"`, `"e":"${engineVersion}"`);
    return jsonToken(json);
}
