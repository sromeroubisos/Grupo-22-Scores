/**
 * Carga los dos amistosos de pretemporada 2026/27 de Provence Rugby:
 *
 *   npx ts-node src/scripts/provence-amistosos-2026.ts --plan
 *   npx ts-node src/scripts/provence-amistosos-2026.ts --execute
 *
 * (el arranque real está al pie de este comentario: los alias `@/` piden
 * `ts-node -r tsconfig-paths/register`, ver AL FINAL de este bloque)
 *
 *   1. Provence Rugby 42 - 19 Nissa Rugby   · 13/08/2026 · Stade Maurice-David
 *   2. Soyaux-Angoulême XV 33 - 19 Provence · 19/08/2026 · Stade Chanzy
 *
 * Un amistoso es un partido de `matches` con `tournament_id` en null y el
 * deporte cargado a mano — es lo que valida `POST /api/matches`
 * ("Sport is required for friendly matches"). No hay torneo, no hay fase y no
 * hay entrada de temporada: el partido se dibuja solo desde `matches` y sale
 * en la ficha de los dos clubes.
 *
 * Las formaciones NO se escriben como jsonb crudo. Van por
 * `persistMatchCenterSupplementalData`, la misma función que usa
 * `PATCH /api/admin/matches/[id]`: resuelve cada nombre contra `people`, crea
 * la ficha que falta y escribe `club_person_roles` y `squad_members`. Un INSERT
 * del jsonb a mano deja a los jugadores sin `id` y sin ficha, y la pestaña de
 * jugadores del partido queda muerta.
 *
 * Los contadores `lineup_home_count`, `lineup_away_count` y `events_count` NO
 * los toca nadie: no hay trigger y el servicio tampoco los escribe. Se anotan
 * acá, en el mismo paso, o la pestaña de alineaciones queda apagada aunque el
 * jsonb tenga los quince.
 *
 * MINUTOS: los clubes no publican la planilla, publican la crónica. Cuando la
 * crónica da el minuto, va el minuto; cuando no lo da, el evento va con
 * `minute: 0` y con `order` explícito. `MatchTimeline` ordena por `order` antes
 * que por minuto, así que la secuencia se lee bien igual y el 0' avisa que el
 * dato no existe. Inventar un minuto plausible sería peor: se vuelve
 * indistinguible de un dato real.
 *
 * Fuentes:
 * - https://www.provencerugby.com/une-premiere-reussie-face-a-nissa-rugby/ (13/08)
 * - https://www.provencerugby.com/provence-rugby-nissa-rugby-le-groupe/ (12/08, la compo)
 * - https://www.provencerugby.com/provence-rugby-poursuit-sa-preparation-a-angouleme/ (18/08)
 * - https://www.saxvcharente.fr/place-au-championnat/ (19/08, la crónica del SA XV)
 * Los nombres de pila salen de las páginas de plantel de cada club
 * (provencerugby.com/lequipe-pro, /le-centre-de-formation, saxvcharente.fr,
 * allrugby.com para Nissa).
 *
 * Cómo correrlo (los alias `@/` no los resuelve `node --experimental-strip-types`):
 *
 *   TS_NODE_TRANSPILE_ONLY=true \
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","allowImportingTsExtensions":false,"noEmit":false}' \
 *   node -r ts-node/register -r tsconfig-paths/register src/scripts/provence-amistosos-2026.ts --plan
 */
import path from 'node:path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}

// El import va después de cargar el .env: el servicio no lee variables al
// importarse, pero cualquier módulo que arrastre sí puede.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { persistMatchCenterSupplementalData } = require('@/lib/services/matchCenterService') as typeof import('../lib/services/matchCenterService');

const EXECUTE = process.argv.includes('--execute');

type LineupPlayer = { number: number; name: string; position: string; isCaptain?: boolean };
type EventInput = {
    minute: number | null;
    period: '1T' | '2T';
    type: string;
    team: 'home' | 'away';
    playerName?: string;
    detail?: string;
};

type FriendlyMatch = {
    externalId: string;
    /**
     * Candidatos, en orden de preferencia: se usa el PRIMERO que exista en
     * `clubs`. Angoulême estaba cargado tres veces (`sc-angouleme`,
     * `soyaux-angouleme-xv`, `angouleme`) y `catalogo-fusionar-clubes.ts` deja
     * uno solo. Un id fijo acá dejaría el script roto de un lado u otro de esa
     * fusión, según cuándo se corra.
     */
    homeClubId: string | string[];
    awayClubId: string | string[];
    dateTime: string;
    venue: string;
    score: { home: number; away: number };
    roundLabel: string;
    notes: string;
    lineups: { home: LineupPlayer[]; away: LineupPlayer[] };
    events: EventInput[];
};

/* ── posiciones: el vocabulario que ya usa `people.position` en la base ── */
const PI = 'Pilar Izquierdo';
const HK = 'Hooker';
const PD = 'Pilar Derecho';
const SL = 'Segunda línea';
const TL = 'Tercera línea';
const N8 = 'Octavo';
const MS = 'Medio scrum';
const AP = 'Apertura';
const WI = 'Wing';
const CE = 'Centro';
const FB = 'Fullback';

const xv = (names: Array<[string, string]>, captain?: string): LineupPlayer[] =>
    names.map(([name, position], i) => ({
        number: i + 1,
        name,
        position,
        isCaptain: captain === name,
    }));

const bench = (names: Array<[string, string]>, from: number): LineupPlayer[] =>
    names.map(([name, position], i) => ({ number: from + i, name, position }));

/* ══════════════════════════════════════════════════════════════════════════
 * 1) Provence Rugby 42 - 19 Nissa Rugby · jueves 13/08/2026, 19:30 (Aix)
 * ════════════════════════════════════════════════════════════════════════ */

const PROVENCE_VS_NISSA: FriendlyMatch = {
    externalId: 'provencerugby:2026-08-13-provence-nissa',
    homeClubId: 'provence-rugby',
    awayClubId: 'nissa',
    dateTime: '2026-08-13T17:30:00+00:00', // 19:30 en Aix-en-Provence (UTC+2)
    venue: 'Stade Maurice-David, Aix-en-Provence',
    score: { home: 42, away: 19 },
    roundLabel: 'Amistoso de pretemporada · 2026/27',
    notes: [
        'Amistoso de pretemporada 2026/27.',
        'Crónica y formaciones: provencerugby.com (12 y 13/08/2026).',
        'El club no identifica al autor del primer try ni al del try nizardo de los 44,',
        'ni da el minuto de las dos últimas conquistas de Nissa: esos eventos van con el',
        'minuto en 0 y ordenados por la secuencia de la crónica.',
    ].join(' '),
    lineups: {
        home: [
            ...xv([
                ['Andrea Pontanier', PI],
                ['Vincent Giudicelli', HK],
                ['Aurélien Azar', PD],
                ['Andres Zafra', SL],
                ['Yannick Youyoutte', SL],
                ['Thibaut Martel', TL],
                ['Teimana Harrison', TL],
                ['Albert Tuisue', N8],
                ['Joris Cazenave', MS],
                ['Romain Trouilloud', AP],
                ['Nadir Bouhedjeur', WI],
                ['Inga Finau', CE],
                ['Baptiste Lenoir', CE],
                ['Adrien Lapègue', WI],
                ['Martin Bogado', FB],
            ], 'Andres Zafra'),
            ...bench([
                ['Lino Julien', PI],
                ['Noam Pion', PI],
                ['Augustin Mollet', HK],
                ['Joris Cavaglieri', HK],
                ['Hugo Ndiaye', PD],
                ['Elliot Yemsi', PD],
                ['Cyprien Kileztky', SL],
                ['Sjoerd Bakker', SL],
                ['Charly Gambini', TL],
                ['Raphaël Portat', SL],
                ['Tom Noble', MS],
                ['Thomas Salles', AP],
                ['Sireli Masiwini', WI],
                ['Pierre Lucas', CE],
                ['Valentin Ibanez', CE],
            ], 16),
        ],
        away: [
            ...xv([
                ['Vazha Kapanadze', PI],
                ['Martinez', HK], // el club no da el nombre de pila y el plantel tiene dos Martinez
                ['Beau Farrance', PD],
                ['Thibaud Rey', SL],
                ['Evan Olmstead', SL],
                ['Hugo Sarrasin', TL],
                ['Bastien Berenguel', TL],
                ['Hanru Sirgel', N8],
                ['Guillaume Rouet', MS],
                ['Owen Williams', AP],
                ['Kurukuruvakatini', WI],
                ['Francis Saili', CE],
                ['Jean-Pascal Barraque', CE],
                ['Clément Egiziano', WI],
                ['Boris Goutard', FB],
            ]),
            ...bench([
                ['Hayden Thompson-Stringer', PD],
                ['Chauvin', ''],
                ['Farai Mudariki', PI],
                ['Christiaan Van Der Merwe', SL],
                ['Adrian Moțoc', SL],
                ['Lucas Bachelier', TL],
                ['Masivesi Dakuwaqa', TL],
                ['Théo Idjellidaine', MS],
                ['Pablo Patilla', CE],
                ['Bautista Ezcurra', CE],
                ['Baptiste Lafond', CE],
                ['Vincent Rattez', WI],
                ['Julien Farnoux', FB],
                ['Étienne Falgoux', PI],
                ['Pat Leafa', HK],
                ['Nicolás Ciancio', PD],
                ['Arthur Vignolles', SL],
                ['Jules Gimbert', MS],
                ['Asquini', ''],
                ['Ortolan', ''],
            ], 16),
        ],
    },
    events: [
        { minute: 4, period: '1T', type: 'try', team: 'home', detail: 'Try sobre maul; la crónica no identifica al autor' },
        { minute: 4, period: '1T', type: 'conversion', team: 'home', playerName: 'Romain Trouilloud' },
        { minute: 9, period: '1T', type: 'penalty_try', team: 'home', detail: 'Try penal: nueva falta nizarda sobre el maul' },
        { minute: 20, period: '1T', type: 'try', team: 'home', playerName: 'Joris Cazenave', detail: 'Patada de Bouhedjeur a la espalda de la defensa' },
        { minute: 20, period: '1T', type: 'conversion', team: 'home', playerName: 'Romain Trouilloud' },
        { minute: 30, period: '1T', type: 'card_yellow', team: 'away', playerName: 'Thibaud Rey' },
        { minute: 32, period: '1T', type: 'try', team: 'home', playerName: 'Nadir Bouhedjeur', detail: 'Lanzamiento al ancho; apoya en el rincón' },
        { minute: 32, period: '1T', type: 'conversion', team: 'home', playerName: 'Romain Trouilloud', detail: 'Conversión difícil desde el costado' },
        { minute: 39, period: '1T', type: 'try', team: 'home', playerName: 'Baptiste Lenoir', detail: 'Se saca de encima a varios defensores' },
        { minute: 39, period: '1T', type: 'conversion', team: 'home', playerName: 'Romain Trouilloud', detail: '5 de 5 a los palos en el primer tiempo' },
        { minute: 44, period: '2T', type: 'try', team: 'away', detail: 'Sobre maul; la crónica no identifica al autor' },
        { minute: 48, period: '2T', type: 'try', team: 'home', playerName: 'Adrien Lapègue', detail: 'Al final de un movimiento colectivo' },
        { minute: 48, period: '2T', type: 'conversion', team: 'home', detail: 'La crónica no identifica al pateador' },
        { minute: null, period: '2T', type: 'try', team: 'away', playerName: 'Bautista Ezcurra', detail: 'Tras una larga secuencia nizarda; sin minuto en la crónica' },
        { minute: null, period: '2T', type: 'conversion', team: 'away', playerName: 'Asquini', detail: 'Sin minuto en la crónica' },
        { minute: null, period: '2T', type: 'try', team: 'away', detail: 'Última conquista nizarda; sin autor ni minuto en la crónica' },
        { minute: null, period: '2T', type: 'conversion', team: 'away', detail: 'Sin autor ni minuto en la crónica' },
    ],
};

/* ══════════════════════════════════════════════════════════════════════════
 * 2) Soyaux-Angoulême XV 33 - 19 Provence Rugby · miércoles 19/08/2026, 19:00
 * ════════════════════════════════════════════════════════════════════════ */

const SAXV_VS_PROVENCE: FriendlyMatch = {
    externalId: 'saxvcharente:2026-08-19-saxv-provence',
    homeClubId: ['soyaux-angouleme-xv', 'sc-angouleme', 'angouleme'],
    awayClubId: 'provence-rugby',
    dateTime: '2026-08-19T17:00:00+00:00', // 19:00 en Angoulême (UTC+2)
    venue: 'Stade Chanzy, Angoulême',
    score: { home: 33, away: 19 },
    roundLabel: 'Amistoso de pretemporada · 2026/27',
    notes: [
        'Amistoso de pretemporada 2026/27.',
        'Formación de Provence: provencerugby.com (18/08/2026).',
        'Resultado y anotadores: saxvcharente.fr (19/08/2026).',
        'El SA XV publicó su quince en una placa y no en texto, así que la formación local',
        'queda vacía; su crónica tampoco da minutos, de modo que todos los eventos van con',
        'el minuto en 0 y ordenados por la secuencia del relato.',
    ].join(' '),
    lineups: {
        home: [],
        away: [
            ...xv([
                ['Lino Julien', PI],
                ['Vincent Giudicelli', HK],
                ['Pascal Cotet', PD],
                ['Yannick Youyoutte', SL],
                ['Izack Rodda', SL],
                ['Teimana Harrison', TL],
                ['Luca Mazeres', TL],
                ['Tyler Ardron', N8],
                ['Arthur Coville', MS],
                ['Romain Trouilloud', AP],
                ['Sione Tui', WI],
                ['Inga Finau', CE],
                ['Setareki Bituniyata', CE],
                ['Mathias Colombet', WI],
                ['Martin Bogado', FB],
            ], 'Arthur Coville'),
            ...bench([
                ['Romain Latterrade', HK],
                ['Augustin Mollet', HK],
                ['Andrea Pontanier', PI],
                ['Julius Nostadt', PI],
                ['Aurélien Azar', PD],
                ['Elliot Yemsi', PD],
                ['Albert Tuisue', SL],
                ['Charly Gambini', TL],
                ['Raphaël Portat', SL],
                ['Thibaut Martel', TL],
                ['Joris Cazenave', MS],
                ['Tom Noble', MS],
                ['Thomas Salles', AP],
                ['Pierre Lucas', CE],
                ['Sireli Masiwini', WI],
                ['Baptiste Lenoir', CE],
                ['Adrien Lapègue', WI],
                ['Manuel Vareiro', AP],
            ], 16),
        ],
    },
    events: [
        { minute: null, period: '1T', type: 'try', team: 'away', detail: 'Primer try del partido; la crónica del SA XV no da autor ni minuto' },
        { minute: null, period: '1T', type: 'try', team: 'home', playerName: 'Mamoudou Meité', detail: 'Al ras, tras un gran trabajo de los delanteros' },
        { minute: null, period: '1T', type: 'try', team: 'away', detail: 'Provence recupera la ventaja antes del descanso; sin autor en la crónica' },
        { minute: null, period: '1T', type: 'conversion', team: 'away', detail: 'Sin pateador en la crónica. Al descanso, 5-12' },
        { minute: null, period: '2T', type: 'try', team: 'home', playerName: 'Ledua Mau', detail: 'Tras una gran corrida de Levron; habilitado por Tumba' },
        { minute: null, period: '2T', type: 'conversion', team: 'home', detail: 'Sin pateador en la crónica. Empate 12-12' },
        { minute: null, period: '2T', type: 'try', team: 'away', detail: 'Sin autor en la crónica' },
        { minute: null, period: '2T', type: 'conversion', team: 'away', detail: 'Sin pateador en la crónica' },
        { minute: null, period: '2T', type: 'try', team: 'home', playerName: 'Arthur Proult', detail: 'Con el banco fresco, el SA XV se lleva el partido' },
        { minute: null, period: '2T', type: 'conversion', team: 'home', detail: 'Sin pateador en la crónica' },
        { minute: null, period: '2T', type: 'try', team: 'home', playerName: 'Baptiste Escoffre' },
        { minute: null, period: '2T', type: 'conversion', team: 'home', detail: 'Sin pateador en la crónica' },
        { minute: null, period: '2T', type: 'penalty_try', team: 'home', detail: 'Try penal que cierra la cuenta' },
    ],
};

const MATCHES = [PROVENCE_VS_NISSA, SAXV_VS_PROVENCE];

const toList = (v: string | string[]) => (Array.isArray(v) ? v : [v]);

/* ── el marcador tiene que salir de los eventos, o los datos se contradicen ── */
const POINTS: Record<string, number> = { try: 5, penalty_try: 7, conversion: 2, penalty_goal: 3, penalty: 3, drop_goal: 3 };

function scoreFromEvents(events: EventInput[]) {
    return events.reduce(
        (acc, e) => {
            acc[e.team] += POINTS[e.type] ?? 0;
            return acc;
        },
        { home: 0, away: 0 },
    );
}

async function main() {
    const db = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

    console.log(EXECUTE ? '── ESCRIBIENDO ──' : '── PLAN (nada se escribe) ──');

    for (const m of MATCHES) {
        const derived = scoreFromEvents(m.events);
        const ok = derived.home === m.score.home && derived.away === m.score.away;
        const candidatos = [...toList(m.homeClubId), ...toList(m.awayClubId)];
        const clubs = await db.from('clubs').select('id, name').in('id', candidatos);
        const byId = new Map((clubs.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
        const homeClubId = toList(m.homeClubId).find((id) => byId.has(id));
        const awayClubId = toList(m.awayClubId).find((id) => byId.has(id));

        console.log('');
        console.log(`${(homeClubId && byId.get(homeClubId)) ?? '¿?'} ${m.score.home} - ${m.score.away} ${(awayClubId && byId.get(awayClubId)) ?? '¿?'}`);
        console.log(`  ${m.dateTime}  ·  ${m.venue}`);
        console.log(`  eventos: ${m.events.length} (marcador derivado ${derived.home}-${derived.away} ${ok ? 'OK' : '¡NO COINCIDE!'})`);
        console.log(`  formaciones: local ${m.lineups.home.length} · visitante ${m.lineups.away.length}`);

        if (!homeClubId || !awayClubId) {
            console.error('  ✗ falta un club en la base; no se carga este partido');
            continue;
        }
        if (!ok) {
            console.error('  ✗ los eventos no suman el resultado; no se carga este partido');
            continue;
        }
        if (!EXECUTE) continue;

        /* 1. el partido */
        const existing = await db.from('matches').select('id').eq('external_id', m.externalId).maybeSingle();
        let matchId = existing.data?.id as string | undefined;

        const payload = {
            tournament_id: null,
            home_club_id: homeClubId,
            away_club_id: awayClubId,
            date_time: m.dateTime,
            venue: m.venue,
            status: 'final',
            score: m.score,
            sport_id: 'rugby',
            sport: 'rugby',
            round_label: m.roundLabel,
            notes: m.notes,
            is_visible: true,
            review_status: 'approved',
            external_id: m.externalId,
        };

        if (matchId) {
            const { error } = await db.from('matches').update(payload).eq('id', matchId);
            if (error) { console.error('  ✗ update:', error.message); continue; }
            console.log(`  · partido ya existía, actualizado (${matchId})`);
        } else {
            const { data, error } = await db.from('matches').insert(payload).select('id').single();
            if (error || !data) { console.error('  ✗ insert:', error?.message); continue; }
            matchId = data.id as string;
            console.log(`  · partido creado (${matchId})`);
        }

        /* 2. formaciones y eventos, por el servicio (crea las fichas) */
        await persistMatchCenterSupplementalData(db as never, matchId!, {
            lineups: m.lineups,
            events: m.events.map((e, i) => ({
                minute: e.minute,
                type: e.type,
                team: e.team,
                playerName: e.playerName ?? '',
                detail: e.detail ?? '',
                period: e.period,
                order: i,
            })),
        });
        console.log('  · formaciones y eventos escritos');

        /* 3. los contadores, que no los actualiza nadie */
        const { error: countErr } = await db
            .from('matches')
            .update({
                lineup_home_count: m.lineups.home.length,
                lineup_away_count: m.lineups.away.length,
                events_count: m.events.length,
            })
            .eq('id', matchId);
        if (countErr) console.error('  ✗ contadores:', countErr.message);
        else console.log('  · contadores al día');
    }

    console.log('');
    if (!EXECUTE) console.log('Corré con --execute para escribir.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
