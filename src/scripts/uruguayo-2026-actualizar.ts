/**
 * Uruguayo de Clubes 2026: pone la temporada en curso al día contra rugbyarchive.
 *
 *   npx tsx src/scripts/uruguayo-2026-actualizar.ts            # dry-run
 *   npx tsx src/scripts/uruguayo-2026-actualizar.ts --apply    # escribe
 *
 * Por qué un script propio y no el runner de rugbyarchive: ese escritor BORRA y
 * rehace la temporada entera, y de los partidos del 2026 cuelgan los
 * `prode_events` (por `local_match_id`) con predicciones ya puntuadas. Acá no se
 * borra una sola fila: se actualiza lo que existe y se inserta lo que falta.
 *
 * Lo que G22 tenía cargado a mano era SOLO el Apertura (66 fechas regulares más
 * un cuadro de playoff sin llenar). Contra la fuente, al 2026-09-02:
 *
 *   · 5 partidos del 20/6 seguían en `scheduled` 0-0 → se les pone el resultado.
 *   · Trébol vs Círculo de Tenis del 20/6 es "HTWO" (walkover) en la fuente: no
 *     tiene marcador importable y se queda como está. No se inventa un 20-0.
 *   · La fase final del Apertura (Oro/Plata/Bronce, semis y finales) no existía,
 *     salvo la Final de Oro. Las 8 que faltan se reparten primero en los
 *     placeholders vacíos que ya tenía la fase "Playoffs" —así los eventos de
 *     prode que hoy muestran "(vacío) vs (vacío)" pasan a decir algo— y el resto
 *     se inserta.
 *   · El Clausura entero (12 jugados) no estaba: fase nueva, fechas y tabla.
 *
 * Cuatro partidos del Apertura tienen el mismo marcador pero con local y
 * visitante al revés que rugbyarchive. NO se tocan: el resultado es idéntico y
 * la carga a mano de G22 es tan buena fuente como el archivo para saber quién
 * ofició de local.
 *
 * Re-correrlo cuando avance el Clausura suma sólo lo nuevo: todo lo que ya
 * coincide con la fuente se saltea.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

import { CLUB_MAP_INTERIOR } from '../lib/integrations/rugbyarchive/interior-nacional.ts';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APPLY = process.argv.includes('--apply');
const TORNEO = '271638cc-3351-42ce-81bd-ef091e82515d';
const TEMPORADA = '94818e51-34a2-4872-858c-9b0423e50435';
const CACHE = path.join(process.cwd(), '.rugbyarchive-cache', '396-2026.json');
const ROLLBACK = 'URUGUAYO_2026_ROLLBACK.json';

/** 4/2/0 con bonus, el mismo ruleset con el que ya vive el torneo. */
const PUNTOS = { win: 4, draw: 2, loss: 0 };

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales en .env.local');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

/** Supabase se cae a ratos y Cloudflare devuelve HTML: los 5xx se reintentan. */
async function pedir(method: string, recurso: string, body?: unknown): Promise<Response> {
    for (let i = 1; ; i++) {
        try {
            const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
                method,
                headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
            if (res.ok || res.status < 500 || i >= 6) return res;
        } catch (e) {
            if (i >= 6) throw e;
        }
        await new Promise((r) => setTimeout(r, 1500 * i));
    }
}

async function leer<T = Record<string, unknown>>(recurso: string): Promise<T[]> {
    const res = await pedir('GET', recurso);
    if (!res.ok) throw new Error(`GET ${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return await res.json() as T[];
}

async function escribir(method: 'POST' | 'PATCH', recurso: string, body: unknown) {
    if (!APPLY) return;
    const res = await pedir(method, recurso, body);
    if (!res.ok) throw new Error(`${method} ${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

// ── La fuente ───────────────────────────────────────────────────────────────

interface PartidoFuente {
    turno: string;
    /** yyyy-mm-dd. La fuente la da dd/mm/yyyy. */
    fecha: string;
    home: string;
    away: string;
    hs: number;
    as: number;
}

/** Partido ganado sin jugarse. La fuente no publica marcador, sólo quién ganó. */
interface Walkover {
    turno: string;
    fecha: string;
    home: string;
    away: string;
    ganador: string;
}

/** Partido del fixture por delante: fecha y rivales, sin resultado. */
interface PorJugar {
    turno: string;
    fecha: string;
    home: string;
    away: string;
}

interface TablaFuente {
    clubId: string; nombreRA: string; posicion: number; jugados: number;
    ganados: number; empatados: number; perdidos: number;
    aFavor: number; enContra: number; diferencia: number;
    bonusOfensivo: number; bonusDefensivo: number; puntos: number; nota: string | null;
}

const aIso = (ddmmyyyy: string) => ddmmyyyy.split('/').reverse().join('-');

function leerFuente(): {
    jugados: PartidoFuente[];
    walkovers: Walkover[];
    porJugar: PorJugar[];
    descartados: string[];
    tablas: Map<string, TablaFuente[]>;
} {
    const d = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as Record<string, any>;
    const descartados: string[] = [];
    const jugados: PartidoFuente[] = [];
    const walkovers: Walkover[] = [];

    for (const p of (d.partiteGiocate || []).filter((x: any) => x?.partita)) {
        const resultado = String(p.partita.risultato || '');
        const home = CLUB_MAP_INTERIOR[p.partita.squadraCasa?.id];
        const away = CLUB_MAP_INTERIOR[p.partita.squadraTrasferta?.id];
        const rotulo = `${p.turno} ${p.partita.dataPartita} ${p.partita.squadraCasa?.nome} vs ${p.partita.squadraTrasferta?.nome}`;
        if (!home || !away) { descartados.push(`${rotulo}: club sin mapear`); continue; }
        const m = resultado.match(/^(\d+)-(\d+)$/);
        if (!m) {
            // HTWO/ATWO son walkovers: el partido SÍ está resuelto (la tabla de la
            // fuente lo cuenta como ganado y perdido) pero no hay marcador. Se
            // registran aparte para cerrarlos con los puntos, no con un resultado.
            if (resultado === 'HTWO' || resultado === 'ATWO') {
                walkovers.push({ turno: p.turno, fecha: aIso(p.partita.dataPartita), home, away, ganador: resultado === 'HTWO' ? home : away });
            } else {
                descartados.push(`${rotulo}: resultado "${resultado}" no importable`);
            }
            continue;
        }
        jugados.push({ turno: p.turno, fecha: aIso(p.partita.dataPartita), home, away, hs: Number(m[1]), as: Number(m[2]) });
    }

    // El fixture por delante: la fuente lo publica en `partiteDaGiocare`. Nueve
    // de las 63 entradas vienen sin `partita` (una por fecha: el hueco del
    // formato, no un partido) y se ignoran solas.
    const porJugar: PorJugar[] = [];
    for (const p of (d.partiteDaGiocare || []).filter((x: any) => x?.partita)) {
        const home = CLUB_MAP_INTERIOR[p.partita.squadraCasa?.id];
        const away = CLUB_MAP_INTERIOR[p.partita.squadraTrasferta?.id];
        if (!home || !away) { descartados.push(`por jugar ${p.partita.dataPartita}: club sin mapear`); continue; }
        porJugar.push({ turno: p.turno, fecha: aIso(p.partita.dataPartita || p.data), home, away });
    }

    const tablas = new Map<string, TablaFuente[]>();
    for (const fase of d.fasi || []) {
        for (const sf of fase.sottoFasi || []) {
            for (const g of sf.gruppi || []) {
                const filas: TablaFuente[] = (g.classifiche || []).map((c: any) => ({
                    clubId: CLUB_MAP_INTERIOR[c.squadra?.id] || '',
                    nombreRA: c.squadra?.nome || '',
                    posicion: Number(c.posizione), jugados: c.partiteGiocate,
                    ganados: c.vinte, empatados: c.pareggiate, perdidos: c.perse,
                    aFavor: c.puntiFatti, enContra: c.puntiSubiti, diferencia: c.differenzaPunti,
                    bonusOfensivo: c.bonusOffensivo || 0, bonusDefensivo: c.bonusDifensivo || 0,
                    puntos: Number(c.puntiClassifica), nota: c.descrizione || null,
                })).filter((f: TablaFuente) => f.clubId);
                if (filas.length) tablas.set(String(fase.nomeFase), filas);
            }
        }
    }
    return { jugados, walkovers, porJugar, descartados, tablas };
}

// ── La base ─────────────────────────────────────────────────────────────────

interface FilaPartido {
    id: string; date_time: string; score: Record<string, number> | null; status: string | null;
    home_club_id: string | null; away_club_id: string | null; phase_id: string | null;
    round_uuid: string | null; round_label: string | null;
    home_base_points: number | null; away_base_points: number | null;
    points_autocalculated: boolean | null;
}

const par = (a: string, b: string) => [a, b].sort().join('~');

const puntosBase = (hs: number, as_: number) => (hs > as_
    ? { home: PUNTOS.win, away: PUNTOS.loss }
    : hs < as_ ? { home: PUNTOS.loss, away: PUNTOS.win }
        : { home: PUNTOS.draw, away: PUNTOS.draw });

/** Rótulos de la fase final del Apertura, en castellano y en orden de disputa. */
const RONDA_ES: Record<string, string> = {
    'Oro - Semifinals': 'Oro · Semifinales',
    'Plata - Semifinals': 'Plata · Semifinales',
    'Bronce - Semifinals': 'Bronce · Semifinales',
    'Oro - Final': 'Oro · Final',
    'Plata - Final': 'Plata · Final',
    'Bronce - Final': 'Bronce · Final',
};
const ORDEN_RONDA = Object.keys(RONDA_ES);

function filaPartido(phaseId: string, roundId: string, rotulo: string, f: PartidoFuente, ahora: string): Record<string, unknown> {
    const base = puntosBase(f.hs, f.as);
    return {
        id: crypto.randomUUID(), tournament_id: TORNEO, season_id: TEMPORADA,
        phase_id: phaseId, round_uuid: roundId, round_label: rotulo, group_id: null,
        home_club_id: f.home, away_club_id: f.away,
        date_time: `${f.fecha}T18:00:00.000Z`, venue: null, status: 'final',
        score: { home: f.hs, away: f.as },
        notes: 'Importado desde rugbyarchive (Uruguayo de Clubes 2026)',
        home_base_points: base.home, away_base_points: base.away,
        home_bonus_points: 0, away_bonus_points: 0,
        points_autocalculated: true, points_override_reason: null,
        created_at: ahora, updated_at: ahora,
    };
}

async function main() {
    const ahora = new Date().toISOString();
    const { jugados, walkovers, porJugar, descartados, tablas } = leerFuente();
    console.log(`${APPLY ? 'MODO APLICAR' : 'DRY-RUN (no escribe)'}`);
    console.log(`fuente: ${jugados.length} jugados · ${walkovers.length} ganados por walkover · ${porJugar.length} por jugar`);
    if (descartados.length) {
        console.log(`no importables (${descartados.length}):`);
        descartados.forEach((s) => console.log('  ·', s));
    }

    const fases = await leer<{ id: string; name: string; order_index: number | null }>(
        `tournament_phases?select=id,name,order_index&season_id=eq.${TEMPORADA}`);
    const faseRegular = fases.find((f) => f.name === 'Fase Regular');
    const fasePlayoffs = fases.find((f) => f.name === 'Playoffs');
    if (!faseRegular || !fasePlayoffs) throw new Error('No encuentro las fases "Fase Regular" y "Playoffs" del 2026.');

    const partidos = await leer<FilaPartido>(
        `matches?select=id,date_time,score,status,home_club_id,away_club_id,phase_id,round_uuid,round_label,home_base_points,away_base_points,points_autocalculated&season_id=eq.${TEMPORADA}`);

    const regPorFechaPar = new Map(partidos.filter((p) => p.phase_id === faseRegular.id)
        .map((p) => [`${p.date_time.slice(0, 10)}|${par(p.home_club_id || '', p.away_club_id || '')}`, p]));
    const enPlayoffs = partidos.filter((p) => p.phase_id === fasePlayoffs.id);
    const poPorPar = new Map(enPlayoffs.filter((p) => p.home_club_id && p.away_club_id)
        .map((p) => [par(p.home_club_id!, p.away_club_id!), p]));
    /** Placeholders del cuadro sin los dos clubes: se rellenan con las llaves reales. */
    const libres = enPlayoffs.filter((p) => !p.home_club_id || !p.away_club_id);

    const rollback: Array<{ tabla: string; id: string; antes: Record<string, unknown> }> = [];
    const patchesPartido: Array<{ id: string; patch: Record<string, unknown>; linea: string }> = [];
    const inserts: Record<string, unknown>[] = [];
    const lineasInsert: string[] = [];
    const nuevasFases: Record<string, unknown>[] = [];
    const nuevasRondas: Record<string, unknown>[] = [];

    // ── 1 · Apertura regular: completar lo que quedó sin jugar ──────────────
    for (const f of jugados.filter((x) => x.turno === 'Apertura tournament')) {
        const fila = regPorFechaPar.get(`${f.fecha}|${par(f.home, f.away)}`);
        if (!fila) { console.log('  OJO: regular sin fila en la base:', f.fecha, f.home, 'vs', f.away); continue; }
        // La base puede tener el partido con local y visitante al revés que la
        // fuente: se respeta la orientación de la base y se da vuelta el marcador.
        const invertido = fila.home_club_id === f.away;
        const hs = invertido ? f.as : f.hs;
        const as_ = invertido ? f.hs : f.as;
        const sc = fila.score || {};
        if (fila.status === 'final' && sc.home === hs && sc.away === as_) continue;
        const base = puntosBase(hs, as_);
        rollback.push({ tabla: 'matches', id: fila.id, antes: { status: fila.status, score: fila.score, home_base_points: fila.home_base_points, away_base_points: fila.away_base_points, points_autocalculated: fila.points_autocalculated } });
        patchesPartido.push({
            id: fila.id,
            patch: { status: 'final', score: { home: hs, away: as_ }, home_base_points: base.home, away_base_points: base.away, home_bonus_points: 0, away_bonus_points: 0, points_autocalculated: true, updated_at: ahora },
            linea: `Apertura ${f.fecha}: ${f.home} ${hs}-${as_} ${f.away} (estaba ${fila.status} ${JSON.stringify(sc)})`,
        });
    }

    // ── 1b · Walkovers: cerrarlos con los puntos, no con un marcador ────────
    // El CHECK de `matches.status` acepta sólo scheduled/live/final/postponed/
    // suspended: no hay estado "walkover". Y ningún partido `final` de la base
    // tiene el marcador en NULL, así que tampoco se puede dejar vacío. Se cierra
    // como `final` 0-0 —nadie anotó, es literal— con los puntos puestos a mano
    // (`points_autocalculated: false`) para el que ganó, y el motivo escrito.
    // Sin esto el partido se queda para siempre en el fixture por jugar.
    for (const w of walkovers) {
        const fila = regPorFechaPar.get(`${w.fecha}|${par(w.home, w.away)}`)
            || poPorPar.get(par(w.home, w.away));
        if (!fila) { console.log('  OJO: walkover sin fila en la base:', w.fecha, w.home, 'vs', w.away); continue; }
        if (fila.status === 'final' && fila.points_autocalculated === false) continue;
        const ganaLocal = fila.home_club_id === w.ganador;
        rollback.push({ tabla: 'matches', id: fila.id, antes: { status: fila.status, score: fila.score, home_base_points: fila.home_base_points, away_base_points: fila.away_base_points, points_autocalculated: fila.points_autocalculated } });
        patchesPartido.push({
            id: fila.id,
            patch: {
                status: 'final', score: { home: 0, away: 0 },
                home_base_points: ganaLocal ? PUNTOS.win : PUNTOS.loss,
                away_base_points: ganaLocal ? PUNTOS.loss : PUNTOS.win,
                home_bonus_points: 0, away_bonus_points: 0,
                points_autocalculated: false,
                points_override_reason: `Walkover a favor de ${w.ganador}. La fuente lo da por ganado sin publicar marcador, y así lo cuenta su tabla.`,
                updated_at: ahora,
            },
            linea: `WALKOVER ${w.fecha}: gana ${w.ganador} (${w.home} vs ${w.away}, sin marcador publicado)`,
        });
    }

    // ── 2 · Fase final del Apertura: Oro / Plata / Bronce ───────────────────
    const rondasPlayoffs = await leer<{ id: string; name: string; order_index: number | null }>(
        `tournament_rounds?select=id,name,order_index&phase_id=eq.${fasePlayoffs.id}`);
    const rondaIdPorNombre = new Map<string, string>(rondasPlayoffs.map((r) => [r.name, r.id]));
    // `(phase_id, order_index)` es único y la fase ya trae las rondas del cuadro
    // vacío: las nuevas siguen numerando desde donde terminan las que hay.
    let ordenPlayoffs = Math.max(0, ...rondasPlayoffs.map((r) => r.order_index || 0));
    const disponibles = [...libres];

    for (const f of jugados.filter((x) => RONDA_ES[x.turno])
        .sort((a, b) => ORDEN_RONDA.indexOf(a.turno) - ORDEN_RONDA.indexOf(b.turno))) {
        const nombreRonda = RONDA_ES[f.turno];
        if (!rondaIdPorNombre.has(nombreRonda)) {
            const id = crypto.randomUUID();
            rondaIdPorNombre.set(nombreRonda, id);
            nuevasRondas.push({
                id, phase_id: fasePlayoffs.id, season_id: TEMPORADA, name: nombreRonda,
                order_index: ++ordenPlayoffs,
                start_date: f.fecha, end_date: f.fecha, is_completed: true,
                notes: 'Fase final del Apertura (rugbyarchive)', created_at: ahora, updated_at: ahora,
            });
        }
        const roundId = rondaIdPorNombre.get(nombreRonda)!;

        const yaEsta = poPorPar.get(par(f.home, f.away));
        if (yaEsta) {
            const invertido = yaEsta.home_club_id === f.away;
            const hs = invertido ? f.as : f.hs;
            const as_ = invertido ? f.hs : f.as;
            const sc = yaEsta.score || {};
            if (yaEsta.status === 'final' && sc.home === hs && sc.away === as_ && yaEsta.round_uuid === roundId) continue;
            const base = puntosBase(hs, as_);
            rollback.push({ tabla: 'matches', id: yaEsta.id, antes: { status: yaEsta.status, score: yaEsta.score, round_uuid: yaEsta.round_uuid, round_label: yaEsta.round_label } });
            patchesPartido.push({
                id: yaEsta.id,
                patch: { status: 'final', score: { home: hs, away: as_ }, round_uuid: roundId, round_label: nombreRonda, home_base_points: base.home, away_base_points: base.away, home_bonus_points: 0, away_bonus_points: 0, points_autocalculated: true, updated_at: ahora },
                linea: `${nombreRonda}: ${f.home} ${hs}-${as_} ${f.away} (fila que ya existía)`,
            });
            continue;
        }

        // Se reserva primero un placeholder que ya nombre a uno de los dos clubes;
        // los totalmente vacíos no aportan información y sirven para cualquiera.
        const idx = disponibles.findIndex((p) => p.home_club_id === f.home || p.away_club_id === f.away);
        const slot = idx >= 0 ? disponibles.splice(idx, 1)[0] : disponibles.shift();
        const base = puntosBase(f.hs, f.as);
        if (slot) {
            rollback.push({ tabla: 'matches', id: slot.id, antes: { status: slot.status, score: slot.score, home_club_id: slot.home_club_id, away_club_id: slot.away_club_id, date_time: slot.date_time, round_uuid: slot.round_uuid, round_label: slot.round_label } });
            patchesPartido.push({
                id: slot.id,
                patch: { status: 'final', score: { home: f.hs, away: f.as }, home_club_id: f.home, away_club_id: f.away, date_time: `${f.fecha}T18:00:00.000Z`, round_uuid: roundId, round_label: nombreRonda, home_base_points: base.home, away_base_points: base.away, home_bonus_points: 0, away_bonus_points: 0, points_autocalculated: true, updated_at: ahora },
                linea: `${nombreRonda}: ${f.home} ${f.hs}-${f.as} ${f.away} (rellena el placeholder ${slot.id.slice(0, 8)})`,
            });
            continue;
        }
        inserts.push(filaPartido(fasePlayoffs.id, roundId, nombreRonda, f, ahora));
        lineasInsert.push(`${nombreRonda}: ${f.fecha} ${f.home} ${f.hs}-${f.as} ${f.away}`);
    }

    // ── 3 · Clausura: fase nueva, fechas y partidos ─────────────────────────
    const clausura = jugados.filter((x) => x.turno === 'Clausura tournament');
    let faseClausuraId = fases.find((f) => f.name === 'Torneo Clausura')?.id || null;
    if (clausura.length && !faseClausuraId) {
        faseClausuraId = crypto.randomUUID();
        nuevasFases.push({
            id: faseClausuraId, tournament_id: TORNEO, season_id: TEMPORADA,
            name: 'Torneo Clausura', phase_type: 'league',
            order_index: Math.max(0, ...fases.map((f) => f.order_index || 0)) + 1,
            // Un índice único deja UNA sola fase activa por temporada, y la tiene
            // "Fase Regular". El Clausura entra apagado, como "Playoffs".
            is_active: false,
            settings: { source: 'rugbyarchive-2026-sync', imported: true, origin: 'rugbyarchive', source_phase: 'Clausura tournament', standings: { mode: 'fully_manual', editable: false } },
            created_at: ahora, updated_at: ahora,
        });
    }
    const fechasClausura = [...new Set(clausura.map((c) => c.fecha))].sort();
    const rondaPorFecha = new Map<string, string>(
        faseClausuraId
            ? (await leer<{ id: string; name: string; start_date: string | null }>(`tournament_rounds?select=id,name,start_date&phase_id=eq.${faseClausuraId}`))
                .map((r) => [String(r.start_date || '').slice(0, 10), r.id])
            : []);
    let ordenClausura = Math.max(0, ...(faseClausuraId
        ? (await leer<{ order_index: number | null }>(`tournament_rounds?select=order_index&phase_id=eq.${faseClausuraId}`)).map((r) => r.order_index || 0)
        : [0]));
    fechasClausura.forEach((fecha, i) => {
        if (rondaPorFecha.has(fecha)) return;
        const id = crypto.randomUUID();
        rondaPorFecha.set(fecha, id);
        nuevasRondas.push({
            id, phase_id: faseClausuraId, season_id: TEMPORADA, name: `Fecha ${i + 1}`,
            order_index: ++ordenClausura, start_date: fecha, end_date: fecha, is_completed: true,
            notes: 'Torneo Clausura (rugbyarchive)', created_at: ahora, updated_at: ahora,
        });
    });
    const yaEnClausura = new Set(partidos.filter((p) => p.phase_id === faseClausuraId)
        .map((p) => `${p.date_time.slice(0, 10)}|${par(p.home_club_id || '', p.away_club_id || '')}`));
    for (const f of clausura) {
        if (yaEnClausura.has(`${f.fecha}|${par(f.home, f.away)}`)) continue;
        const rotulo = `Fecha ${fechasClausura.indexOf(f.fecha) + 1}`;
        inserts.push(filaPartido(faseClausuraId!, rondaPorFecha.get(f.fecha)!, rotulo, f, ahora));
        lineasInsert.push(`Clausura ${rotulo} ${f.fecha}: ${f.home} ${f.hs}-${f.as} ${f.away}`);
    }

    // ── 3b · El fixture por delante ─────────────────────────────────────────
    // Las fechas que faltan jugar del Clausura entran como `scheduled` y sin
    // marcador. Sin esto la pestaña Fixture queda vacía y el torneo parece
    // terminado cuando le quedan dos meses.
    const porJugarClausura = porJugar.filter((x) => x.turno === 'Clausura tournament');
    const fechasPorJugar = [...new Set(porJugarClausura.map((c) => c.fecha))].sort();
    for (const fecha of fechasPorJugar) {
        if (rondaPorFecha.has(fecha)) continue;
        const id = crypto.randomUUID();
        rondaPorFecha.set(fecha, id);
        nuevasRondas.push({
            id, phase_id: faseClausuraId, season_id: TEMPORADA,
            name: `Fecha ${fechasClausura.length + fechasPorJugar.indexOf(fecha) + 1}`,
            order_index: ++ordenClausura, start_date: fecha, end_date: fecha, is_completed: false,
            notes: 'Torneo Clausura (rugbyarchive)', created_at: ahora, updated_at: ahora,
        });
    }
    for (const f of porJugarClausura) {
        if (yaEnClausura.has(`${f.fecha}|${par(f.home, f.away)}`)) continue;
        const rotulo = `Fecha ${fechasClausura.length + fechasPorJugar.indexOf(f.fecha) + 1}`;
        // `score` y los puntos son NOT NULL: un partido por jugar va en cero,
        // igual que los `scheduled` que ya tenía el torneo.
        inserts.push({
            ...filaPartido(faseClausuraId!, rondaPorFecha.get(f.fecha)!, rotulo, { ...f, hs: 0, as: 0 }, ahora),
            status: 'scheduled', score: { home: 0, away: 0 },
            home_base_points: 0, away_base_points: 0,
            home_bonus_points: 0, away_bonus_points: 0,
            points_autocalculated: true,
            notes: 'Fixture importado desde rugbyarchive (Uruguayo de Clubes 2026)',
        });
        lineasInsert.push(`POR JUGAR ${rotulo} ${f.fecha}: ${f.home} vs ${f.away}`);
    }

    // ── 4 · Tablas ──────────────────────────────────────────────────────────
    const tablaActual = await leer<{ id: string; club_id: string; phase_id: string; position: number; played: number; points: number }>(
        `tournament_standings?select=id,club_id,phase_id,position,played,points&season_id=eq.${TEMPORADA}`);
    const patchesTabla: Array<{ id: string; patch: Record<string, unknown>; linea: string }> = [];
    const insertsTabla: Record<string, unknown>[] = [];

    for (const dest of [
        { fuente: 'Apertura tournament', phaseId: faseRegular.id, etiqueta: 'Apertura' },
        { fuente: 'Clausura tournament', phaseId: faseClausuraId, etiqueta: 'Clausura' },
    ]) {
        const filas = tablas.get(dest.fuente);
        if (!filas || !dest.phaseId) continue;
        const actualPorClub = new Map(tablaActual.filter((t) => t.phase_id === dest.phaseId).map((t) => [t.club_id, t]));
        for (const fila of filas) {
            const cuerpo = {
                position: fila.posicion, played: fila.jugados, won: fila.ganados,
                drawn: fila.empatados, lost: fila.perdidos, points: fila.puntos,
                scored: fila.aFavor, conceded: fila.enContra,
                bonus_points: fila.bonusOfensivo + fila.bonusDefensivo,
                stats: { imported: true, difference: fila.diferencia, try_bonus: fila.bonusOfensivo, losing_bonus: fila.bonusDefensivo, note: fila.nota, team_name: fila.nombreRA, status: fila.nota },
                last_updated: ahora,
            };
            const actual = actualPorClub.get(fila.clubId);
            if (!actual) {
                insertsTabla.push({ id: crypto.randomUUID(), tournament_id: TORNEO, season_id: TEMPORADA, phase_id: dest.phaseId, group_id: null, club_id: fila.clubId, form: null, streak: null, table_type: 'general', ...cuerpo });
                continue;
            }
            if (actual.position === fila.posicion && actual.played === fila.jugados && actual.points === fila.puntos) continue;
            rollback.push({ tabla: 'tournament_standings', id: actual.id, antes: { position: actual.position, played: actual.played, points: actual.points } });
            patchesTabla.push({ id: actual.id, patch: cuerpo, linea: `${dest.etiqueta} ${fila.posicion}º ${fila.clubId} PJ${fila.jugados} PTS${fila.puntos} (estaba ${actual.position}º PJ${actual.played} PTS${actual.points})` });
        }
    }

    // ── Informe ─────────────────────────────────────────────────────────────
    console.log(`\nfases nuevas: ${nuevasFases.length} · rondas nuevas: ${nuevasRondas.length}`);
    console.log(`partidos: ${patchesPartido.length} a actualizar, ${inserts.length} a insertar`);
    patchesPartido.forEach((p) => console.log('  ~', p.linea));
    lineasInsert.forEach((l) => console.log('  +', l));
    console.log(`tabla: ${patchesTabla.length} a actualizar, ${insertsTabla.length} a insertar`);
    patchesTabla.forEach((p) => console.log('  ~', p.linea));

    if (!APPLY) { console.log('\ndry-run: no se escribió una sola fila. Corré con --apply.'); return; }

    fs.writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2), 'utf8');
    console.log(`\nrespaldo del estado previo en ${ROLLBACK} (${rollback.length} filas)`);

    if (nuevasFases.length) await escribir('POST', 'tournament_phases', nuevasFases);
    if (nuevasRondas.length) await escribir('POST', 'tournament_rounds', nuevasRondas);
    for (const p of patchesPartido) await escribir('PATCH', `matches?id=eq.${p.id}`, p.patch);
    if (inserts.length) await escribir('POST', 'matches', inserts);
    for (const p of patchesTabla) await escribir('PATCH', `tournament_standings?id=eq.${p.id}`, p.patch);
    if (insertsTabla.length) await escribir('POST', 'tournament_standings', insertsTabla);
    console.log('listo.');
}

main().catch((e) => { console.error(e); process.exit(1); });
