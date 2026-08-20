/**
 * Guarda como CLUBES de la base los equipos de un torneo de FlashScore:
 *
 *   npx tsx src/scripts/flashscore-importar-clubes.ts --url=rugby-union/france/top-14 --plan
 *   npx tsx src/scripts/flashscore-importar-clubes.ts --url=rugby-union/france/top-14 --execute
 *
 * Varias ligas de una: --url=a,b,c o --url= repetido. El país y el deporte
 * salen del segmento de la ruta (`/rugby-union/france/…` → rugby, Francia);
 * `--pais` y `--deporte` los pisan si hace falta.
 *
 * Para qué sirve: la página de un torneo externo se dibuja con lo que devuelve
 * el proveedor y no toca la base. Por eso el Top 14 se ve entero en /tournaments
 * pero sus equipos NO aparecen en el selector de un amistoso: ese selector lee
 * `clubs` (via /api/admin/clubs) y el amistoso se crea con `homeClubId` /
 * `awayClubId`, que son `clubs.id`. Sin fila en `clubs`, el equipo no existe
 * para el gestor.
 *
 * Qué escribe:
 * - `clubs`: una fila por equipo, con el id del proveedor en `external_id` para
 *   poder reconciliar después (hoy esa columna está vacía en toda la tabla, así
 *   que el que la usa es este importador).
 * - `external_teams`: la misma ficha del lado del proveedor. La necesitan los
 *   partidos, que leen el escudo de ahí y no de `clubs` (ver el proxy
 *   /api/assets/team-logo, que prueba `clubs` primero y cae a `external_teams`).
 *
 * Nunca pisa un club existente: si el id, el slug o el nombre ya están en la
 * base, lo informa y lo saltea. Renombrar o fusionar clubes es una decisión de
 * catálogo, no algo que un import masivo pueda adivinar.
 *
 * El escudo sale de `teams/details` del proveedor, que devuelve la URL real
 * (`static.flashscore.com/...`). Se guarda esa URL, igual que hace
 * `persistClubLogo` con cualquier escudo que no sea un data URI. Nunca
 * iniciales: un club sin escudo resuelto se reporta y se importa igual, pero
 * queda anotado en el resumen.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import { resolveTournamentCountryLabel } from '../lib/data/countries.ts';
import { normalizeSlug } from '../lib/utils/normalize.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const RAPID_KEY = process.env.RAPIDAPI_KEY?.trim();
const RAPID_HOST = (process.env.RAPIDAPI_HOST || 'flashscore4.p.rapidapi.com').trim();

if (!URL_BASE || !KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}
if (!RAPID_KEY) {
    console.error('Falta RAPIDAPI_KEY en .env.local');
    process.exit(1);
}

const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const H_FS = { 'x-rapidapi-host': RAPID_HOST, 'x-rapidapi-key': RAPID_KEY };

function arg(nombre: string): string | null {
    const prefijo = `--${nombre}=`;
    const encontrado = process.argv.find((a) => a.startsWith(prefijo));
    return encontrado ? encontrado.slice(prefijo.length) : null;
}

/**
 * La ruta del proveedor, tolerante con lo que se pega en la terminal: sirve
 * `/rugby-union/france/top-14/`, `rugby-union/france/top-14` y la URL entera de
 * flashscore.com. Git Bash además reescribe un argumento que empieza con `/`
 * como ruta de Windows (`C:/Program Files/Git/rugby-union/...`), así que se
 * recorta desde el segmento del deporte.
 */
function normalizarRutaProveedor(valor: string | null): string | null {
    if (!valor) return null;
    let ruta = valor.trim();
    if (/^https?:\/\//i.test(ruta)) {
        try {
            ruta = new URL(ruta).pathname;
        } catch {
            /* se sigue con el texto crudo */
        }
    }
    const mangled = ruta.match(/[a-z]:[\\/].*?(\/(?:rugby-union|rugby-league|football|basketball|hockey|field-hockey|volleyball|handball|tennis|american-football|baseball|motorsport)\/.*)$/i);
    if (mangled) ruta = mangled[1];
    ruta = ruta.replace(/\\/g, '/');
    if (!ruta.startsWith('/')) ruta = `/${ruta}`;
    if (!ruta.endsWith('/')) ruta = `${ruta}/`;
    return ruta;
}

/**
 * El país sale del segmento de la URL del proveedor y se dice en castellano,
 * como el resto del catálogo de clubes ("Francia", no "France" ni "FRA").
 * Gales y Escocia no son países del registro ISO que usa `countries.ts`, pero
 * sí son uniones con liga propia: van a mano.
 *
 * Una competencia multinacional (URC, Super Rugby, las copas de Europa) resuelve
 * a null a propósito: sus clubes son de cinco países distintos y una etiqueta
 * sola mentiría. Mejor la columna vacía que el dato equivocado.
 */
const PAIS_POR_UNION: Record<string, string> = {
    wales: 'Gales',
    scotland: 'Escocia',
};

function paisDeLaRuta(ruta: string): string | null {
    const segmento = ruta.split('/').filter(Boolean)[1];
    if (!segmento) return null;
    return PAIS_POR_UNION[segmento] || resolveTournamentCountryLabel(segmento);
}

/** `/rugby-union/...` y `/rugby-league/...` son el mismo deporte de la plataforma. */
function deporteDeLaRuta(ruta: string): string {
    const segmento = ruta.split('/').filter(Boolean)[0] || '';
    if (segmento === 'rugby-union' || segmento === 'rugby-league') return 'rugby';
    return segmento || 'rugby';
}

const EJECUTAR = process.argv.includes('--execute');
// Varias ligas en una corrida: --url=a,b,c o --url= repetido.
const URLS = process.argv
    .filter((a) => a.startsWith('--url='))
    .flatMap((a) => a.slice('--url='.length).split(','))
    .map((valor) => normalizarRutaProveedor(valor))
    .filter((valor): valor is string => Boolean(valor));
const DEPORTE = arg('deporte');
const PAIS = arg('pais');
const OCULTOS = process.argv.includes('--ocultos');
// Crea igual los que se parecen a un club ya cargado. Solo con la duda resuelta a mano.
const FORZAR = process.argv.includes('--forzar-parecidos');

if (URLS.length === 0) {
    console.error('Falta --url=/rugby-union/france/top-14/ (la misma que lleva la página del torneo en la barra de direcciones)');
    console.error('Se pueden encadenar varias: --url=rugby-union/france/top-14,rugby-union/france/pro-d2');
    process.exit(1);
}

// La etapa que tiene la tabla. Las de playoff no traen el plantel completo.
const ETAPA_PRINCIPAL_RE = /^(main|regular season|group stage|league stage|round robin)$/i;

type EquipoProveedor = {
    teamId: string;
    nombre: string;
    teamUrl: string | null;
};

type FichaEquipo = EquipoProveedor & {
    escudo: string | null;
    ciudad: string | null;
    estadio: string | null;
};

type ClubExistente = {
    id: string;
    name: string;
    slug: string | null;
};

async function fs<T>(recurso: string): Promise<T | null> {
    const res = await fetch(`https://${RAPID_HOST}/api/flashscore/v2/${recurso}`, { headers: H_FS });
    if (!res.ok) {
        console.warn(`  [proveedor] ${recurso} → ${res.status}`);
        return null;
    }
    return (await res.json()) as T;
}

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

async function upsert(tabla: string, filas: unknown[]): Promise<void> {
    if (!filas.length) return;
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
        method: 'POST',
        headers: {
            ...H,
            'content-type': 'application/json',
            prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(filas),
    });
    if (!res.ok) throw new Error(`UPSERT ${tabla}: ${res.status} ${await res.text()}`);
}

/** El plantel del torneo, leído de la tabla de la etapa principal. */
async function equiposDelTorneo(rutaTorneo: string): Promise<EquipoProveedor[]> {
    const ids = await fs<any>(`tournaments/ids?tournament_url=${encodeURIComponent(rutaTorneo)}`);
    const bundle = Array.isArray(ids) ? ids[0] : ids?.DATA ?? ids;
    const tournamentId = bundle?.tournament_id;
    if (!tournamentId) throw new Error(`El proveedor no reconoce la URL ${rutaTorneo}`);

    const etapas: any[] = Array.isArray(bundle?.tournament_stages) ? bundle.tournament_stages : [];
    const principal = etapas.find((e) => ETAPA_PRINCIPAL_RE.test(String(e?.name || '')));
    const stageId = principal?.tournament_stage_id || bundle?.tournament_stage_id;
    if (!stageId) throw new Error('El torneo no expone una etapa con tabla de posiciones');

    console.log(`Proveedor: tournament_id=${tournamentId} stage=${stageId} temporada=${bundle?.season_id ?? '?'}`);

    const tabla = await fs<any>(
        `tournaments/standings?tournament_id=${tournamentId}&tournament_stage_id=${stageId}&type=overall`,
    );
    const filas: any[] = Array.isArray(tabla) ? tabla : Array.isArray(tabla?.DATA) ? tabla.DATA : [];

    return filas
        .map((fila) => ({
            teamId: String(fila?.team_id || '').trim(),
            nombre: String(fila?.name || '').trim(),
            teamUrl: fila?.team_url ? String(fila.team_url) : null,
        }))
        .filter((e) => e.teamId && e.nombre);
}

/** Escudo, ciudad y estadio: una consulta por equipo. */
async function ficha(equipo: EquipoProveedor): Promise<FichaEquipo> {
    if (!equipo.teamUrl) return { ...equipo, escudo: null, ciudad: null, estadio: null };

    const detalle = await fs<any>(`teams/details?team_url=${encodeURIComponent(equipo.teamUrl)}`);
    const raiz = detalle?.DATA ?? detalle;

    return {
        ...equipo,
        nombre: String(raiz?.name || equipo.nombre).trim(),
        escudo: raiz?.image_path ? String(raiz.image_path) : null,
        ciudad: raiz?.city ? String(raiz.city) : null,
        estadio: raiz?.stadium ? String(raiz.stadium) : null,
    };
}

/**
 * Todos los clubes del deporte, una sola vez por corrida. PostgREST corta en
 * 1000 filas, así que se pagina y se desempata por id.
 */
const CATALOGOS = new Map<string, ClubExistente[]>();

async function catalogoDelDeporte(deporte: string): Promise<ClubExistente[]> {
    const cacheado = CATALOGOS.get(deporte);
    if (cacheado) return cacheado;

    const filas: ClubExistente[] = [];
    let desde = 0;
    for (;;) {
        const pagina = await leer<ClubExistente[]>(
            `clubs?select=id,name,slug&sport_id=eq.${deporte}&order=id.asc&limit=1000&offset=${desde}`,
        );
        filas.push(...pagina);
        if (pagina.length < 1000) break;
        desde += pagina.length;
    }

    CATALOGOS.set(deporte, filas);
    return filas;
}

/**
 * El match exacto no alcanza y está medido: el Top 14 argentino traía "Hindu",
 * "Newman", "SIC" y "Regatas Bella Vista" como clubes nuevos, cuando en la base
 * ya estaban curados como Hindú Club, Club Newman, San Isidro Club y Regatas de
 * Bella Vista. El proveedor abrevia; el catálogo argentino no.
 *
 * Por eso también se compara por contención de slug: `hindu` ⊂ `hindu-club`,
 * `newman` ⊂ `club-newman`. No los da por iguales —eso es curaduría— sino que
 * los frena y los reporta. Un club que quedó afuera se ve; un duplicado suelto
 * en el selector de amistosos, no.
 *
 * Cuatro caracteres de mínimo para que un slug corto tipo `sic` no se enganche
 * con media tabla.
 */
function parecidoEnCatalogo(slug: string, catalogo: ClubExistente[]): ClubExistente | null {
    if (slug.length < 4) return null;

    for (const club of catalogo) {
        const candidatos = [club.id, club.slug].filter((v): v is string => Boolean(v) && v!.length >= 4);
        for (const candidato of candidatos) {
            if (candidato === slug) return club;
            if (candidato.startsWith(`${slug}-`) || candidato.endsWith(`-${slug}`)) return club;
            if (slug.startsWith(`${candidato}-`) || slug.endsWith(`-${candidato}`)) return club;
        }
    }

    return null;
}

type Resumen = {
    ruta: string;
    creados: number;
    salteados: number;
    dudosos: number;
    sinEscudo: number;
    error?: string;
};

/**
 * Una liga. `yaVistos` viaja entre ligas de la misma corrida porque en `--plan`
 * no se escribe nada: sin él, un club que dos ligas comparten se contaría como
 * nuevo dos veces y el plan mentiría sobre lo que va a pasar.
 */
async function procesarLiga(rutaTorneo: string, yaVistos: Set<string>): Promise<Resumen> {
    const deporte = DEPORTE || deporteDeLaRuta(rutaTorneo);
    const pais = PAIS ?? paisDeLaRuta(rutaTorneo);

    console.log(`\n══ ${rutaTorneo}  (${deporte}${pais ? ` · ${pais}` : ' · sin país: competencia multinacional'})`);

    const equipos = await equiposDelTorneo(rutaTorneo);
    if (equipos.length === 0) {
        console.log('  El torneo no devolvió ningún equipo. Revisá la URL o probá cuando la temporada esté cargada.');
        return { ruta: rutaTorneo, creados: 0, salteados: 0, dudosos: 0, sinEscudo: 0, error: 'sin equipos' };
    }
    console.log(`  ${equipos.length} equipos en el torneo`);

    const fichas: FichaEquipo[] = [];
    for (const equipo of equipos) {
        fichas.push(await ficha(equipo));
    }

    // Un club ya cargado no se toca: ni por id, ni por slug, ni por nombre.
    const slugs = fichas.map((f) => normalizeSlug(f.nombre));
    const nombres = fichas.map((f) => f.nombre);
    const porId = await leer<ClubExistente[]>(`clubs?select=id,name,slug&id=in.(${slugs.join(',')})`);
    const porSlug = await leer<ClubExistente[]>(`clubs?select=id,name,slug&slug=in.(${slugs.join(',')})`);
    const porNombre = await leer<ClubExistente[]>(
        `clubs?select=id,name,slug&name=in.(${nombres.map((n) => `"${n.replace(/"/g, '')}"`).join(',')})`,
    );

    const tomados = new Map<string, ClubExistente>();
    for (const club of [...porId, ...porSlug, ...porNombre]) {
        tomados.set(club.id, club);
        if (club.slug) tomados.set(club.slug, club);
        tomados.set(club.name.toLowerCase(), club);
    }

    const catalogo = await catalogoDelDeporte(deporte);

    const nuevos: Record<string, unknown>[] = [];
    const externos: Record<string, unknown>[] = [];
    const salteados: string[] = [];
    const dudosos: string[] = [];
    const sinEscudo: string[] = [];

    for (const f of fichas) {
        const slug = normalizeSlug(f.nombre);
        const yaEsta = tomados.get(slug) || tomados.get(f.nombre.toLowerCase());

        externos.push({
            id: f.teamId,
            source: 'flashscore',
            name: f.nombre,
            logo_url: f.escudo,
            sport: deporte,
            country: pais,
            team_url: f.teamUrl,
        });

        if (yaEsta) {
            salteados.push(`${f.nombre} → ya existe como "${yaEsta.name}" (${yaEsta.id})`);
            continue;
        }
        if (yaVistos.has(slug)) {
            salteados.push(`${f.nombre} → ya venía de otra liga de esta corrida`);
            continue;
        }
        const parecido = parecidoEnCatalogo(slug, catalogo);
        if (parecido && !FORZAR) {
            dudosos.push(`${f.nombre} → se parece a "${parecido.name}" (${parecido.id})`);
            continue;
        }
        yaVistos.add(slug);
        if (!f.escudo) sinEscudo.push(f.nombre);

        nuevos.push({
            id: slug,
            slug,
            name: f.nombre,
            short_name: f.nombre,
            city: f.ciudad,
            country: pais,
            logo_url: f.escudo,
            sport: deporte,
            sport_id: deporte,
            entity_type: 'club',
            status: 'active',
            visibility: OCULTOS ? 'hidden' : 'visible',
            is_visible: !OCULTOS,
            external_id: f.teamId,
        });
    }

    nuevos.forEach((c: any) => console.log(`  + ${c.id.padEnd(32)} ${c.name}${c.city ? ` · ${c.city}` : ''}${c.logo_url ? '' : '  (SIN ESCUDO)'}`));
    salteados.forEach((s) => console.log(`  = ${s}`));
    dudosos.forEach((d) => console.log(`  ? ${d}`));

    if (EJECUTAR) {
        await insertar('clubs', nuevos);
        await upsert('external_teams', externos);
    }

    return {
        ruta: rutaTorneo,
        creados: nuevos.length,
        salteados: salteados.length,
        dudosos: dudosos.length,
        sinEscudo: sinEscudo.length,
    };
}

async function main() {
    const yaVistos = new Set<string>();
    const resumenes: Resumen[] = [];

    for (const ruta of URLS) {
        try {
            resumenes.push(await procesarLiga(ruta, yaVistos));
        } catch (error) {
            const mensaje = error instanceof Error ? error.message : String(error);
            console.log(`  FALLÓ: ${mensaje}`);
            resumenes.push({ ruta, creados: 0, salteados: 0, dudosos: 0, sinEscudo: 0, error: mensaje });
        }
    }

    console.log('\n═══ Resumen');
    for (const r of resumenes) {
        const detalle = r.error
            ? `FALLÓ (${r.error})`
            : `${r.creados} nuevos · ${r.salteados} ya estaban${r.dudosos ? ` · ${r.dudosos} EN DUDA` : ''}${r.sinEscudo ? ` · ${r.sinEscudo} SIN ESCUDO` : ''}`;
        console.log(`  ${r.ruta.padEnd(46)} ${detalle}`);
    }
    const total = resumenes.reduce((a, r) => a + r.creados, 0);

    if (!EJECUTAR) {
        console.log(`\n--plan: no se escribió nada. ${total} clubes entrarían. Repetí con --execute para guardar.`);
        return;
    }
    console.log(`\nListo: ${total} clubes creados.`);
    console.log('Ya se pueden elegir en /admin/super/partidos/crear con "Amistoso" tildado.');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
