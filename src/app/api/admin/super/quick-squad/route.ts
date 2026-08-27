/**
 * CARGA RÁPIDA DE UN PLANTEL, con el plazo que cubre.
 *
 * Pegar una lista de nombres y que quede el plantel. Existía el editor de UN plantel
 * (`/admin/super/clubes/[id]/planteles/[squadId]`) pero no había por dónde crearlo,
 * así que en la práctica no había forma de cargar uno: de 2.976 clubes, 5 tenían
 * plantel.
 *
 * ── EL PLAZO ──────────────────────────────────────────────────────────────────
 * Un plantel no es para siempre: es de una temporada, de una gira, de un torneo. El
 * plazo se guarda por jugador en `team_memberships.joined_at` / `left_at`, que es
 * donde ya vivía, y no en una tabla nueva. Así un refuerzo que llega en junio o un
 * jugador que se va en agosto se cuentan bien sin tocar el resto del plantel.
 *
 * ── EL EQUIPO EXTERNO NO TIENE DÓNDE GUARDAR ──────────────────────────────────
 * "Argentina" es un equipo del proveedor (`fs-team-lrM6RMBU`) y no un club de la
 * plataforma, y el plantel se cuelga de un club. Cuando falta, se crea la ficha de
 * club y se la vincula por `external_id` — la misma llave que ya usa el resto del
 * sistema. Es un efecto colateral real y por eso la respuesta lo informa
 * (`clubCreated`), para que la pantalla lo pueda decir en voz alta.
 */

import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import { resolveClubIdForTeamKey } from '@/lib/services/teamSquad';
import { findPlayerMatches, normalizePlayerName } from '@/lib/services/playerNameMatch';

type PlayerInput = {
    number?: number | string | null;
    name?: string | null;
    position?: string | null;
    /** La ficha que el que carga dijo que es. Si viene, no se pregunta ni se adivina. */
    personId?: string | null;
    /** Dijo explicitamente que es alguien nuevo, aunque haya una ficha parecida. */
    isNew?: boolean | null;
};

const MAX_JUGADORES = 60;

function texto(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s || null;
}

function sinAcentos(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function slugify(value: string): string {
    return sinAcentos(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

/** El id del proveedor sin el prefijo con el que viaja por la plataforma. */
function stripTeamPrefix(value: string): string {
    const lower = value.toLowerCase();
    if (lower.startsWith('fs-team-')) return value.slice(8);
    if (lower.startsWith('ra-team-')) return value.slice(8);
    if (lower.startsWith('ras-team-')) return value.slice(9);
    if (lower.startsWith('espn-team-')) return value.slice(10);
    return value;
}

/**
 * "Juan Ignacio Pérez" → nombre "Juan Ignacio", apellido "Pérez". Es una convención,
 * no una verdad: hay apellidos compuestos que quedan partidos. Igual se guarda el
 * nombre completo tal cual lo escribieron, que es lo que se muestra.
 */
function partirNombre(completo: string): { first: string; last: string } {
    const partes = completo.split(/\s+/).filter(Boolean);
    if (partes.length === 1) return { first: partes[0], last: partes[0] };
    return { first: partes.slice(0, -1).join(' '), last: partes[partes.length - 1] };
}

function claveDeNombre(value: string): string {
    return sinAcentos(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fechaValida(value: unknown): string | null {
    const s = texto(value);
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) ? null : s;
}

export async function POST(request: Request) {
    try {
        await requireSuperAdmin();
    } catch {
        return NextResponse.json({ error: 'Necesitás ser super admin.' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'El cuerpo no es JSON válido.' }, { status: 400 });
    }

    const teamKey = texto(body.teamKey);
    const teamName = texto(body.teamName);
    const sport = texto(body.sport) || 'rugby';
    const desde = fechaValida(body.from);
    const hasta = fechaValida(body.to);
    const jugadoresCrudos = Array.isArray(body.players) ? (body.players as PlayerInput[]) : [];

    if (!teamKey) {
        return NextResponse.json({ error: 'Falta el equipo.' }, { status: 400 });
    }
    if (body.from && !desde) {
        return NextResponse.json({ error: 'La fecha de inicio tiene que ser AAAA-MM-DD.' }, { status: 400 });
    }
    if (body.to && !hasta) {
        return NextResponse.json({ error: 'La fecha de fin tiene que ser AAAA-MM-DD.' }, { status: 400 });
    }
    if (desde && hasta && desde > hasta) {
        return NextResponse.json({ error: 'El plantel no puede terminar antes de empezar.' }, { status: 400 });
    }

    const jugadores = jugadoresCrudos
        .map((p) => {
            const name = texto(p?.name);
            if (!name) return null;
            const numero = Number.parseInt(String(p?.number ?? ''), 10);
            return {
                name,
                position: texto(p?.position),
                number: Number.isFinite(numero) ? numero : null,
                personId: texto(p?.personId),
                isNew: p?.isNew === true,
            };
        })
        .filter((p): p is { name: string; position: string | null; number: number | null; personId: string | null; isNew: boolean } => p !== null)
        .slice(0, MAX_JUGADORES);

    if (jugadores.length === 0) {
        return NextResponse.json({ error: 'No mandaste ningún jugador.' }, { status: 400 });
    }

    try {
        const supabase = await createClient();

        // ── El club donde vive el plantel ────────────────────────────────────
        let club = await resolveClubIdForTeamKey(supabase, teamKey);
        let clubCreated = false;

        if (!club) {
            if (!teamName) {
                return NextResponse.json(
                    { error: 'Este equipo no tiene ficha de club y no me mandaste el nombre para crearla.' },
                    { status: 400 },
                );
            }

            const nuevoId = slugify(teamName);
            if (!nuevoId) {
                return NextResponse.json({ error: 'No pude armar un identificador con ese nombre.' }, { status: 400 });
            }

            const { data: creado, error: errorAlta } = await supabase
                .from('clubs')
                .insert({
                    id: nuevoId,
                    name: teamName,
                    external_id: stripTeamPrefix(teamKey),
                    sport_id: sport,
                    sport,
                    is_visible: true,
                })
                .select('id, name')
                .single();

            if (errorAlta) {
                return NextResponse.json(
                    { error: `No pude crear la ficha de club: ${errorAlta.message}` },
                    { status: 500 },
                );
            }

            club = { clubId: creado.id as string, clubName: texto(creado.name) };
            clubCreated = true;
        }

        // ── ¿Alguno de estos ya tiene ficha? ─────────────────────────────────
        // Se buscan candidatas en TODA la base y no solo en este club: un jugador
        // que llega de otro lado ya tiene ficha, y crearle una segunda es empezar a
        // partir su historial en dos.
        const { data: todas } = await supabase
            .from('people')
            .select('id, full_name, name, first_name, last_name, club_id')
            .limit(5000);

        const fichas = ((todas || []) as Array<Record<string, unknown>>).map((p) => ({
            id: String(p.id),
            fullName: texto(p.full_name)
                || texto(p.name)
                || `${texto(p.first_name) || ''} ${texto(p.last_name) || ''}`.trim(),
            clubId: texto(p.club_id),
        })).filter((p) => p.fullName);

        // MODO CONSULTA: no escribe nada, solo devuelve a quién hay que preguntarle.
        // Va antes de cualquier insert a propósito: preguntar después de haber creado
        // la ficha no sirve de nada, el duplicado ya existe.
        if (texto(body.mode) === 'check') {
            const preguntas = jugadores
                .filter((j) => !j.personId && !j.isNew)
                .map((j) => ({
                    name: j.name,
                    matches: findPlayerMatches(j.name, fichas).map((m) => ({
                        id: m.person.id,
                        fullName: m.person.fullName,
                        clubId: fichas.find((f) => f.id === m.person.id)?.clubId ?? null,
                        kind: m.kind,
                    })),
                }))
                .filter((p) => p.matches.length > 0);

            return NextResponse.json({
                ok: true,
                mode: 'check',
                clubId: club.clubId,
                clubName: club.clubName,
                clubCreated,
                questions: preguntas,
            });
        }

        // ── Las fichas que faltan ────────────────────────────────────────────
        const idsValidos = new Set(fichas.map((f) => f.id));
        const porNombre = new Map<string, string>();
        for (const f of fichas) {
            if (f.clubId === club.clubId) porNombre.set(normalizePlayerName(f.fullName), f.id);
        }

        const decidido = new Map<string, string>();
        for (const j of jugadores) {
            if (j.personId && idsValidos.has(j.personId)) decidido.set(j.name, j.personId);
        }

        // Sin decisión explícita, solo se reusa la ficha con el nombre IDÉNTICO de
        // este mismo club. Lo parecido nunca se resuelve solo: para eso está la
        // consulta de arriba.
        const nuevos = jugadores.filter((j) => {
            if (decidido.has(j.name)) return false;
            if (j.isNew) return true;
            return !porNombre.has(normalizePlayerName(j.name));
        });

        if (nuevos.length > 0) {
            const filas = nuevos.map((j) => {
                const { first, last } = partirNombre(j.name);
                return {
                    club_id: club!.clubId,
                    first_name: first,
                    last_name: last,
                    full_name: j.name,
                    name: j.name,
                    position: j.position,
                    status: 'active',
                    source: 'quick-squad',
                };
            });

            const { data: insertados, error: errorPersonas } = await supabase
                .from('people')
                .insert(filas)
                .select('id, full_name');

            if (errorPersonas) {
                return NextResponse.json(
                    { error: `No pude crear las fichas: ${errorPersonas.message}` },
                    { status: 500 },
                );
            }

            for (const p of (insertados || []) as Array<Record<string, unknown>>) {
                const completo = texto(p.full_name);
                const id = texto(p.id);
                if (completo && id) decidido.set(completo, id);
            }
        }

        // ── Las membresías, con el plazo ─────────────────────────────────────
        const membresias = jugadores
            .map((j) => {
                const personId = decidido.get(j.name) ?? porNombre.get(normalizePlayerName(j.name));
                if (!personId) return null;
                return {
                    club_id: club!.clubId,
                    person_id: personId,
                    position: j.position,
                    jersey_number: j.number,
                    status: 'active',
                    role: 'player',
                    joined_at: desde,
                    left_at: hasta,
                };
            })
            .filter(Boolean) as Array<Record<string, unknown>>;

        // Se reemplaza el plantel DE ESTE PLAZO, no el del club entero. La diferencia
        // es todo: un club tiene un plantel por temporada y los de años anteriores
        // tienen que seguir ahí. Borrar por club dejaba una sola lista viva y hacía
        // desaparecer la del año pasado apenas se cargaba la nueva.
        //
        // Reemplazar (y no sumar) dentro del plazo sí es lo correcto: cargar la lista
        // corregida de la misma temporada tiene que pisar la anterior, o los que se
        // fueron quedan adentro para siempre.
        let borrado = supabase
            .from('team_memberships')
            .delete()
            .eq('club_id', club.clubId);
        borrado = desde ? borrado.eq('joined_at', desde) : borrado.is('joined_at', null);
        borrado = hasta ? borrado.eq('left_at', hasta) : borrado.is('left_at', null);
        const { error: errorBorrado } = await borrado;

        if (errorBorrado) {
            return NextResponse.json(
                { error: `No pude limpiar el plantel anterior: ${errorBorrado.message}` },
                { status: 500 },
            );
        }

        const { error: errorMembresias } = await supabase
            .from('team_memberships')
            .insert(membresias);

        if (errorMembresias) {
            return NextResponse.json(
                { error: `No pude guardar el plantel: ${errorMembresias.message}` },
                { status: 500 },
            );
        }

        return NextResponse.json({
            ok: true,
            clubId: club.clubId,
            clubName: club.clubName,
            clubCreated,
            players: membresias.length,
            from: desde,
            to: hasta,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido';
        console.error('[quick-squad]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
