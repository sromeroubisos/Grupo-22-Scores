/**
 * Sincronizador del circuito SVNS (SVNS 2 y SVNS 3) contra la base. Lo comparten el alta
 * (`src/scripts/worldrugby-alta.ts`) y el cron (`/api/cron/worldrugby-sync`).
 *
 * Por etapa: baja el fixture de World Rugby, resuelve cada selección a su club
 * (`<país>-7s` / `<país>-7s-w`, creándolo si falta), asegura al participante en las TRES
 * tablas, cruza con lo guardado (`planSvns`) y escribe SOLO lo que cambió. Si el partido se
 * juega o terminó, trae la cronología (tries, conversiones, penales, tarjetas, cambios) a
 * `match_events`. Después recalcula la tabla de la fase, de donde sale la tabla general
 * del circuito.
 *
 * Si World Rugby no contesta no se escribe nada de esa etapa.
 */

import crypto from 'node:crypto';

import {
    WR_API_URL,
    parseWrSchedule,
    parseWrSummary,
    parseWrTimeline,
    wrCountryEs,
    type WrFixture,
    type WrSide,
} from '../../services/worldRugbyEventParser.ts';
import {
    candidatosClub,
    clasificacionFinal,
    nombreClub,
    planSvns,
    type CircuitoSvns,
    type FilaClasificacion,
    type EtapaSvns,
    type ExistenteSvns,
    type GeneroSvns,
} from './svns.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

const FETCH_TIMEOUT_MS = 15_000;
const ORIGEN = 'worldrugby-svns';
const COLUMNAS = 'id, external_id, home_club_id, away_club_id, date_time, status, score, venue';

export interface OpcionesSync {
    enSeco: boolean;
    conEventos: boolean;
    ahora: Date;
    /** Tope de partidos a los que se les baja la cronología en una corrida (el cron); sin tope en el alta. */
    maxCronologias?: number;
    /** Ruta del escudo de una selección (`getNationalTeamFlag`). Sin ella el club nuevo queda sin escudo. */
    logoDe?: (pais: string) => string | null;
    /** Recalcula la tabla de la fase. Si falta, no se recalcula. */
    recalcular?: (torneoId: string, faseId: string, seasonId: string | null) => Promise<boolean>;
}

export interface ResumenEtapa {
    etapa: string;
    ok: boolean;
    partidos: number;
    crear: number;
    actualizar: number;
    sinCambios: number;
    clubesNuevos: string[];
    participantesNuevos: number;
    eventos: number;
    huerfanos: string[];
    equiposSinClub: string[];
    detalle: { id: string; cambios: string[] }[];
    escribio: boolean;
    error?: string;
    errors: string[];
}

async function bajar(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(`${WR_API_URL}${path}`, {
            signal: controller.signal,
            cache: 'no-store',
            headers: { 'User-Agent': 'G22Scores/1.0 (+https://g22scores.com)', Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`World Rugby ${path} respondió ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

function paisesDe(fixtures: readonly WrFixture[]): string[] {
    const set = new Set<string>();
    for (const f of fixtures) {
        for (const side of [f.home, f.away]) if (!side.placeholder && side.country) set.add(side.country);
    }
    return [...set].sort();
}

/** País → club existente (el primer candidato que está en la base). */
async function resolverClubes(
    sb: Sb,
    paises: string[],
    genero: GeneroSvns,
): Promise<{ existentes: Map<string, string>; faltan: { pais: string; id: string }[] }> {
    const ids = [...new Set(paises.flatMap((p) => candidatosClub(p, genero)))];
    const { data, error } = await sb.from('clubs').select('id').in('id', ids);
    if (error) throw new Error(`no se pudieron leer los clubes (${error.message})`);
    const enBase = new Set(((data ?? []) as { id: string }[]).map((c) => c.id));
    const existentes = new Map<string, string>();
    const faltan: { pais: string; id: string }[] = [];
    for (const pais of paises) {
        const candidatos = candidatosClub(pais, genero);
        const hallado = candidatos.find((id) => enBase.has(id));
        if (hallado) existentes.set(pais, hallado);
        else faltan.push({ pais, id: candidatos[0] });
    }
    return { existentes, faltan };
}

async function crearClubes(sb: Sb, faltan: { pais: string; id: string }[], genero: GeneroSvns, opciones: OpcionesSync) {
    if (!faltan.length) return;
    const ahora = opciones.ahora.toISOString();
    const { error } = await sb.from('clubs').insert(faltan.map(({ pais, id }) => ({
        id, union_id: null, name: nombreClub(pais, genero), short_name: nombreClub(pais, genero), city: null, region: null,
        country: wrCountryEs(pais), logo_url: opciones.logoDe?.(pais) ?? null, primary_color: null, slug: id, is_visible: true,
        entity_type: 'club', sport: 'rugby', sport_id: 'rugby', category: null, categories: [], status: 'active', visibility: 'visible',
        external_id: null, created_at: ahora, updated_at: ahora,
    })));
    if (error) throw new Error(`no se pudieron crear los clubes (${error.message})`);
}

/** Un participante vive en tres tablas (ver la memoria `participantes-tres-tablas`). */
async function asegurarParticipantes(
    sb: Sb,
    torneo: { id: string; current_season_id: string | null },
    faseId: string,
    seasonId: string | null,
    clubes: Map<string, string>,
    ahora: string,
    /** club → grupo (solo en la fase de grupos de una etapa con cuadro). */
    grupoDe: ReadonlyMap<string, string> = new Map(),
): Promise<number> {
    const [partR, fppR] = await Promise.all([
        sb.from('tournament_participants').select('id, club_id').eq('tournament_id', torneo.id).limit(1000),
        sb.from('tournament_phase_participants').select('participant_id').eq('phase_id', faseId).limit(1000),
    ]);
    if (partR.error) throw new Error(`no se pudieron leer los participantes (${partR.error.message})`);
    if (fppR.error) throw new Error(`no se pudieron leer los participantes de fase (${fppR.error.message})`);
    const porClub = new Map(((partR.data ?? []) as { id: string; club_id: string }[]).map((p) => [p.club_id, p.id]));
    const enFase = new Set(((fppR.data ?? []) as { participant_id: string }[]).map((f) => f.participant_id));
    let nuevos = 0;

    for (const [clubId, nombre] of clubes) {
        let pid = porClub.get(clubId);
        if (!pid) {
            pid = crypto.randomUUID();
            const entryId = crypto.randomUUID();
            let r = await sb.from('tournament_participants').insert({
                id: pid, tournament_id: torneo.id, season_id: seasonId, season_entry_id: null, club_id: clubId, name: nombre,
                type: 'club', status: 'active', seed: null, group_id: null, short_code: null, notes: ORIGEN,
                joined_at: ahora, created_at: ahora, updated_at: ahora,
            });
            if (r.error) throw new Error(`participante ${clubId}: ${r.error.message}`);
            if (seasonId !== null) {
                r = await sb.from('team_season_entries').insert({
                    id: entryId, season_id: seasonId, tournament_id: torneo.id, club_id: clubId, team_id: null, source_participant_id: pid,
                    group_id: null, zone: null, category: null, status: 'active', seed: null, notes: null,
                    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
                });
                if (r.error) throw new Error(`entrada de temporada ${clubId}: ${r.error.message}`);
                r = await sb.from('tournament_participants').update({ season_entry_id: entryId }).eq('id', pid);
                if (r.error) throw new Error(`participante ${clubId} (entrada): ${r.error.message}`);
            }
            porClub.set(clubId, pid);
            nuevos += 1;
        }
        if (!enFase.has(pid)) {
            const r = await sb.from('tournament_phase_participants').insert({
                id: crypto.randomUUID(), tournament_id: torneo.id, season_id: seasonId, phase_id: faseId, participant_id: pid,
                group_id: grupoDe.get(clubId) ?? null, status: 'active', seed: null, notes: ORIGEN, created_at: ahora, updated_at: ahora,
            });
            if (r.error) throw new Error(`participante de fase ${clubId}: ${r.error.message}`);
            enFase.add(pid);
        }
    }
    return nuevos;
}

interface PartidoConId {
    matchId: string;
    filaId: string;
    fixture: WrFixture;
    homeClub: string;
    awayClub: string;
}

/** La cronología de un partido en `match_events`. Reemplaza solo lo que escribió este conector. */
async function sincronizarCronologia(sb: Sb, p: PartidoConId, seasonId: string | null, ahora: string): Promise<number> {
    const [timeline, summaryJson] = await Promise.all([
        bajar(`/match/${p.matchId}/timeline`),
        bajar(`/match/${p.matchId}/summary`).catch(() => null),
    ]);
    const names = new Map<string, string>();
    if (summaryJson) {
        const summary = parseWrSummary(summaryJson);
        for (const team of [summary.home, summary.away]) {
            for (const player of [...team.starters, ...team.replacements]) names.set(player.id, player.name);
        }
    }
    const eventos = parseWrTimeline(timeline, names);

    const { data: previos, error } = await sb.from('match_events').select('id, event_type, minute')
        .eq('match_id', p.filaId).eq('details->>source', 'worldrugby').limit(500);
    if (error) throw new Error(`no se pudo leer la cronología (${error.message})`);
    const firma = (lista: { event_type: string; minute: number | null }[]) => lista.map((e) => `${e.event_type}@${e.minute ?? ''}`).join('|');
    const nueva = eventos.map((e) => ({ event_type: e.type, minute: e.minute }));
    // Orden de la lista guardada: el de `sequence`, que es el de la cronología.
    const guardados = ((previos ?? []) as { event_type: string; minute: number | null }[]);
    if (guardados.length === nueva.length && firma([...guardados].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))) === firma([...nueva].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)))) return 0;

    if (guardados.length) {
        const r = await sb.from('match_events').delete().eq('match_id', p.filaId).eq('details->>source', 'worldrugby');
        if (r.error) throw new Error(`no se pudo reemplazar la cronología (${r.error.message})`);
    }
    if (!eventos.length) return 0;
    const filas = eventos.map((e) => ({
        id: crypto.randomUUID(),
        match_id: p.filaId,
        club_id: e.team === 'home' ? p.homeClub : p.awayClub,
        player_name: e.player || null,
        event_type: e.type,
        minute: e.minute,
        second: null,
        extra_time: null,
        sequence: e.order,
        season_id: seasonId,
        details: {
            team: e.team,
            period: e.period,
            source: 'worldrugby',
            sourceMatchId: p.matchId,
            playerName: e.player || null,
            playerId: null,
            detail: e.description,
            subPlayer: e.subPlayer ?? null,
            secondaryPlayerName: e.subPlayer ?? null,
            order: e.order,
        },
        created_at: ahora,
        updated_at: ahora,
    }));
    const r = await sb.from('match_events').insert(filas);
    if (r.error) throw new Error(`no se pudo escribir la cronología (${r.error.message})`);
    return filas.length;
}

interface FasesEtapa {
    /** Etapa de liga: su única fase. */
    liga: { id: string; season_id: string | null } | null;
    /** Etapa con cuadro: la fase de grupos y la de la etapa (cuadro + clasificación final). */
    grupos: { id: string; season_id: string | null } | null;
    final: { id: string; season_id: string | null } | null;
}

async function leerFases(sb: Sb, torneoId: string, etapa: EtapaSvns): Promise<FasesEtapa | string> {
    const { data, error } = await sb.from('tournament_phases').select('id, season_id, settings')
        .eq('tournament_id', torneoId).eq('settings->worldrugby->>etapa', etapa.clave);
    if (error) return `no se pudo leer la fase (${error.message})`;
    const lista = (data ?? []) as { id: string; season_id: string | null; settings: { worldrugby?: { rol?: string } } | null }[];
    const porRol = (rol: string) => lista.find((f) => (f.settings?.worldrugby?.rol ?? 'liga') === rol) ?? null;
    if (etapa.formato === 'liga') {
        const liga = porRol('liga');
        return liga ? { liga, grupos: null, final: null } : `el torneo no tiene la fase de ${etapa.clave}`;
    }
    const grupos = porRol('grupos');
    const final = porRol('final');
    return grupos && final ? { liga: null, grupos, final } : `el torneo no tiene las dos fases de ${etapa.clave}`;
}

/** Los grupos de la fase ("A" → id). Crea los que falten. */
async function asegurarGrupos(sb: Sb, faseId: string, seasonId: string | null, letras: string[], ahora: string): Promise<Map<string, string>> {
    const { data, error } = await sb.from('tournament_groups').select('id, name, order_index').eq('phase_id', faseId);
    if (error) throw new Error(`no se pudieron leer los grupos (${error.message})`);
    const filas = (data ?? []) as { id: string; name: string; order_index: number }[];
    const porLetra = new Map(filas.map((g) => [g.name.replace(/^Grupo\s+/i, '').toUpperCase(), g.id]));
    let orden = filas.reduce((m, g) => Math.max(m, g.order_index ?? 0), 0);
    const nuevos: { id: string; phase_id: string; season_id: string | null; name: string; order_index: number; created_at: string }[] = [];
    for (const letra of [...new Set(letras)].sort()) {
        if (porLetra.has(letra)) continue;
        orden += 1;
        const id = crypto.randomUUID();
        nuevos.push({ id, phase_id: faseId, season_id: seasonId, name: `Grupo ${letra}`, order_index: orden, created_at: ahora });
        porLetra.set(letra, id);
    }
    if (nuevos.length) {
        const r = await sb.from('tournament_groups').insert(nuevos);
        if (r.error) throw new Error(`no se pudieron crear los grupos (${r.error.message})`);
    }
    return porLetra;
}

/**
 * La clasificación final de la etapa en `tournament_standings` de la fase de la etapa
 * (`fully_manual`: el motor no la recalcula). Escribe solo si cambió. Devuelve las filas
 * escritas (0 si ya estaba igual).
 */
async function escribirClasificacion(
    sb: Sb,
    torneoId: string,
    faseId: string,
    seasonId: string | null,
    filas: FilaClasificacion[],
    ahora: string,
): Promise<number> {
    const { data: previas, error } = await sb.from('tournament_standings').select('club_id, position, played, scored, conceded')
        .eq('phase_id', faseId).eq('table_type', 'general');
    if (error) throw new Error(`no se pudo leer la clasificación (${error.message})`);
    const antes = ((previas ?? []) as { club_id: string; position: number; played: number; scored: number; conceded: number }[])
        .map((r) => `${r.club_id}:${r.position}:${r.played}:${r.scored}:${r.conceded}`).sort().join('|');
    const ahoraFirma = filas.map((r) => `${r.clubId}:${r.position}:${r.played}:${r.scored}:${r.conceded}`).sort().join('|');
    if (antes === ahoraFirma) return 0;

    if ((previas ?? []).length) {
        const r = await sb.from('tournament_standings').delete().eq('phase_id', faseId).eq('table_type', 'general');
        if (r.error) throw new Error(`no se pudo reemplazar la clasificación (${r.error.message})`);
    }
    if (!filas.length) return 0;
    const { data: clubes } = await sb.from('clubs').select('id, name, logo_url').in('id', filas.map((f) => f.clubId));
    const datos = new Map(((clubes ?? []) as { id: string; name: string; logo_url: string | null }[]).map((c) => [c.id, c]));
    const r = await sb.from('tournament_standings').insert(filas.map((f) => ({
        id: crypto.randomUUID(), tournament_id: torneoId, phase_id: faseId, group_id: null, club_id: f.clubId,
        position: f.position, played: f.played, won: f.won, drawn: f.drawn, lost: f.lost, points: f.points,
        scored: f.scored, conceded: f.conceded, bonus_points: 0, form: null, streak: null, season_id: seasonId, table_type: 'general',
        last_updated: ahora,
        stats: {
            fuente: 'World Rugby', status: null, team_name: datos.get(f.clubId)?.name ?? f.clubId, team_logo: datos.get(f.clubId)?.logo_url ?? null,
            difference: f.scored - f.conceded, table_type: 'general', adjustments: 0, calculated_at: ahora,
        },
    })));
    if (r.error) throw new Error(`no se pudo escribir la clasificación (${r.error.message})`);
    return filas.length;
}

export async function sincronizarEtapa(
    sb: Sb,
    circuito: CircuitoSvns,
    etapa: EtapaSvns,
    opciones: OpcionesSync,
): Promise<ResumenEtapa> {
    const errors: string[] = [];
    const base: ResumenEtapa = {
        etapa: etapa.clave, ok: false, partidos: 0, crear: 0, actualizar: 0, sinCambios: 0, clubesNuevos: [],
        participantesNuevos: 0, eventos: 0, huerfanos: [], equiposSinClub: [], detalle: [], escribio: false, errors,
    };
    const falla = (error: string): ResumenEtapa => ({ ...base, error });
    const ahoraIso = opciones.ahora.toISOString();

    try {
        const { data: torneo, error: errT } = await sb.from('tournaments')
            .select('id, category, is_visible, current_season_id').eq('external_id', circuito.externalId).maybeSingle();
        if (errT) return falla(`no se pudo leer el torneo (${errT.message})`);
        if (!torneo) return falla(`no hay torneo ${circuito.externalId}: se da de alta con src/scripts/worldrugby-alta.ts`);

        const fases = await leerFases(sb, torneo.id, etapa);
        if (typeof fases === 'string') return falla(fases);
        const faseDatos = fases.liga ?? fases.grupos;
        if (!faseDatos) return falla('sin fase');
        const seasonId: string | null = faseDatos.season_id ?? torneo.current_season_id ?? null;
        const idsFases = [fases.liga?.id, fases.grupos?.id, fases.final?.id].filter(Boolean) as string[];

        // Si World Rugby no contesta, no se escribe nada.
        const schedule = await bajar(`/event/${etapa.def.eventId}/schedule`);
        const fixtures = parseWrSchedule(schedule, etapa.def, opciones.ahora.getTime())
            .filter((f) => !f.home.placeholder && !f.away.placeholder);
        base.partidos = fixtures.length;
        if (!fixtures.length) return { ...base, ok: true };

        const paises = paisesDe(fixtures);
        const { existentes, faltan } = await resolverClubes(sb, paises, circuito.genero);
        base.clubesNuevos = faltan.map((f) => f.id);
        if (!opciones.enSeco) await crearClubes(sb, faltan, circuito.genero, opciones);
        const clubDe = new Map<string, string>(existentes);
        for (const f of faltan) clubDe.set(f.pais, f.id);
        const resolverClub = (side: WrSide) => clubDe.get(side.country) ?? null;

        const { data: filas, error: errM } = await sb.from('matches').select(COLUMNAS).in('phase_id', idsFases).limit(1000);
        if (errM) return falla(`no se pudieron leer los partidos (${errM.message})`);
        const existentesDb = (filas ?? []) as ExistenteSvns[];

        const plan = planSvns({ fixtures, existentes: existentesDb, resolverClub, formato: etapa.formato });
        base.crear = plan.crear.length;
        base.actualizar = plan.actualizar.length;
        base.sinCambios = plan.sinCambios;
        base.huerfanos = plan.huerfanos;
        base.equiposSinClub = plan.equiposSinClub;
        base.detalle = plan.actualizar.map((a) => ({ id: a.id, cambios: a.cambios }));

        // Solo los clubes que juegan en esta etapa (no todos los países de la API), y su grupo.
        const juegan = new Set<string>();
        const poolDe = new Map<string, string>();
        for (const f of fixtures) {
            const h = resolverClub(f.home);
            const a = resolverClub(f.away);
            if (h) juegan.add(h);
            if (a) juegan.add(a);
            if (f.pool && h) poolDe.set(h, f.pool);
            if (f.pool && a) poolDe.set(a, f.pool);
        }
        const clubesDeLaEtapa = new Map<string, string>();
        for (const [pais, id] of clubDe) if (juegan.has(id)) clubesDeLaEtapa.set(id, nombreClub(pais, circuito.genero));

        const clasificacion = etapa.formato === 'grupos'
            ? clasificacionFinal(fixtures, resolverClub, circuito.puntosPorPuesto)
            : [];

        if (opciones.enSeco) return { ...base, ok: true, eventos: clasificacion.length };

        // Fases, grupos y participantes.
        let grupoIdDe = new Map<string, string>();
        if (fases.liga) {
            base.participantesNuevos = await asegurarParticipantes(sb, torneo, fases.liga.id, seasonId, clubesDeLaEtapa, ahoraIso);
        } else if (fases.grupos && fases.final) {
            grupoIdDe = await asegurarGrupos(sb, fases.grupos.id, seasonId, [...new Set(poolDe.values())], ahoraIso);
            const delClub = new Map<string, string>();
            for (const [club, pool] of poolDe) {
                const g = grupoIdDe.get(pool);
                if (g) delClub.set(club, g);
            }
            base.participantesNuevos = await asegurarParticipantes(sb, torneo, fases.grupos.id, seasonId, clubesDeLaEtapa, ahoraIso, delClub);
            await asegurarParticipantes(sb, torneo, fases.final.id, seasonId, clubesDeLaEtapa, ahoraIso);
        }

        const creadas = new Map<string, string>();
        if (plan.crear.length) {
            const filasNuevas = plan.crear.map((c) => ({
                ...c.fila, tournament_id: torneo.id, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
                phase_id: c.fase === 'grupos' ? fases.grupos?.id : c.fase === 'final' ? fases.final?.id : fases.liga?.id,
                group_id: c.fase === 'grupos' && c.grupo ? grupoIdDe.get(c.grupo) ?? null : null,
                category: torneo.category, is_visible: torneo.is_visible === true, live_enabled: false, review_status: 'approved',
            }));
            const { data: insertadas, error } = await sb.from('matches').insert(filasNuevas).select('id, external_id');
            if (error) return { ...base, error: `alta de ${plan.crear.length} partidos falló (${error.message})` };
            for (const m of (insertadas ?? []) as { id: string; external_id: string }[]) creadas.set(m.external_id, m.id);
        }
        for (const a of plan.actualizar) {
            const { error } = await sb.from('matches').update({ ...a.patch, updated_at: ahoraIso }).eq('id', a.id);
            if (error) errors.push(`${a.id}: ${error.message}`);
        }
        base.escribio = plan.crear.length + plan.actualizar.length > 0;

        // La cronología de lo que se juega o ya terminó (si cambió, o todavía no la tiene).
        if (opciones.conEventos) {
            const jugados: PartidoConId[] = [];
            for (const v of plan.vinculados) {
                const estado = v.fixture.state;
                if (estado !== 'live' && estado !== 'final') continue;
                const filaId = v.filaId ?? creadas.get(v.externalId);
                if (!filaId) continue;
                const home = resolverClub(v.fixture.home);
                const away = resolverClub(v.fixture.away);
                if (!home || !away) continue;
                jugados.push({ matchId: v.matchId, filaId, fixture: v.fixture, homeClub: home, awayClub: away });
            }
            // En vivo primero: es lo que más cambia. El tope cuida el tiempo de la corrida.
            jugados.sort((a, b) => Number(b.fixture.state === 'live') - Number(a.fixture.state === 'live'));
            const tope = opciones.maxCronologias ?? jugados.length;
            for (const p of jugados.slice(0, tope)) {
                try {
                    base.eventos += await sincronizarCronologia(sb, p, seasonId, ahoraIso);
                } catch (e) {
                    errors.push(`cronología ${p.matchId}: ${e instanceof Error ? e.message : 'error'}`);
                }
            }
        }

        const cambioTabla = plan.crear.length > 0
            || plan.actualizar.some((a) => 'score' in a.patch || 'status' in a.patch || 'home_club_id' in a.patch);
        const faseDeTabla = fases.liga ?? fases.grupos;
        if (cambioTabla && opciones.recalcular && faseDeTabla) {
            try {
                if (!(await opciones.recalcular(torneo.id, faseDeTabla.id, seasonId))) errors.push('el recálculo de la tabla falló');
            } catch (e) {
                errors.push(`el recálculo de la tabla falló (${e instanceof Error ? e.message : 'error'})`);
            }
        }

        // La clasificación final por puesto: es la que suma a la tabla general del circuito.
        if (fases.final) {
            try {
                const escritas = await escribirClasificacion(sb, torneo.id, fases.final.id, seasonId, clasificacion, ahoraIso);
                if (escritas > 0) base.escribio = true;
            } catch (e) {
                errors.push(`clasificación final: ${e instanceof Error ? e.message : 'error'}`);
            }
        }
        return { ...base, ok: errors.length === 0 };
    } catch (e) {
        return { ...base, error: e instanceof Error ? e.message : 'error' };
    }
}

const DIA_MS = 86_400_000;

/**
 * Cada torneo admite UNA sola fase activa (`tournament_phases_one_active_idx`): la etapa en
 * curso o, si todavía no arrancó ninguna, la primera. Es la que la pantalla abre por defecto.
 * En una etapa con cuadro es la de la etapa (la clasificación), no la de grupos.
 * Devuelve la etapa que quedó activa, o null si ya estaba bien.
 */
export async function fijarFaseActiva(sb: Sb, circuito: CircuitoSvns, torneoId: string, ahora: Date): Promise<string | null> {
    const limite = ahora.getTime() + DIA_MS;
    const arrancadas = circuito.etapas.filter((e) => Date.parse(`${e.desde}T00:00:00Z`) <= limite);
    const etapa = arrancadas.length ? arrancadas[arrancadas.length - 1] : circuito.etapas[0];
    const { data, error } = await sb.from('tournament_phases').select('id, is_active, settings').eq('tournament_id', torneoId);
    if (error) throw new Error(`no se pudieron leer las fases (${error.message})`);
    const fases = (data ?? []) as { id: string; is_active: boolean; settings: { worldrugby?: { etapa?: string; rol?: string } } | null }[];
    const objetivo = fases.find((f) => f.settings?.worldrugby?.etapa === etapa.clave && f.settings?.worldrugby?.rol !== 'grupos');
    if (!objetivo) return null;
    const activas = fases.filter((f) => f.is_active);
    if (activas.length === 1 && activas[0].id === objetivo.id) return null;
    if (activas.length) {
        const r = await sb.from('tournament_phases').update({ is_active: false }).eq('tournament_id', torneoId).eq('is_active', true);
        if (r.error) throw new Error(`no se pudo desactivar la fase vigente (${r.error.message})`);
    }
    const r = await sb.from('tournament_phases').update({ is_active: true }).eq('id', objetivo.id);
    if (r.error) throw new Error(`no se pudo activar la fase (${r.error.message})`);
    return etapa.clave;
}
