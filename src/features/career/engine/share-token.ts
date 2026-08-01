// TOKEN DE CARRERA COMPARTIBLE.
//
// El link NO lleva el resultado: lleva la RECETA. Semilla, jugador y decisiones
// en orden. El servidor vuelve a correr el motor y obtiene la misma carrera,
// porque eso es exactamente lo que el motor garantiza (CLAUDE.md §1). No hace
// falta tabla, ni id, ni moderar nada que no haya escrito ya el propio jugador.
//
// El token SELLA la versión del motor que lo produjo. Si mañana cambia
// `ENGINE_VERSION`, la receta ya no reconstruye esa carrera: el token no se
// "arregla" ni se adivina, se responde con `engine-mismatch` y la UI lo dice.
// Es la misma regla que `loadCareer()` con `'outdated'` — un link viejo nunca
// muestra una carrera que no es la que se jugó.
//
// Sin `btoa` ni `Buffer`: el códec tiene que correr igual en el navegador, en
// una route handler y en un test de Node sin DOM.

import type { CareerState, PaceModeId, StartRouteId } from '../types/career.ts';
import type { Position } from '../types/player.ts';
import { ENGINE_VERSION } from '../types/career.ts';
import type { CreatePlayerInput } from './create-player.ts';
import { runCareer } from './run-career.ts';
import { buildCareerSummary } from './statistics.ts';

/**
 * Formato del token. Sube cuando cambia la FORMA del payload, no el motor.
 *
 * El RECIBO (`b`) se agregó después y NO subió la versión: es aditivo, y un
 * token anterior sigue decodificando entero — sólo se queda sin respaldo. Subir
 * la versión habría roto todos los links para no ganar nada.
 */
export const SHARE_TOKEN_VERSION = 1;

/**
 * RECIBO: lo que era cierto al momento de compartir.
 *
 * No duplica la verdad viva —cuando el motor coincide, la carrera se reconstruye
 * entera y el recibo ni se mira—. Existe porque un link compartido vive en un
 * chat para siempre y el próximo cambio de `ENGINE_VERSION` los mataría a todos
 * de una vez. Con esto el link no muere: se degrada a lo que decía cuando se
 * compartió, que es justo lo que un link compartido debería preservar.
 */
export interface CareerReceipt {
    archetype: string;
    caps: number;
    seasons: number;
    peakOvr: number;
}

/** Lo que identifica al jugador. Viaja igual, con motor o sin motor. */
export interface ShareIdentity {
    surname: string;
    position: Position;
    nationalityCountryCode: string;
}

/** Receta completa de una carrera: alcanza para reconstruirla entera. */
export interface CareerRecipe {
    seed: number;
    position: Position;
    nationalityCountryCode: string;
    startRoute: StartRouteId;
    paceMode: PaceModeId;
    surname: string;
    number: number;
    /**
     * Club donde arrancó. VIAJA porque el jugador lo puede ELEGIR, y sin él la
     * receta no reconstruye la carrera: el motor sortea otro club y desde ahí
     * diverge todo. Es aditivo como el recibo — un token anterior lo trae
     * `undefined` y cae al sorteo, que es exactamente lo que hacía.
     *
     * Mandarlo NO cambia el resultado de una carrera sorteada: el sorteo se hace
     * igual y la elección solo lo pisa (`createPlayer`), así que el RNG se
     * consume idéntico con club elegido o sin él.
     */
    startClubId?: string;
    /** Ids de opción elegidos, EN ORDEN. */
    decisions: string[];
    /**
     * Respaldo para cuando el motor ya no reconstruya esta carrera. `null` sólo
     * al decodificar un token anterior al recibo: con el motor coincidiendo no
     * hace falta, porque la carrera se reconstruye entera.
     */
    receipt: CareerReceipt | null;
}

export type DecodeResult =
    | { kind: 'ok'; recipe: CareerRecipe }
    | { kind: 'malformed' } // no es un token nuestro, o llegó cortado
    | {
        kind: 'engine-mismatch';
        tokenEngine: string;
        currentEngine: string;
        identity: ShareIdentity;
        /** null sólo en tokens anteriores al recibo. */
        receipt: CareerReceipt | null;
    };

/**
 * Payload serializado. Claves de una letra porque van a una URL que se pega en
 * un chat: cada byte que no está es un byte que no se rompe al cortarse.
 *
 * `d` no guarda los ids sueltos sino un DICCIONARIO más una lista de índices.
 * En una carrera larga "stay" aparece quince veces; repetirlo quince veces es
 * casi la mitad del token.
 */
interface Payload {
    v: number;
    e: string;
    s: number;
    p: Position;
    c: string;
    r: StartRouteId;
    m: PaceModeId;
    n: string;
    u: number;
    k: string[]; // diccionario de ids únicos, en orden de aparición
    d: number[]; // índices dentro de `k`
    /** Club de arranque. Aditivo: los tokens anteriores no lo traen. */
    g?: string;
    /** Recibo. Cuesta ~73 caracteres medidos sobre carreras reales. */
    b?: { a: string; c: number; t: number; o: number };
}

// ── base64url isomórfico ─────────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Bytes(text: string): number[] {
    const out: number[] = [];
    for (const ch of text) {
        let code = ch.codePointAt(0) as number;
        if (code < 0x80) { out.push(code); continue; }
        if (code < 0x800) { out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f)); continue; }
        if (code < 0x10000) { out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f)); continue; }
        out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
    return out;
}

function utf8String(bytes: number[]): string {
    let out = '';
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        let code: number;
        let len: number;
        if (b < 0x80) { code = b; len = 1; }
        else if ((b & 0xe0) === 0xc0) { code = b & 0x1f; len = 2; }
        else if ((b & 0xf0) === 0xe0) { code = b & 0x0f; len = 3; }
        else { code = b & 0x07; len = 4; }
        if (i + len > bytes.length) throw new Error('utf8 cortado');
        for (let j = 1; j < len; j++) code = (code << 6) | (bytes[i + j] & 0x3f);
        out += String.fromCodePoint(code);
        i += len;
    }
    return out;
}

function toBase64Url(bytes: number[]): string {
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

function fromBase64Url(token: string): number[] {
    const bytes: number[] = [];
    let acc = 0;
    let bits = 0;
    for (const ch of token) {
        const v = B64.indexOf(ch);
        if (v < 0) throw new Error('carácter fuera del alfabeto');
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((acc >> bits) & 0xff);
        }
    }
    return bytes;
}

// ── API ──────────────────────────────────────────────────────────────────────

export function encodeCareerToken(recipe: CareerRecipe): string {
    const dictionary: string[] = [];
    const indices = recipe.decisions.map((id) => {
        let at = dictionary.indexOf(id);
        if (at < 0) { at = dictionary.length; dictionary.push(id); }
        return at;
    });

    const payload: Payload = {
        v: SHARE_TOKEN_VERSION,
        e: ENGINE_VERSION,
        s: recipe.seed,
        p: recipe.position,
        c: recipe.nationalityCountryCode,
        r: recipe.startRoute,
        m: recipe.paceMode,
        n: recipe.surname,
        u: recipe.number,
        k: dictionary,
        d: indices,
        ...(recipe.startClubId === undefined ? {} : { g: recipe.startClubId }),
        ...(recipe.receipt === null ? {} : {
            b: {
                a: recipe.receipt.archetype,
                c: recipe.receipt.caps,
                t: recipe.receipt.seasons,
                o: recipe.receipt.peakOvr,
            },
        }),
    };

    return toBase64Url(utf8Bytes(JSON.stringify(payload)));
}

/** Lee el recibo del payload. `null` si el token es anterior o viene roto. */
function readReceipt(payload: Payload): CareerReceipt | null {
    const b = payload.b;
    if (b === undefined || b === null || typeof b !== 'object') return null;
    if (typeof b.a !== 'string' || typeof b.c !== 'number' || typeof b.t !== 'number' || typeof b.o !== 'number') return null;
    return { archetype: b.a, caps: b.c, seasons: b.t, peakOvr: b.o };
}

export function decodeCareerToken(token: string): DecodeResult {
    let payload: Payload;
    try {
        payload = JSON.parse(utf8String(fromBase64Url(token))) as Payload;
    } catch {
        return { kind: 'malformed' };
    }

    if (
        payload === null || typeof payload !== 'object'
        || payload.v !== SHARE_TOKEN_VERSION
        || typeof payload.s !== 'number' || !Number.isFinite(payload.s)
        || typeof payload.p !== 'string' || typeof payload.c !== 'string'
        || typeof payload.r !== 'string' || typeof payload.m !== 'string'
        || typeof payload.n !== 'string' || typeof payload.u !== 'number'
        || !Array.isArray(payload.k) || !Array.isArray(payload.d)
    ) {
        return { kind: 'malformed' };
    }

    const receipt = readReceipt(payload);

    // El motor cambió: la receta ya no reconstruye ESTA carrera. NO se aproxima
    // con la carrera más parecida — se muestra el recibo, que es lo que era
    // cierto al compartir. Va después de la validación de forma para no reportar
    // un desajuste de versión sobre algo que ni siquiera es un token.
    if (payload.e !== ENGINE_VERSION) {
        return {
            kind: 'engine-mismatch',
            tokenEngine: String(payload.e),
            currentEngine: ENGINE_VERSION,
            identity: {
                surname: payload.n,
                position: payload.p,
                nationalityCountryCode: payload.c,
            },
            receipt,
        };
    }


    const decisions: string[] = [];
    for (const at of payload.d) {
        const id = payload.k[at];
        if (typeof id !== 'string') return { kind: 'malformed' };
        decisions.push(id);
    }

    return {
        kind: 'ok',
        recipe: {
            seed: payload.s,
            position: payload.p,
            nationalityCountryCode: payload.c,
            startRoute: payload.r,
            paceMode: payload.m,
            surname: payload.n,
            number: payload.u,
            // Un token anterior a este campo lo trae `undefined` y cae al sorteo, que
            // es lo que hacía cuando se generó: sigue reconstruyendo igual.
            startClubId: typeof payload.g === 'string' && payload.g ? payload.g : undefined,
            decisions,
            receipt,
        },
    };
}

/** El input de creación que corresponde a una receta. */
export function recipeInput(recipe: CareerRecipe): CreatePlayerInput {
    return {
        position: recipe.position,
        nationalityCountryCode: recipe.nationalityCountryCode,
        startRoute: recipe.startRoute,
        paceMode: recipe.paceMode,
        surname: recipe.surname,
        number: recipe.number,
        startClubId: recipe.startClubId,
    };
}

// ── Receta ⇄ carrera ─────────────────────────────────────────────────────────

/** Extrae la receta de una carrera ya jugada, recibo incluido. */
export function recipeFromCareer(state: CareerState): CareerRecipe {
    const summary = buildCareerSummary(state);
    return {
        receipt: {
            archetype: summary.archetype.label,
            caps: summary.caps,
            seasons: summary.seasons,
            peakOvr: summary.peakOvr,
        },
        seed: state.seed,
        position: state.player.position,
        nationalityCountryCode: state.player.eligibility.nationalityCountryCode ?? '',
        startRoute: state.startRoute,
        paceMode: state.paceMode,
        surname: state.player.surname,
        number: state.player.number,
        // El club donde ARRANCÓ, no donde terminó: `state.player.clubId` ya se movió
        // con los pases. La primera entrada de la historia es el club de origen, que
        // es lo único que `createPlayer` necesita para volver a plantar la carrera.
        startClubId: state.history[0]?.clubId,
        decisions: state.decisionLog.map((d) => d.optionId),
    };
}

export type ReplayResult =
    | { kind: 'ok'; state: CareerState }
    /**
     * La receta corrió pero no reprodujo las mismas decisiones. No debería pasar
     * con la misma `ENGINE_VERSION`; si pasa, es un bug de determinismo y se
     * informa como link roto en vez de mostrar una carrera distinta a la que se
     * jugó y hacerla pasar por la del que compartió.
     */
    | { kind: 'diverged'; expected: number; got: number };

/**
 * Vuelve a correr la carrera desde la receta. El chooser reproduce las
 * decisiones en orden; si el motor pide una que no está registrada (carrera
 * cortada), cae a la primera opción y la divergencia se detecta después.
 */
export function replayRecipe(recipe: CareerRecipe): ReplayResult {
    let at = 0;
    const state = runCareer(recipeInput(recipe), recipe.seed, (event) => {
        const recorded = recipe.decisions[at++];
        if (recorded !== undefined && event.options.some((o) => o.id === recorded)) return recorded;
        return event.options[0].id;
    });

    const replayed = state.decisionLog.map((d) => d.optionId);
    const same = replayed.length === recipe.decisions.length
        && replayed.every((id, i) => id === recipe.decisions[i]);

    if (!same) return { kind: 'diverged', expected: recipe.decisions.length, got: replayed.length };
    return { kind: 'ok', state };
}
