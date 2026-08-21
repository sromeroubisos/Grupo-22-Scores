/**
 * Carga el historial de una COMPETENCIA entera desde rugbyarchive.net:
 *
 *   npx tsx src/scripts/rugbyarchive-competencia.ts --comp=11 --torneo=rugby-champions-cup --plan
 *   npx tsx src/scripts/rugbyarchive-competencia.ts --comp=11 --torneo=rugby-champions-cup --desde=2015 --execute
 *
 * `--comp` es el id de `http://www.rugbyarchive.net/compseasons/{id}`:
 *   11 Champions Cup · 12 Challenge Cup · 21 Premiership · 31 Top 14 · 32 Pro D2
 *
 * Ojo con el nombre que devuelve la API: para 31 y 32 dice
 * `France - National Championship` en los dos casos, y para 21
 * `England - National Championship`. Es el rótulo de la FAMILIA, no de la
 * división: el id sí distingue, y se ve en los equipos (31 trae Toulouse y
 * Racing 92; 32, Vannes y Colomiers). Por eso el torneo de destino se pasa a
 * mano: fiarse del nombre metería el Pro D2 adentro del Top 14.
 *
 * De dónde salen los partidos: `/api/stagionicompetizione/{comp}/stagione/{año}/`
 * —con el año como `2025-26`, con guión; con barra la SPA devuelve su
 * index.html— y adentro `partiteGiocate`, donde cada fila trae el `turno` afuera
 * y el partido en `partita`. Un tercio de las filas son cabeceras sin `partita`.
 *
 * Los clubes NO se crean por omisión. Un histórico de 30 temporadas arrastra
 * clubes desaparecidos, refundados y renombrados, y crearlos a ciegas ensucia un
 * catálogo curado. Con `--plan` se ve cuántos faltan y con qué nombre; con
 * `--crear-clubes` se crean, con su escudo de rugbyarchive.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';

import { fetchStagioneCompetizione } from '../lib/integrations/rugbyarchive/client.ts';

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
const CREAR_CLUBES = process.argv.includes('--crear-clubes');
const COMP = Number(arg('comp'));
const TORNEO = arg('torneo');
const DESDE = Number(arg('desde') || 0);

if (!Number.isFinite(COMP) || !TORNEO) {
    console.error('Faltan --comp=<id de rugbyarchive> y --torneo=<slug del torneo en la base>');
    process.exit(1);
}

type Partido = {
    dataPartita: string;
    squadraCasa: { id: number; nome: string };
    squadraTrasferta: { id: number; nome: string };
    risultato: string | null;
    stadio: string | null;
    idPartita: number;
};
type FilaStagione = { turno?: string | null; partita?: Partido | null };

async function leer<T>(recurso: string): Promise<T> {
    const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
    if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
}

async function insertar(tabla: string, filas: unknown[]): Promise<void> {
    const TANDA = 500;
    for (let i = 0; i < filas.length; i += TANDA) {
        const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
            method: 'POST',
            headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
            body: JSON.stringify(filas.slice(i, i + TANDA)),
        });
        if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${await res.text()}`);
    }
}

/** Igual que en el historial cruzado: mediodía UTC, y el año solo se rotula. */
function aFechaUtc(dato: string): { fecha: string; exacta: boolean } | null {
    const texto = String(dato || '').trim();
    const completa = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
    if (completa) return { fecha: `${completa[3]}-${completa[2]}-${completa[1]}T12:00:00.000Z`, exacta: true };
    const soloAnio = /^(\d{4})$/.exec(texto);
    if (soloAnio) return { fecha: `${soloAnio[1]}-01-01T12:00:00.000Z`, exacta: false };
    return null;
}

function aMarcador(dato: string | null): { home: number; away: number } | null {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(dato || '').trim());
    if (!m) return null;
    return { home: Number(m[1]), away: Number(m[2]) };
}

function normalizarSlug(nombre: string): string {
    return String(nombre)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function main() {
    const cabecera = await fetch(`http://www.rugbyarchive.net/api/stagionicompetizione/${COMP}/?cultura=en`)
        .then((r) => r.json());
    const temporadas: string[] = (cabecera?.stagioni || []).filter((s: string) => {
        if (!DESDE) return true;
        const anio = Number(String(s).slice(0, 4));
        return Number.isFinite(anio) && anio >= DESDE;
    });

    console.log(`${cabecera?.nomeCompetizione} → torneo ${TORNEO}`);
    console.log(`${temporadas.length} temporadas${DESDE ? ` desde ${DESDE}` : ''} (de ${(cabecera?.stagioni || []).length} totales)\n`);

    const torneos = await leer<Array<{ id: string; name: string }>>(`tournaments?select=id,name&slug=eq.${TORNEO}`);
    if (torneos.length === 0) {
        console.error(`No existe el torneo con slug "${TORNEO}".`);
        process.exit(1);
    }
    const torneoId = torneos[0].id;

    // PostgREST corta en 1000 filas: con 2542 clubes, pedir sin paginar dejaba
    // afuera a más de la mitad del catálogo y el script los daba por faltantes.
    const clubes: Array<{ id: string; name: string; slug: string | null }> = [];
    for (let desde = 0; ; desde += 1000) {
        const pagina = await leer<Array<{ id: string; name: string; slug: string | null }>>(
            `clubs?select=id,name,slug&sport_id=eq.rugby&order=id.asc&limit=1000&offset=${desde}`,
        );
        clubes.push(...pagina);
        if (pagina.length < 1000) break;
    }

    // La clave es el slug normalizado, no el nombre crudo: rugbyarchive escribe
    // "Stade Français Paris" y el catálogo "Stade Francais Paris". Comparando
    // texto tal cual, el club existente se daba por faltante y el alta moría con
    // 23505 al chocar contra su propio id.
    const clubPorNombre = new Map<string, string>();
    for (const c of clubes) {
        clubPorNombre.set(normalizarSlug(c.name), c.id);
        if (c.slug) clubPorNombre.set(normalizarSlug(c.slug), c.id);
        clubPorNombre.set(normalizarSlug(c.id), c.id);
    }

    // Y acá el mismo tope, que es peor: `limit=20000` no lo levanta —PostgREST
    // corta en 1000 igual— así que la lista de "ya cargados" venía incompleta y
    // la corrida siguiente reinsertaba lo que ya estaba. Un duplicado por cada
    // partido más allá del milésimo.
    const yaCargados = new Set<string>();
    for (let desde = 0; ; desde += 1000) {
        const pagina = await leer<Array<{ external_id: string }>>(
            `matches?select=external_id&external_id=like.${FUENTE}:*&order=external_id.asc&limit=1000&offset=${desde}`,
        );
        pagina.forEach((m) => yaCargados.add(m.external_id));
        if (pagina.length < 1000) break;
    }

    const filas: Record<string, unknown>[] = [];
    const clubesFaltantes = new Map<string, string>(); // nombre → slug propuesto
    let repetidos = 0;
    let sinDatos = 0;

    for (const temporada of temporadas) {
        const clave = temporada.replace('/', '-');
        const res = await fetchStagioneCompetizione<any>(COMP, clave);
        const jugados: FilaStagione[] = res.data?.partiteGiocate || [];
        const conPartido = jugados.filter((f) => f?.partita);

        let nuevos = 0;
        for (const fila of conPartido) {
            const p = fila.partita!;
            const externalId = `${FUENTE}:${p.idPartita}`;
            if (yaCargados.has(externalId)) { repetidos += 1; continue; }

            const fecha = aFechaUtc(p.dataPartita);
            const marcador = aMarcador(p.risultato);
            if (!fecha || !marcador) { sinDatos += 1; continue; }

            const localId = clubPorNombre.get(normalizarSlug(p.squadraCasa.nome));
            const visitaId = clubPorNombre.get(normalizarSlug(p.squadraTrasferta.nome));
            if (!localId) clubesFaltantes.set(p.squadraCasa.nome, normalizarSlug(p.squadraCasa.nome));
            if (!visitaId) clubesFaltantes.set(p.squadraTrasferta.nome, normalizarSlug(p.squadraTrasferta.nome));
            if (!localId || !visitaId) continue;

            const rotulo = [fila.turno, temporada, fecha.exacta ? null : 'día sin precisar']
                .filter(Boolean).join(' · ') || null;

            yaCargados.add(externalId);
            nuevos += 1;
            filas.push({
                id: randomUUID(),
                tournament_id: torneoId,
                date_time: fecha.fecha,
                venue: p.stadio || null,
                status: 'final',
                score: marcador,
                home_club_id: localId,
                away_club_id: visitaId,
                sport_id: 'rugby',
                sport: 'rugby',
                external_id: externalId,
                round_label: rotulo,
                is_visible: true,
                review_status: 'approved',
            });
        }

        console.log(`  ${temporada.padEnd(9)} ${String(conPartido.length).padStart(3)} partidos · ${String(nuevos).padStart(3)} nuevos`);
    }

    console.log(`\nA cargar: ${filas.length} partidos`);
    if (repetidos) console.log(`  ${repetidos} ya estaban`);
    if (sinDatos) console.log(`  ${sinDatos} sin fecha o sin marcador (no entran)`);
    if (clubesFaltantes.size > 0) {
        console.log(`\nClubes que faltan en la base: ${clubesFaltantes.size}`);
        [...clubesFaltantes.keys()].slice(0, 30).forEach((n) => console.log(`  ! ${n}`));
        if (clubesFaltantes.size > 30) console.log(`  … y ${clubesFaltantes.size - 30} más`);
        console.log('  (sus partidos NO entran. Con --crear-clubes se crean y entran todos.)');
    }

    if (!EJECUTAR) {
        console.log('\n--plan: no se escribió nada. Repetí con --execute.');
        return;
    }

    if (CREAR_CLUBES && clubesFaltantes.size > 0) {
        const tomados = new Set(clubes.map((c) => c.id));
        const nuevos = [...clubesFaltantes.entries()].filter(([, slug]) => !tomados.has(slug)).map(([nombre, slug]) => ({
            id: slug, slug, name: nombre, short_name: nombre,
            sport: 'rugby', sport_id: 'rugby', entity_type: 'club',
            status: 'active', visibility: 'visible', is_visible: true,
        }));
        await insertar('clubs', nuevos);
        console.log(`\n${nuevos.length} clubes creados. Volvé a correr el script para cargar sus partidos.`);
    }

    await insertar('matches', filas);
    console.log(`\nListo: ${filas.length} partidos cargados en ${torneos[0].name}.`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
