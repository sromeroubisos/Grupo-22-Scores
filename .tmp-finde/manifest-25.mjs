/**
 * Manifiesto de la tanda del finde 25 al 27 de septiembre de 2026: una placa de
 * partido (G22 Base, horario, 4:5) por partido, con la paleta de cada grupo.
 *
 *   node .tmp-finde/manifest-25.mjs
 */
import fs from 'node:fs/promises';
import { sb } from './sb.mjs';

// Viernes 25 00:00 a domingo 27 23:59, hora argentina (UTC-3).
const DESDE = '2026-09-25T03:00:00Z';
const HASTA = '2026-09-28T03:00:00Z';

// Rugby Navy, la paleta predeterminada azul + celeste del catálogo: la placa
// deriva el campo sola de Fondo + Acento, sin forzar nada.
const NAVY = { previewColors: { bgColor: '#0f172a', accentColor: '#38bdf8' }, plateOptions: {} };
// Rojo pleno que se hunde en bordó, con el acento en BLANCO (pedido del
// usuario: en el fixture la cápsula, el torneo y la hora van en blanco).
const ROJO = {
    previewColors: { bgColor: '#4a0710', accentColor: '#ffffff' },
    plateOptions: { field: '#b3121d', fieldEnd: '#4a0710', ink: '#ffffff' },
};
// Gold Ink del catálogo. Por previewColors sale dorado pleno: el campo negro y la
// tinta dorada se fuerzan.
const GOLD_INK = {
    previewColors: { bgColor: '#161616', accentColor: '#eab308' },
    plateOptions: { field: '#161616', ink: '#eab308' },
};

const GRUPOS = [
    {
        carpeta: 'interior-a', paleta: NAVY,
        torneos: [{ id: 'ed986d61-7389-48e5-b478-c1703b0e8379', slug: 'interior-a', rotulo: 'Torneo del Interior "A"', etapa: 'fase', grupalPorEtapa: { Semifinal: 'Semifinales', Repechaje: 'Reválida' } }],
    },
    {
        carpeta: 'urba-top-14', paleta: ROJO,
        torneos: [{ id: 'd29703d0-125c-44a1-ab38-137450935a6e', slug: 'top-14', rotulo: 'Top 14 de la URBA', etapa: 'ronda' }],
    },
    {
        carpeta: 'noa', paleta: ROJO,
        torneos: [{ id: 'a4a4d389-5eaa-4e16-9024-81c54abe64cc', slug: 'noa-a', rotulo: 'Torneo Regional del NOA "A"', etapa: 'ronda' }],
    },
    {
        carpeta: 'uruguayo', paleta: NAVY,
        torneos: [{ id: '271638cc-3351-42ce-81bd-ef091e82515d', slug: 'uruguayo', rotulo: 'Uruguayo de Clubes', etapa: 'ronda' }],
    },
    {
        // Todo lo de la URBA que no es Top 14 (divisiones superiores; las
        // reservas y juveniles no entran).
        carpeta: 'urba', paleta: GOLD_INK,
        torneos: [
            { id: 'e5c74c61-ff94-4091-9773-ec7303088fdc', slug: 'urba-primera-a', rotulo: 'Primera "A" de la URBA', etapa: 'ronda' },
            { id: '797e1b94-6397-4d73-a676-c166e40be5a9', slug: 'urba-primera-b', rotulo: 'Primera "B" de la URBA', etapa: 'ronda' },
            { id: 'd1c0af07-36ee-4234-8678-53fef1931e4f', slug: 'urba-primera-c', rotulo: 'Primera "C" de la URBA', etapa: 'ronda' },
            { id: '1c4af912-d157-4c93-afd3-8dac0a4539b4', slug: 'urba-tercera', rotulo: 'Tercera de la URBA', etapa: 'ronda' },
        ],
    },
    {
        carpeta: 'andina', paleta: GOLD_INK,
        torneos: [{ id: '0b54dbb4-a823-4946-9783-2601f2d9c700', slug: 'andina-apertura', rotulo: 'Apertura de la Unión Andina', etapa: 'ronda' }],
    },
    {
        carpeta: 'ascenso', paleta: GOLD_INK,
        torneos: [
            { id: '6c91c204-f5d7-4d10-9f10-0b3171c5501b', slug: 'urba-segunda', rotulo: 'Segunda de la URBA', etapa: 'ronda' },
            { id: '3a335922-dc88-42a8-84d3-c38b57b46bca', slug: 'noa-b', rotulo: 'Torneo Regional del NOA "B"', etapa: 'ronda' },
            { id: 'b6ed4086-2e75-4e68-962b-2d2363c9694c', slug: 'super-9-b', rotulo: 'Súper 9 "B"', etapa: 'ronda' },
            { id: '8e21ce2b-459c-40f5-8012-d0968d6a4d95', slug: 'copa-plata-oeste', rotulo: 'Copa Plata del Oeste', etapa: 'ronda' },
        ],
    },
];

// La fase "Cuartos de Final" del Interior A guarda las tres rondas del cuadro:
// los cuatro cuartos del 12/9, estos dos cruces del 26/9 y la final del 3/10.
// Por el cuadro (8 -> 4 -> 2 -> 1) los del 26/9 son las semifinales.
const ETAPA_CORREGIDA = {
    '07ba8b7a-173d-47ec-b4b3-dd65b0ffc5d3': 'Semifinal',
    '86bae874-ad7f-42a5-a8d3-37dc5a8348e1': 'Semifinal',
};

// El fixture en 9:16 tiene el panel de alto fijo y la fila topeada en 124 px:
// con siete partidos o menos queda media historia vacía. La plantilla deja
// escalar la fila, el escudo y la hora por contexto (`dailyMatches`); se estira
// la fila hasta llenar el panel (~1384 px de lista), con tope para que dos
// partidos no queden como dos barras gigantes.
function estirarFixture(n) {
    const lista = 1384;
    const hueco = 12;
    const fila = Math.min(200, (lista - hueco * (n - 1)) / n);
    const factor = fila / 124;
    // El render pide el estado COMPLETO (itera `typography`); va vacío para
    // que todo lo que no se nombra caiga en su valor de base.
    return {
        typography: [], typographyContexts: [], palette: [], styleRules: [],
        previewAccent: '#ffffff', previewSurface: '#000000',
        previewGradientFrom: '#000000', previewGradientTo: '#000000', previewMode: 'soft',
        elementDimensionContexts: [{
            id: 'dailyMatches',
            items: [
                { id: 'rowHeight', width: Math.round(124 * factor), offsetY: 0 },
                { id: 'teamLogo', width: Math.round(68 * Math.min(1.45, factor)), offsetY: 0 },
                { id: 'score', width: Math.round(44 * Math.min(1.35, factor)), offsetY: 0 },
            ],
        }],
    };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function horaArgentina(iso) {
    const d = new Date(Date.parse(iso) - 3 * 3600e3);
    return {
        fecha: `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de septiembre`,
        hora: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
    };
}

function slug(texto) {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// "Cancha 1." sola no es una sede: al pie no dice nada.
function sede(venue) {
    const v = String(venue ?? '').trim();
    return /^cancha\s*\d+\.?$/i.test(v) ? '' : v;
}

function logoTorneo(url) {
    if (!url || url.startsWith('data:')) return undefined;
    return url;
}

async function main() {
    const ids = GRUPOS.flatMap((g) => g.torneos.map((t) => t.id));
    const { data: torneos, error: errT } = await sb.from('tournaments').select('id, name, logo_url').in('id', ids);
    if (errT) throw errT;
    const torneoPorId = new Map(torneos.map((t) => [t.id, t]));

    const { data: partidos, error: errM } = await sb.from('matches')
        .select('id, tournament_id, phase_id, date_time, venue, home_club_id, away_club_id, status, round_label, is_visible')
        .in('tournament_id', ids).gte('date_time', DESDE).lt('date_time', HASTA)
        .order('date_time').order('id');
    if (errM) throw errM;

    const faseIds = [...new Set(partidos.map((m) => m.phase_id).filter(Boolean))];
    const { data: fases } = await sb.from('tournament_phases').select('id, name').in('id', faseIds);
    const fasePorId = new Map((fases ?? []).map((f) => [f.id, f.name]));

    const clubIds = [...new Set(partidos.flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
    const { data: clubes, error: errC } = await sb.from('clubs').select('id, name, short_name').in('id', clubIds);
    if (errC) throw errC;
    const clubPorId = new Map(clubes.map((c) => [c.id, c]));

    const salida = [];
    const control = [];
    const vistos = new Map();

    for (const grupo of GRUPOS) {
        for (const conf of grupo.torneos) {
            const t = torneoPorId.get(conf.id);
            const propios = partidos.filter((m) => m.tournament_id === conf.id);
            const fila = { torneo: t?.name, encontrados: propios.length, exporta: 0, excluidos: [], duplicados: [], sinDatos: [] };
            let n = 0;
            for (const m of propios) {
                const local = clubPorId.get(m.home_club_id);
                const visita = clubPorId.get(m.away_club_id);
                const etiqueta = `${local?.name ?? m.home_club_id} vs ${visita?.name ?? m.away_club_id} (${m.id.slice(0, 8)})`;
                if (m.status !== 'scheduled' && m.status !== 'live') {
                    fila.excluidos.push(`${etiqueta}: ${m.status}`);
                    continue;
                }
                if (!local || !visita) {
                    fila.sinDatos.push(`${etiqueta}: club sin ficha`);
                    continue;
                }
                // La clave es natural, no el id: dos filas del mismo cruce a la
                // misma hora son el mismo partido aunque vengan con otro id.
                const clave = [Date.parse(m.date_time), m.home_club_id, m.away_club_id].join('|');
                if (vistos.has(clave)) {
                    fila.duplicados.push(`${etiqueta} = ${vistos.get(clave)}`);
                    continue;
                }
                vistos.set(clave, `${t?.name} ${m.id.slice(0, 8)}`);

                const { fecha, hora } = horaArgentina(m.date_time);
                const etapa = ETAPA_CORREGIDA[m.id] ?? (conf.etapa === 'fase' ? fasePorId.get(m.phase_id) : m.round_label);
                n += 1;
                fila.exporta += 1;
                salida.push({
                    carpeta: `${grupo.carpeta}-historia`,
                    nombre: `${conf.slug}-${String(n).padStart(2, '0')}-${slug(local.short_name || local.name)}-vs-${slug(visita.short_name || visita.name)}`,
                    template: 'matchStats',
                    format: '1080x1920',
                    matchExportMode: 'schedule',
                    previewColors: grupo.paleta.previewColors,
                    plateOptions: grupo.paleta.plateOptions,
                    matchId: m.id,
                    corto: { local: local.short_name || local.name, visita: visita.short_name || visita.name },
                    data: {
                        status: 'scheduled',
                        homeTeam: local.name,
                        awayTeam: visita.name,
                        homeScore: null,
                        awayScore: null,
                        homeLogo: `/api/assets/team-logo?key=${encodeURIComponent(local.id)}&entity=club&noFallback=1`,
                        awayLogo: `/api/assets/team-logo?key=${encodeURIComponent(visita.id)}&entity=club&noFallback=1`,
                        tournament: etapa ? `${etapa} - ${conf.rotulo}` : conf.rotulo,
                        tournamentId: conf.id,
                        tournamentLogo: logoTorneo(t?.logo_url),
                        date: fecha,
                        time: hora,
                        venue: sede(m.venue) || undefined,
                        kickoffAt: m.date_time,
                        sport: 'rugby',
                        stats: [],
                    },
                });
            }
            control.push({ grupo: grupo.carpeta, ...fila });

            // La placa GRUPAL del torneo: el fixture con los mismos partidos que
            // salieron en individual, ni uno más.
            const todos = salida.filter((p) => p.template === 'matchStats' && p.data.tournamentId === conf.id);
            // El Interior "A" va en DOS grupales: semifinales por un lado y
            // reválida por el otro (pedido del usuario). El resto, uno por torneo.
            const tandas = conf.grupalPorEtapa
                ? [...new Set(todos.map((p) => p.data.tournament.split(' - ')[0]))].map((etapa) => ({
                    sufijo: `-${slug(conf.grupalPorEtapa[etapa] ?? etapa)}`,
                    rotuloEtapa: conf.grupalPorEtapa[etapa] ?? etapa,
                    partidos: todos.filter((p) => p.data.tournament.startsWith(`${etapa} - `)),
                }))
                : [{ sufijo: '', rotuloEtapa: null, partidos: todos }];
            for (const { sufijo, rotuloEtapa, partidos: individuales } of tandas) {
            if (individuales.length) {
                const etapas = [...new Set(individuales.map((p) => p.data.tournament.includes(' - ') ? p.data.tournament.split(' - ')[0] : null).filter(Boolean))];
                const dias = [...new Set(individuales.map((p) => p.data.date))];
                const rangoDias = dias.length === 1 ? dias[0] : `${dias[0].replace(/ de septiembre$/, '')} al ${dias[dias.length - 1]}`;
                salida.push({
                    carpeta: 'grupales-historia',
                    nombre: `${conf.slug}${sufijo}-fixture`,
                    template: 'dailyMatches',
                    format: '1080x1920',
                    matchExportMode: 'schedule',
                    previewColors: grupo.paleta.previewColors,
                    plateOptions: grupo.paleta.plateOptions,
                    data: {
                        date: rotuloEtapa ? `${rotuloEtapa} · ${rangoDias}` : (etapas.length ? `${etapas.join(' y ')} · ${rangoDias}` : rangoDias),
                        tournament: conf.rotulo,
                        tournamentId: conf.id,
                        tournamentLogo: individuales[0].data.tournamentLogo,
                        matches: individuales.map((p) => ({
                            homeTeam: p.corto.local,
                            awayTeam: p.corto.visita,
                            homeTeamFull: p.data.homeTeam,
                            awayTeamFull: p.data.awayTeam,
                            homeLogo: p.data.homeLogo,
                            awayLogo: p.data.awayLogo,
                            time: p.data.time,
                            status: 'scheduled',
                            dateLabel: p.data.date.replace(/ de septiembre$/, ''),
                            kickoffAt: p.data.kickoffAt,
                        })),
                    },
                });
            }
            }
        }
    }

    await fs.writeFile('public/__lote-manifest.json', JSON.stringify(salida, null, 1), 'utf8');
    await fs.writeFile('.tmp-finde/control-25.json', JSON.stringify(control, null, 1), 'utf8');

    for (const c of control) {
        console.log(`[${c.grupo}] ${c.torneo}: ${c.encontrados} encontrados · ${c.exporta} a exportar`);
        for (const e of c.excluidos) console.log(`   excluido  ${e}`);
        for (const e of c.duplicados) console.log(`   duplicado ${e}`);
        for (const e of c.sinDatos) console.log(`   sin datos ${e}`);
    }
    for (const p of salida) console.log(`${p.carpeta}/${p.nombre} · ${p.format} · ${p.data.tournament} · ${p.data.date} ${p.data.time ?? `${p.data.matches?.length} partidos`}${p.data.venue ? ` · ${p.data.venue}` : ''}${p.data.tournamentLogo ? '' : ' · SIN LOGO DE TORNEO'}`);
    console.log(`TOTAL ${salida.length} placas`);
}

main().catch((e) => { console.error(e); process.exit(1); });
