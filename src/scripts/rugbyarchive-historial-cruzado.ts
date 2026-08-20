/**
 * Carga el historial COMPLETO entre dos clubes desde rugbyarchive.net:
 *
 *   npx tsx src/scripts/rugbyarchive-historial-cruzado.ts --equipo=5 --rival=7 --plan
 *   npx tsx src/scripts/rugbyarchive-historial-cruzado.ts --equipo=5 --rival=7 --execute
 *
 * Los ids son los de rugbyarchive: el 5 y el 7 de
 * `http://www.rugbyarchive.net/matcharchive/5` son Aviron Bayonnais y Biarritz
 * Olympique. Salen de `/api/archiviopartite/{id}/?tipo=A`, que lista los 179
 * rivales históricos de un club con su id.
 *
 * Por qué esta fuente y no el proveedor de siempre: FlashScore arranca en la
 * temporada que tiene cargada y nada más. El clásico vasco tiene 85 partidos
 * desde 1930, y eso solo está acá.
 *
 * El endpoint que lo da todo es
 * `/api/archiviopartite/{equipo}/dettaglio/{rival}/?tipo=A` — ojo con el `tipo`,
 * porque sin él la misma ruta devuelve el index.html de la SPA en vez de datos.
 *
 * Sobre el torneo de cada partido: 85 partidos reparten 15 competencias, de las
 * cuales solo Top 14 y Pro D2 existen como torneo en la base. Crear las otras
 * trece —Challenge Yves du Manoir, Tournoi des Sept, Excellence…— para colgar
 * dos partidos de cada una sería llenar el listado público de torneos fantasma.
 * Así que el que se puede mapear se mapea, y el resto queda sin torneo pero CON
 * el nombre de la competencia en `round_label`, que es lo que la ficha del club
 * termina mostrando.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

import { fetchArchivioPartite, fetchArchivioPartiteDettaglio } from '../lib/integrations/rugbyarchive/client.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const FUENTE = 'rugbyarchive';

function arg(nombre: string): string | null {
    const prefijo = `--${nombre}=`;
    const encontrado = process.argv.find((a) => a.startsWith(prefijo));
    return encontrado ? encontrado.slice(prefijo.length) : null;
}

const EJECUTAR = process.argv.includes('--execute');
const EQUIPO = Number(arg('equipo'));
const RIVAL = Number(arg('rival'));

if (!Number.isFinite(EQUIPO) || !Number.isFinite(RIVAL)) {
    console.error('Faltan --equipo=<id de rugbyarchive> y --rival=<id de rugbyarchive>');
    process.exit(1);
}

/** Competencia del proveedor → slug del torneo en la base. Solo las que existen. */
const TORNEO_POR_COMPETENCIA: Record<string, string> = {
    'Top 14': 'rugby-france-top-14',
    'Pro D2': 'rugby-france-pro-d2',
};

type PartidoRa = {
    dataPartita: string;
    squadraCasa: { id: number; nome: string };
    squadraTrasferta: { id: number; nome: string };
    risultato: string | null;
    stadio: string | null;
    altreCompetizioni?: Array<{ nome?: string; stagione?: string; turno?: string }>;
    idPartita: number;
};

async function leer<T>(recurso: string): Promise<T> {
    const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
    if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
}

async function insertar(tabla: string, filas: unknown[]): Promise<void> {
    if (!filas.length) return;
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
        method: 'POST',
        headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify(filas),
    });
    if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${await res.text()}`);
}

/**
 * `dd/mm/aaaa` al mediodía UTC. El mediodía no es capricho: un partido de 1930
 * no tiene hora, y guardarlo a las 00:00 UTC lo corre al día anterior en
 * cualquier huso al oeste — el sitio se lee desde Argentina (UTC-3).
 */
function aFechaUtc(dato: string): { fecha: string; exacta: boolean } | null {
    const texto = String(dato || '').trim();

    const completa = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
    if (completa) {
        const [, dia, mes, anio] = completa;
        return { fecha: `${anio}-${mes}-${dia}T12:00:00.000Z`, exacta: true };
    }

    // De 30 de los 85 partidos del clásico la fuente sabe el año y nada más
    // ("1992"). Tirarlos sería perder un tercio de la historia; inventarles un
    // día sería peor. Se guardan al 1 de enero de ese año y el rótulo lo dice,
    // así el partido existe y nadie lee una precisión que no hay.
    const soloAnio = /^(\d{4})$/.exec(texto);
    if (soloAnio) return { fecha: `${soloAnio[1]}-01-01T12:00:00.000Z`, exacta: false };

    return null;
}

/** "22-6" → {home: 22, away: 6}. Un partido sin marcador no entra. */
function aMarcador(dato: string | null): { home: number; away: number } | null {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(dato || '').trim());
    if (!m) return null;
    return { home: Number(m[1]), away: Number(m[2]) };
}

function rotuloDeCompetencia(p: PartidoRa, fechaExacta: boolean): string | null {
    const comp = p.altreCompetizioni?.[0];
    const partes = [comp?.nome, comp?.stagione, comp?.turno].filter(Boolean) as string[];
    if (!fechaExacta) partes.push('día sin precisar');
    return partes.length > 0 ? partes.join(' · ') : null;
}

async function main() {
    const cabecera = await fetchArchivioPartite<any>(EQUIPO);
    const nombreEquipo = cabecera.data?.nomeSquadra || `equipo ${EQUIPO}`;

    const detalle = await fetchArchivioPartiteDettaglio<PartidoRa[]>(EQUIPO, String(RIVAL));
    // El cliente arma la ruta sin `tipo`, y sin `tipo=A` la SPA devuelve HTML.
    const partidos: PartidoRa[] = Array.isArray(detalle.data)
        ? detalle.data
        : await fetch(`http://www.rugbyarchive.net/api/archiviopartite/${EQUIPO}/dettaglio/${RIVAL}/?cultura=en&tipo=A`)
            .then((r) => r.json())
            .catch(() => []);

    if (!Array.isArray(partidos) || partidos.length === 0) {
        console.error('rugbyarchive no devolvió partidos para ese cruce.');
        process.exit(1);
    }

    const nombreRival = partidos[0].squadraCasa.id === EQUIPO
        ? partidos[0].squadraTrasferta.nome
        : partidos[0].squadraCasa.nome;
    console.log(`${nombreEquipo} vs ${nombreRival}: ${partidos.length} partidos en rugbyarchive`);

    // Los dos clubes en la base, por nombre exacto: rugbyarchive los escribe
    // igual que el catálogo ("Aviron Bayonnais", "Biarritz Olympique").
    const clubes = await leer<Array<{ id: string; name: string }>>(
        `clubs?select=id,name&sport_id=eq.rugby&name=in.("${nombreEquipo}","${nombreRival}")`,
    );
    const clubPorNombre = new Map(clubes.map((c) => [c.name, c.id]));
    const faltan = [nombreEquipo, nombreRival].filter((n) => !clubPorNombre.has(n));
    if (faltan.length > 0) {
        console.error(`No están en la base: ${faltan.join(', ')}. Cargalos antes con el importador de clubes.`);
        process.exit(1);
    }
    console.log(`  ${nombreEquipo} → ${clubPorNombre.get(nombreEquipo)}`);
    console.log(`  ${nombreRival} → ${clubPorNombre.get(nombreRival)}`);

    const slugs = [...new Set(Object.values(TORNEO_POR_COMPETENCIA))];
    const torneos = await leer<Array<{ id: string; slug: string }>>(
        `tournaments?select=id,slug&slug=in.(${slugs.join(',')})`,
    );
    const torneoPorSlug = new Map(torneos.map((t) => [t.slug, t.id]));

    const yaCargados = new Set(
        (await leer<Array<{ external_id: string }>>(
            `matches?select=external_id&external_id=like.${FUENTE}:*&limit=10000`,
        )).map((m) => m.external_id),
    );

    const filas: Record<string, unknown>[] = [];
    const porCompetencia: Record<string, number> = {};
    let repetidos = 0;
    let sinMarcador = 0;
    let sinFecha = 0;
    let aproximadas = 0;

    for (const p of partidos) {
        const externalId = `${FUENTE}:${p.idPartita}`;
        if (yaCargados.has(externalId)) { repetidos += 1; continue; }

        const fecha = aFechaUtc(p.dataPartita);
        if (!fecha) { sinFecha += 1; continue; }
        if (!fecha.exacta) aproximadas += 1;
        const marcador = aMarcador(p.risultato);
        if (!marcador) { sinMarcador += 1; continue; }

        const localId = clubPorNombre.get(p.squadraCasa.nome);
        const visitaId = clubPorNombre.get(p.squadraTrasferta.nome);
        if (!localId || !visitaId) continue;

        const competencia = p.altreCompetizioni?.[0]?.nome || '';
        const slug = TORNEO_POR_COMPETENCIA[competencia];
        porCompetencia[competencia || '(sin competencia)'] = (porCompetencia[competencia || '(sin competencia)'] || 0) + 1;

        yaCargados.add(externalId);
        filas.push({
            id: randomUUID(),
            tournament_id: slug ? torneoPorSlug.get(slug) ?? null : null,
            date_time: fecha.fecha,
            venue: p.stadio || null,
            status: 'final',
            score: marcador,
            home_club_id: localId,
            away_club_id: visitaId,
            sport_id: 'rugby',
            sport: 'rugby',
            external_id: externalId,
            round_label: rotuloDeCompetencia(p, fecha.exacta),
            is_visible: true,
            review_status: 'approved',
        });
    }

    const fechas = filas.map((f: any) => String(f.date_time).slice(0, 4)).sort();
    console.log(`\nA cargar: ${filas.length} partidos` + (fechas.length ? ` (${fechas[0]} → ${fechas[fechas.length - 1]})` : ''));
    Object.entries(porCompetencia)
        .sort((a, b) => b[1] - a[1])
        .forEach(([comp, n]) => {
            const slug = TORNEO_POR_COMPETENCIA[comp];
            console.log(`  ${String(n).padStart(3)} · ${comp}${slug ? `  → torneo ${slug}` : '  (sin torneo en la base)'}`);
        });
    if (repetidos) console.log(`  ${repetidos} ya estaban`);
    if (sinMarcador) console.log(`  ${sinMarcador} sin marcador (no entran)`);
    if (aproximadas) console.log(`  ${aproximadas} con año pero sin día (entran, rotulados)`);
    if (sinFecha) console.log(`  ${sinFecha} sin fecha legible (no entran)`);

    if (!EJECUTAR) {
        console.log('\n--plan: no se escribió nada. Repetí con --execute.');
        return;
    }

    await insertar('matches', filas);
    console.log(`\nListo: ${filas.length} partidos cargados.`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
