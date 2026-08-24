/**
 * Amistoso de pretemporada 2026/27: Vannes - Section Paloise
 * viernes 21/08/2026, 19:00, en Guingamp.
 *
 *   TS_NODE_TRANSPILE_ONLY=true \
 *   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","allowImportingTsExtensions":false,"noEmit":false}' \
 *   node -r ts-node/register -r tsconfig-paths/register src/scripts/vannes-paloise-amistoso-2026.ts --plan
 *
 * Molde: `provence-amistosos-2026.ts`. Un amistoso es una fila de `matches` con
 * `tournament_id` en null y el deporte cargado a mano; las formaciones van por
 * `persistMatchCenterSupplementalData` (que resuelve los nombres y crea las
 * fichas de `people`) y los contadores se escriben a mano porque no los toca
 * ningún trigger.
 *
 * El partido todavía no se jugó: va `status: 'scheduled'` con el marcador en
 * 0-0 —la forma que ya usan los amistosos programados de la base— y sin eventos.
 *
 * LAS DOS FUENTES NO SON EL MISMO DOCUMENTO, y por eso los dos lados no se
 * cargan igual:
 *
 * - **Vannes publicó la formación**: quince numerado del 1 al 15, con capitán, y
 *   diecisiete relevos. Entra tal cual. Los puestos del quince salen de la
 *   numeración, que en rugby es el puesto; los del banco NO los da la fuente, así
 *   que van vacíos en vez de inventados.
 * - **Pau publicó "LE GROUPE"**: treinta convocados en dos bloques (diecinueve
 *   avants y once arrières) y en ORDEN ALFABÉTICO dentro de cada bloque. No hay
 *   números ni titulares designados. Numerarlos 1-30 y dejar que la ficha llame
 *   "titulares" a los quince primeros sería publicar una formación que el club no
 *   publicó, indistinguible de un dato real —el mismo motivo por el que un evento
 *   sin minuto va con el minuto en 0 y no con uno plausible—. Los treinta entran
 *   con `role: 'suplente'`, que es lo único que la ficha entiende para decir
 *   "está en el grupo pero no sé si arranca". Cuando Pau publique la compo, se
 *   reemplaza el bloque `away` por un quince numerado y se vuelve a correr: el
 *   script es idempotente por `external_id`.
 *
 * Fuentes:
 * - Formación de Vannes: comunicado del RC Vannes (21/08/2026).
 * - Grupo de Pau: placa "LE GROUPE" de la Section Paloise (21/08/2026).
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

// El import va después de cargar el .env.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { persistMatchCenterSupplementalData } = require('@/lib/services/matchCenterService') as typeof import('../lib/services/matchCenterService');

const EXECUTE = process.argv.includes('--execute');

type LineupPlayer = { number: number; name: string; position: string; isCaptain?: boolean; role?: string };

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

/** El banco de Vannes: la fuente da el orden, no el puesto. */
const bench = (names: string[], from: number): LineupPlayer[] =>
    names.map((name, i) => ({ number: from + i, name, position: '', role: 'suplente' }));

/**
 * El grupo de Pau: treinta convocados sin número ni titulares designados.
 * El número es sólo el orden de la placa (la ficha exige uno ≥ 1 y lo dibuja),
 * y `role: 'suplente'` evita que los quince primeros de la lista alfabética se
 * publiquen como el quince titular.
 */
const grupo = (names: string[], from: number): LineupPlayer[] =>
    names.map((name, i) => ({ number: from + i, name, position: '', role: 'suplente' }));

/* ══════════════════════════════════════════════════════════════════════════
 * Vannes - Section Paloise · viernes 21/08/2026, 19:00, Guingamp
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Candidatos, en orden de preferencia: se usa el PRIMERO que exista en `clubs`.
 * Vannes está cargado dos veces —`vannes` (FlashScore: escudo, ciudad, país y
 * `external_id`) y `rc-vannes` (rugbyarchive: 302 partidos desde 2016, sin
 * escudo)—. Se prefiere `vannes` porque tiene el escudo real, que es requisito
 * de las placas. Si algún día se corre `catalogo-fusionar-clubes.ts`, ese script
 * repunta `matches` y este amistoso viaja solo al id que sobreviva.
 */
const HOME_CANDIDATES = ['vannes', 'rc-vannes'];
const AWAY_CANDIDATES = ['section-paloise'];

const EXTERNAL_ID = 'amistoso:2026-08-21-vannes-section-paloise';
const DATE_TIME = '2026-08-21T17:00:00+00:00'; // 19:00 en Guingamp (UTC+2)
const VENUE = 'Guingamp';
const ROUND_LABEL = 'Amistoso de pretemporada · 2026/27';
const NOTES = [
    'Amistoso de pretemporada 2026/27, jugado en Guingamp, en cancha neutral.',
    'Vannes publicó la formación completa: quince numerado con capitán y diecisiete relevos;',
    'los puestos del banco no los da la fuente y quedan vacíos.',
    'La Section Paloise publicó "LE GROUPE": treinta convocados en orden alfabético,',
    'diecinueve delanteros y once tres cuartos, sin números ni titulares designados,',
    'así que los treinta entran como convocados y no como un quince titular inventado.',
].join(' ');

const HOME_LINEUP: LineupPlayer[] = [
    ...xv([
        ['Georgi Beria', PI],
        ['Dave Cherry', HK],
        ['Simon Bourgeois', PD],
        ['Edoardo Iachizzi', SL],
        ['Mattéo Desjeux', SL],
        ['Ioane Iashagashvili', TL],
        ['Steeve Blanc-Mappaz', TL],
        ['Léon Boulier', N8],
        ['Mikheil Alania', MS],
        ['Pierre Popelin', AP],
        ['Nathanaël Hulleu', WI],
        ['Inia Tabuavou', CE],
        ['Robin Taccola', CE],
        ['Romaric Camou', WI],
        ['Joe Jonas', FB],
    ], 'Steeve Blanc-Mappaz'),
    ...bench([
        'Wayan de Benedittis',
        'Hugo Djehi',
        'Hayam El Bibouji',
        'Théo Béziat',
        'Nick Schonert',
        'Sione Mafileo',
        'Thomas Geffré',
        'Timothé Mézou',
        'Joe Edwards',
        'Francisco Gorrissen',
        'Rudi Brown',
        'Romain Valentin',
        'Jean Cotarmanac’h',
        'Pierre Boudehent',
        'Marin Boulier',
        'Paul Bard',
        'Paul Surano',
    ], 16),
];

/**
 * Los avants y los arrières de la placa, en el orden en que están publicados.
 * La placa los escribe "APELLIDO Nombre"; acá van como nombre y apellido, que es
 * lo que espera `splitPersonName` para armar la ficha.
 */
const AWAY_LINEUP: LineupPlayer[] = grupo([
    // Les avants (19)
    'Joseph Adam',
    'Daniel Bibi-Biziwu',
    'Mickaël Capelli',
    'Yon Caperaa',
    'Rémi Couty',
    'Loïc Credoz',
    'Youri Delhommel',
    'Alexandre Etchebehere',
    'Santiago Grondona',
    'Xander Iosefo',
    'Facundo Isa',
    'Thomas Jolmes',
    'Thomas Laclayat',
    'Brent Liufau',
    'Hugo Parrou',
    'Baptiste Pesenti',
    'Rémi Picquette',
    'Lucas Rey',
    'Jon Zabala-Arrieta',
    // Les arrières (11)
    'Louan Courtié',
    'Nathan Decron',
    'Axel Desperes',
    'Zach Fittler',
    'Gonzalo Garcia',
    'Clément Laporte',
    'Jack Maddocks',
    'Tumua Manu',
    'Rodrigo Marta',
    'Joe Simmonds',
    'Thomas Souverbie',
], 1);

async function main() {
    const db = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

    console.log(EXECUTE ? '── ESCRIBIENDO ──' : '── PLAN (nada se escribe) ──');

    const candidatos = [...HOME_CANDIDATES, ...AWAY_CANDIDATES];
    const clubs = await db.from('clubs').select('id, name, logo_url').in('id', candidatos);
    const byId = new Map(
        (clubs.data ?? []).map((c: { id: string; name: string; logo_url: string | null }) => [c.id, c]),
    );
    const homeClubId = HOME_CANDIDATES.find((id) => byId.has(id));
    const awayClubId = AWAY_CANDIDATES.find((id) => byId.has(id));
    const home = homeClubId ? byId.get(homeClubId)! : null;
    const away = awayClubId ? byId.get(awayClubId)! : null;

    console.log('');
    console.log(`${home?.name ?? '¿?'} vs ${away?.name ?? '¿?'}`);
    console.log(`  ${DATE_TIME}  ·  ${VENUE}`);
    console.log(`  clubes: ${homeClubId ?? '—'} (escudo: ${home?.logo_url ? 'sí' : 'NO'}) · ${awayClubId ?? '—'} (escudo: ${away?.logo_url ? 'sí' : 'NO'})`);
    console.log(`  formación local: ${HOME_LINEUP.length} (15 titulares + ${HOME_LINEUP.length - 15} relevos)`);
    console.log(`  grupo visitante: ${AWAY_LINEUP.length} convocados, sin quince designado`);
    console.log('  eventos: 0 (el partido todavía no se jugó)');

    if (!homeClubId || !awayClubId) {
        console.error('  ✗ falta un club en la base; no se carga el partido');
        return;
    }

    const duplicados = HOME_CANDIDATES.filter((id) => byId.has(id));
    if (duplicados.length > 1) {
        console.warn(`  ! Vannes está cargado ${duplicados.length} veces (${duplicados.join(', ')}). Se usa ${homeClubId}; la fusión es aparte (catalogo-fusionar-clubes.ts).`);
    }

    if (!EXECUTE) {
        console.log('');
        console.log('Corré con --execute para escribir.');
        return;
    }

    /* 1. el partido */
    const existing = await db.from('matches').select('id').eq('external_id', EXTERNAL_ID).maybeSingle();
    let matchId = existing.data?.id as string | undefined;

    const payload = {
        tournament_id: null,
        home_club_id: homeClubId,
        away_club_id: awayClubId,
        date_time: DATE_TIME,
        venue: VENUE,
        status: 'scheduled',
        score: { home: 0, away: 0 },
        sport_id: 'rugby',
        sport: 'rugby',
        round_label: ROUND_LABEL,
        notes: NOTES,
        is_visible: true,
        review_status: 'approved',
        external_id: EXTERNAL_ID,
    };

    if (matchId) {
        const { error } = await db.from('matches').update(payload).eq('id', matchId);
        if (error) { console.error('  ✗ update:', error.message); return; }
        console.log(`  · partido ya existía, actualizado (${matchId})`);
    } else {
        const { data, error } = await db.from('matches').insert(payload).select('id').single();
        if (error || !data) { console.error('  ✗ insert:', error?.message); return; }
        matchId = data.id as string;
        console.log(`  · partido creado (${matchId})`);
    }

    /* 2. las formaciones, por el servicio (crea las fichas de `people`) */
    await persistMatchCenterSupplementalData(db as never, matchId!, {
        lineups: { home: HOME_LINEUP, away: AWAY_LINEUP },
        events: [],
    });
    console.log('  · formaciones escritas');

    /* 3. los contadores, que no los actualiza nadie */
    const { error: countErr } = await db
        .from('matches')
        .update({
            lineup_home_count: HOME_LINEUP.length,
            lineup_away_count: AWAY_LINEUP.length,
            events_count: 0,
        })
        .eq('id', matchId);
    if (countErr) console.error('  ✗ contadores:', countErr.message);
    else console.log('  · contadores al día');

    console.log('');
    console.log(`  ficha: /matches/${matchId}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
