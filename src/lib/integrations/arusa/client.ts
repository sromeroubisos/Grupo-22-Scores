/**
 * Cliente mínimo de ARUSA (Asociación de Rugby de Santiago).
 *
 * arusa.cl corre sobre **Leverade**, y la API que alimenta el sitio es un
 * JSON:API público en `https://api.leverade.com/` — sin clave, sin login.
 * El manager de ARUSA es el 532872 (`/managers/532872`), y de ahí cuelgan las
 * temporadas: 4966=2021 · 5591=2022 · 6376=2023 · 7171=2024 · 8128=2025 ·
 * 8826=2026.
 *
 * Lo que la fuente da y rugbyarchive no:
 *   · hora exacta de comienzo con `display_timezone` (America/Santiago)
 *   · cancha real (`facility`), no un rótulo genérico
 *   · los PUNTOS DE TABLA oficiales por equipo (`result.score`), con los bonus
 *     ya resueltos por la asociación — o sea, la tabla sale idéntica a la web
 *   · las ramas Intermedia y Pre-Intermedia, que son otra rama del mismo torneo
 *   · la fecha libre, marcada como partido `canceled` con un equipo en null
 *
 * OJO con tres cosas:
 *   1. `/matches/{id}` directo responde 401. Los partidos se leen SIEMPRE
 *      colgados de su fecha: `/rounds/{id}?include=matches.results,matches.facility`.
 *   2. `finished` miente en los torneos con fecha libre: viene en true para
 *      slots que nunca se jugaron. La verdad es si el partido trae `results`
 *      con valor — y ese valor NACE EN NULL, así que un `?? 0` convierte un
 *      partido por jugar en un 0-0 final.
 *   3. La rama de fase regular no se llama igual en todas: "Titulares" en
 *      Primera, Segunda y Tercera, "Fase Regular" en Cuarta. Buscarla por
 *      `tipo === 'league'` es más seguro que por nombre.
 */

const BASE = 'https://api.leverade.com';
const PAUSA_MS = 250;

let ultimaLlamada = 0;

async function pausaCortesia() {
    const desde = Date.now() - ultimaLlamada;
    if (desde < PAUSA_MS) await new Promise((r) => setTimeout(r, PAUSA_MS - desde));
    ultimaLlamada = Date.now();
}

interface Recurso {
    type: string;
    id: string;
    attributes?: Record<string, unknown>;
    meta?: Record<string, string>;
    relationships?: Record<
        string,
        { data: { type: string; id: string } | Array<{ type: string; id: string }> | null }
    >;
}
interface Documento {
    data?: Recurso;
    included?: Recurso[];
    meta?: Record<string, unknown>;
    errors?: Array<{ detail?: string }>;
}

async function leer(ruta: string): Promise<Documento> {
    await pausaCortesia();
    const res = await fetch(`${BASE}/${ruta}`, { headers: { Accept: 'application/json' } });
    const texto = await res.text();
    if (!res.ok) throw new Error(`Leverade ${ruta}: HTTP ${res.status} ${texto.slice(0, 200)}`);
    if (texto.trimStart().startsWith('<')) throw new Error(`Leverade ${ruta}: respuesta HTML (ruta inexistente)`);
    const doc = JSON.parse(texto) as Documento;
    if (doc.errors?.length) throw new Error(`Leverade ${ruta}: ${doc.errors.map((e) => e.detail).join(' / ')}`);
    return doc;
}

function unoDe(rel: Recurso['relationships'], nombre: string): string | null {
    const d = rel?.[nombre]?.data;
    return d && !Array.isArray(d) ? d.id : null;
}

export interface PartidoArusa {
    /** id de Leverade; es el que va a `matches.external_id` como `arusa:{id}`. */
    id: string;
    /** Nombre de la fecha ya limpio: "Fecha 7" (la fuente lo manda como "7. Fecha 7"). */
    fecha: string;
    ordenFecha: number;
    /** Hora local de Santiago, tal cual la publica ARUSA: "2026-08-16 18:30:00". */
    inicioLocal: string | null;
    zona: string;
    local: { id: string; nombre: string } | null;
    visita: { id: string; nombre: string } | null;
    puntosLocal: number | null;
    puntosVisita: number | null;
    /** Puntos de tabla oficiales (base + bonus ya sumados por ARUSA). */
    tablaLocal: number | null;
    tablaVisita: number | null;
    cancha: string | null;
    anulado: boolean;
    postergado: boolean;
    /** Fecha libre: slot sin rival, no es un partido. */
    libre: boolean;
    jugado: boolean;
}

export interface GrupoArusa {
    id: string;
    nombre: string;
    /** `league` para la fase regular, `play_off` para las llaves. */
    tipo: string;
    orden: number;
    /** Cuántos suben y cuántos bajan al terminar. Sale de la fuente, no se supone. */
    promueve: number;
    desciende: number;
    partidos: PartidoArusa[];
}

export interface TorneoArusa {
    id: string;
    nombre: string;
    estado: string;
    equipos: Record<string, string>;
    /** Escudo del equipo (`meta.avatar.large`, 500x500). Sirve para dar de alta clubes nuevos. */
    escudos: Record<string, string | null>;
    /**
     * Club de Leverade al que pertenece cada equipo. Es lo que distingue una
     * FILIAL de una institución nueva: "PWCC" en Primera y "PWCC" en Cuarta
     * comparten club, así que son el primer equipo y el B del mismo club, no
     * dos clubes homónimos.
     */
    clubes: Record<string, string | null>;
    grupos: GrupoArusa[];
}

/** El torneo con sus ramas pero SIN partidos: una sola llamada. */
export type CabeceraArusa = Omit<TorneoArusa, 'grupos'> & { grupos: Omit<GrupoArusa, 'partidos'>[] };

/**
 * Cabecera del torneo: nombre, equipos con escudo y la lista de ramas. Es la
 * llamada barata — traer los partidos de una rama son ~18 requests más, y un
 * torneo de ARUSA tiene hasta cuatro ramas.
 */
export async function fetchCabecera(idTorneo: string): Promise<CabeceraArusa> {
    const doc = await leer(`tournaments/${idTorneo}?include=groups,teams`);
    const inc = doc.included ?? [];
    const equipos: Record<string, string> = {};
    const escudos: Record<string, string | null> = {};
    const clubes: Record<string, string | null> = {};
    for (const r of inc) {
        if (r.type !== 'team') continue;
        equipos[r.id] = String(r.attributes?.name ?? r.id);
        const avatar = (r.meta as { avatar?: { large?: string } } | undefined)?.avatar;
        escudos[r.id] = avatar?.large ?? null;
        clubes[r.id] = unoDe(r.relationships, 'club');
    }

    const grupos = inc.filter((r) => r.type === 'group').map((g) => ({
        id: g.id,
        nombre: String(g.attributes?.name ?? g.id),
        tipo: String(g.attributes?.type ?? ''),
        orden: Number(g.attributes?.order ?? 0),
        promueve: Number(g.attributes?.promote ?? 0),
        desciende: Number(g.attributes?.relegate ?? 0),
    })).sort((a, b) => a.orden - b.orden);

    return {
        id: idTorneo,
        nombre: String(doc.data?.attributes?.name ?? idTorneo),
        estado: String(doc.data?.attributes?.status ?? ''),
        equipos,
        escudos,
        clubes,
        grupos,
    };
}

/**
 * Una sola rama, con sus partidos. Es lo que usan el sync y el cron: pedir el
 * torneo entero traería también Intermedia y Pre-Intermedia, que hoy no se
 * cargan, y multiplicaría por tres el tiempo de la corrida.
 *
 * `nombreRama` en null toma la primera de tipo `league`: en Primera, Segunda y
 * Tercera se llama "Titulares", pero en Cuarta es "Fase Regular".
 */
export async function fetchRama(
    idTorneo: string,
    nombreRama: string | null,
): Promise<{ torneo: CabeceraArusa; grupo: GrupoArusa } | { torneo: CabeceraArusa; grupo: null }> {
    const torneo = await fetchCabecera(idTorneo);
    const clave = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
    const resumen = nombreRama
        ? torneo.grupos.find((g) => clave(g.nombre) === clave(nombreRama))
        : torneo.grupos.find((g) => g.tipo === 'league');
    if (!resumen) return { torneo, grupo: null };
    return { torneo, grupo: { ...resumen, partidos: await fetchPartidosDeGrupo(resumen.id, torneo.equipos) } };
}

/** El torneo COMPLETO, con los partidos de todas sus ramas. Caro: usalo para explorar. */
export async function fetchTorneo(idTorneo: string): Promise<TorneoArusa> {
    const cabecera = await fetchCabecera(idTorneo);

    const grupos: GrupoArusa[] = [];
    for (const g of cabecera.grupos) {
        grupos.push({ ...g, partidos: await fetchPartidosDeGrupo(g.id, cabecera.equipos) });
    }

    return { ...cabecera, grupos };
}

/** Una rama del torneo (Titulares / Intermedia / Pre-Intermedia), fecha por fecha. */
export async function fetchPartidosDeGrupo(
    idGrupo: string,
    equipos: Record<string, string>,
): Promise<PartidoArusa[]> {
    const doc = await leer(`groups/${idGrupo}?include=rounds`);
    const fechas = (doc.included ?? [])
        .filter((r) => r.type === 'round')
        .sort((a, b) => Number(a.attributes?.order ?? 0) - Number(b.attributes?.order ?? 0));

    const partidos: PartidoArusa[] = [];
    for (const f of fechas) {
        const rd = await leer(`rounds/${f.id}?include=matches.results,matches.facility`);
        const inc = rd.included ?? [];
        const canchas: Record<string, string> = {};
        for (const r of inc) if (r.type === 'facility') canchas[r.id] = String(r.attributes?.name ?? '');
        const resultados = inc.filter((r) => r.type === 'result');

        for (const m of inc.filter((r) => r.type === 'match')) {
            const mios = resultados.filter((r) => unoDe(r.relationships, 'match') === m.id);
            const idLocal = m.meta?.home_team ?? null;
            const idVisita = m.meta?.away_team ?? null;
            const rl = mios.find((r) => unoDe(r.relationships, 'team') === idLocal);
            const rv = mios.find((r) => unoDe(r.relationships, 'team') === idVisita);
            // La fila de resultado nace con el partido: existe desde que se
            // arma el fixture, con `value` en null hasta que se juega. Ese null
            // NO se convierte a 0 — si no, un partido por jugar entra 0-0.
            const valor = (r: Recurso | undefined, campo: 'value' | 'score') => {
                const v = r?.attributes?.[campo];
                return v === null || v === undefined ? null : Number(v);
            };
            const puntosLocal = valor(rl, 'value');
            const puntosVisita = valor(rv, 'value');
            const libre = Boolean(m.attributes?.rest) || !idLocal || !idVisita;

            partidos.push({
                id: m.id,
                fecha: String(f.attributes?.name ?? '').replace(/^\d+\.\s*/, ''),
                ordenFecha: Number(f.attributes?.order ?? 0),
                inicioLocal: (m.attributes?.datetime as string) ?? (m.attributes?.date as string) ?? null,
                zona: String(m.attributes?.display_timezone ?? 'America/Santiago'),
                local: idLocal ? { id: idLocal, nombre: equipos[idLocal] ?? idLocal } : null,
                visita: idVisita ? { id: idVisita, nombre: equipos[idVisita] ?? idVisita } : null,
                puntosLocal,
                puntosVisita,
                tablaLocal: valor(rl, 'score'),
                tablaVisita: valor(rv, 'score'),
                cancha: canchas[unoDe(m.relationships, 'facility') ?? ''] || null,
                anulado: Boolean(m.attributes?.canceled),
                postergado: Boolean(m.attributes?.postponed),
                libre,
                jugado: puntosLocal !== null && puntosVisita !== null && !libre,
            });
        }
    }
    return partidos;
}

export interface FilaTabla {
    /** id del equipo de Leverade: la llave para resolver el club, mejor que el nombre. */
    equipoId: string;
    equipo: string;
    posicion: number;
    puntos: number;
    jugados: number;
    ganados: number;
    empatados: number;
    perdidos: number;
    aFavor: number;
    enContra: number;
}

/** La tabla OFICIAL de ARUSA para esa rama. Sirve de control del import. */
export async function fetchTabla(idGrupo: string): Promise<FilaTabla[]> {
    const doc = await leer(`groups/${idGrupo}/standings`);
    const filas = (doc.meta?.standingsrows ?? []) as Array<{
        id: number;
        name: string;
        position: number;
        standingsstats: Array<{ type: string; value: number }>;
    }>;
    const dato = (f: (typeof filas)[number], t: string) =>
        f.standingsstats.find((s) => s.type === t)?.value ?? 0;
    return filas.map((f) => ({
        equipoId: String(f.id),
        equipo: f.name,
        posicion: f.position,
        puntos: dato(f, 'score'),
        jugados: dato(f, 'played_matches'),
        ganados: dato(f, 'won_matches'),
        empatados: dato(f, 'drawn_matches'),
        perdidos: dato(f, 'lost_matches'),
        aFavor: dato(f, 'value'),
        enContra: dato(f, 'value_against'),
    }));
}
