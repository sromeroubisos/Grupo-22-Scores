/**
 * Arma el manifiesto que come la página de lote: por torneo, los partidos
 * finalizados del 29 y 30 de agosto y la tabla de la fase donde se jugaron.
 *
 *   node .tmp-finde/manifest.mjs
 *
 * Los escudos van SIEMPRE por el proxy (`/api/assets/team-logo?key=<id>`): en
 * `clubs.logo_url` hay base64 de 250 KB por club y traerlos acá revienta el JSON.
 */
import fs from 'node:fs/promises';
import { sb } from './sb.mjs';

const DESDE = '2026-08-29T00:00:00Z';
const HASTA = '2026-08-31T12:00:00Z';

// Rojo pleno con el acento en blanco: la paleta de todo lo que no lleva dorado.
const ROJO = { bgColor: '#c1121f', accentColor: '#ffffff' };
const GOLD_INK = { bgColor: '#161616', accentColor: '#eab308' };  // Gold Ink

/** Los torneos que van al lote, con su paleta y la fecha que se está jugando. */
const TORNEOS = [
    // Rojo y blanco.
    { id: '594fcb55-b052-4a8f-bf24-5a288e35e4f5', slug: 'pampeano', paleta: ROJO },
    { id: 'b0562cf3-4ea1-463e-86cb-86988dc22f10', slug: 'nea', paleta: ROJO },
    { id: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc', slug: 'noa-a', paleta: ROJO, fecha: 'Fecha 3' },
    { id: 'd29703d0-125c-44a1-ab38-137450935a6e', slug: 'urba-top-14', paleta: ROJO },
    // Gold Ink: sólo los diez que pidió el usuario.
    { id: 'e5c74c61-ff94-4091-9773-ec7303088fdc', slug: 'urba-primera-a', paleta: GOLD_INK },
    { id: '797e1b94-6397-4d73-a676-c166e40be5a9', slug: 'urba-primera-b', paleta: GOLD_INK },
    { id: 'd1c0af07-36ee-4234-8678-53fef1931e4f', slug: 'urba-primera-c', paleta: GOLD_INK },
    { id: '6c91c204-f5d7-4d10-9f10-0b3171c5501b', slug: 'urba-segunda', paleta: GOLD_INK },
    { id: '1c4af912-d157-4c93-afd3-8dac0a4539b4', slug: 'urba-tercera', paleta: GOLD_INK },
    { id: 'e0e20e06-8c98-4804-9edc-2cc978b7da56', slug: 'urba-desarrollo', paleta: GOLD_INK },
    { id: '3a335922-dc88-42a8-84d3-c38b57b46bca', slug: 'noa-b', paleta: GOLD_INK },
    { id: 'c1e37680-3f1e-482a-8dc6-c14f4ba417c7', slug: 'nea-ascenso', paleta: GOLD_INK },
    { id: 'b6ed4086-2e75-4e68-962b-2d2363c9694c', slug: 'super-9-b', paleta: GOLD_INK, fecha: 'Fecha 14' },
    { id: 'b28a55ac-b372-4b89-ba81-ee43232abffb', slug: 'litoral-b', paleta: GOLD_INK },
    { id: 'b1ba2ecc-06e3-400f-9a45-1385321aad46', slug: 'litoral-a', paleta: ROJO },
    { id: '55f28144-3d92-484b-a57d-646e06740808', slug: 'top-10-centro', paleta: ROJO },
    { id: '166c2906-4a73-4354-a8c4-c64342ed875d', slug: 'copa-oro-oeste', paleta: ROJO },
];

const DIAS = { '2026-08-29': 'Sáb 29', '2026-08-30': 'Dom 30' };

function proxyClub(id) {
    return `/api/assets/team-logo?key=${encodeURIComponent(id)}`;
}

function proxyTorneo(id) {
    return `/api/assets/team-logo?key=${encodeURIComponent(id)}&entity=tournament`;
}

async function main() {
    const ids = TORNEOS.map((t) => t.id);
    const { data: torneos, error: errT } = await sb
        .from('tournaments').select('id, name, country').in('id', ids);
    if (errT) throw errT;
    const nombre = new Map(torneos.map((t) => [t.id, t.name]));

    const { data: partidos, error: errM } = await sb
        .from('matches')
        .select('id, tournament_id, phase_id, group_id, date_time, home_club_id, away_club_id, score, status, round_label')
        .in('tournament_id', ids).gte('date_time', DESDE).lt('date_time', HASTA)
        .order('date_time');
    if (errM) throw errM;

    const clubIds = new Set();
    for (const m of partidos) { clubIds.add(m.home_club_id); clubIds.add(m.away_club_id); }

    // Las tablas de las fases donde se jugó este fin de semana.
    const fases = new Map();
    for (const m of partidos) {
        if (!m.phase_id) continue;
        fases.set(`${m.tournament_id}|${m.phase_id}`, { tournamentId: m.tournament_id, phaseId: m.phase_id });
    }
    const tablas = new Map();
    for (const { tournamentId, phaseId } of fases.values()) {
        const { data: filas, error } = await sb
            .from('tournament_standings')
            .select('club_id, group_id, position, played, won, drawn, lost, points, scored, conceded, table_type, stats')
            .eq('tournament_id', tournamentId).eq('phase_id', phaseId).order('position');
        if (error) throw error;
        const generales = (filas ?? []).filter((f) => !f.table_type || f.table_type === 'general');
        if (generales.length) {
            tablas.set(tournamentId, generales);
            for (const f of generales) clubIds.add(f.club_id);
        }
    }

    const clubes = new Map();
    const listaClubes = [...clubIds].filter(Boolean);
    for (let i = 0; i < listaClubes.length; i += 200) {
        const { data, error } = await sb.from('clubs').select('id, name, short_name').in('id', listaClubes.slice(i, i + 200));
        if (error) throw error;
        for (const c of data) clubes.set(c.id, c.short_name || c.name || c.id);
    }

    const salida = [];
    for (const conf of TORNEOS) {
        const propios = partidos.filter((m) => m.tournament_id === conf.id && m.status === 'final');
        const pendientes = partidos.filter((m) => m.tournament_id === conf.id && m.status !== 'final');
        const etiquetas = [...new Set(propios.map((m) => m.round_label).filter(Boolean))];
        const fecha = conf.fecha ?? (etiquetas.length === 1 ? etiquetas[0] : null);

        salida.push({
            slug: conf.slug,
            tournamentId: conf.id,
            nombre: nombre.get(conf.id) ?? conf.slug,
            paleta: conf.paleta,
            fecha,
            subtitulo: fecha ? `${fecha} · 29 y 30 de agosto` : '29 y 30 de agosto',
            tournamentLogo: proxyTorneo(conf.id),
            pendientes: pendientes.length,
            partidos: propios.map((m) => ({
                homeTeam: clubes.get(m.home_club_id) ?? m.home_club_id,
                awayTeam: clubes.get(m.away_club_id) ?? m.away_club_id,
                homeLogo: proxyClub(m.home_club_id),
                awayLogo: proxyClub(m.away_club_id),
                homeScore: m.score?.home ?? 0,
                awayScore: m.score?.away ?? 0,
                time: 'FT',
                status: 'finished',
                dateLabel: DIAS[String(m.date_time).slice(0, 10)] ?? '',
                kickoffAt: m.date_time,
            })),
            tabla: (tablas.get(conf.id) ?? []).map((f) => ({
                pos: f.position,
                team: clubes.get(f.club_id) ?? f.stats?.team_name ?? f.club_id,
                teamLogo: proxyClub(f.club_id),
                played: f.played,
                won: f.won,
                lost: f.lost,
                diff: `${f.scored - f.conceded > 0 ? '+' : ''}${f.scored - f.conceded}`,
                points: f.points,
                groupId: f.group_id,
            })),
        });
    }

    await fs.writeFile('public/__lote-manifest.json', JSON.stringify(salida, null, 1), 'utf8');

    for (const t of salida) {
        const gruposTabla = new Set(t.tabla.map((f) => f.groupId ?? '—'));
        console.log(
            `${String(t.partidos.length).padStart(2)} partidos · ${String(t.tabla.length).padStart(2)} filas`
            + ` · grupos=${[...gruposTabla].join(',')}`
            + ` · ${t.pendientes ? `${t.pendientes} sin cargar · ` : ''}${t.fecha ?? 'sin fecha'} · ${t.nombre}`
        );
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
