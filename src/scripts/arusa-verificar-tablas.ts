/**
 * Control de las tablas de ARUSA: compara la tabla PUBLICADA en G22
 * (`tournament_standings`) contra la tabla OFICIAL de Leverade, fila por fila.
 *
 *   npx tsx src/scripts/arusa-verificar-tablas.ts
 *   npx tsx src/scripts/arusa-verificar-tablas.ts --slug=top-10-de-arusa
 *
 * No escribe nada. El mapa de competencias y ramas es el MISMO que usa
 * `/api/cron/arusa-sync`; si allá se agrega una competencia, acá también.
 *
 * Qué se compara: posición, PJ, PG, PE, PP, a favor, en contra y puntos. Los
 * puntos son el dato que más se desvía, porque el bonus ofensivo de G22 se
 * cuenta con eventos de try y los partidos importados no traen eventos: por eso
 * el sync escribe los puntos de tabla a mano (`points_autocalculated = false`).
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true });

import { fetchCabecera, fetchTabla } from '../lib/integrations/arusa/client.ts';
import { construirResolver, normalizarNombre } from '../lib/integrations/arusa/sync.ts';

/** La misma normalización de nombres de rama que usa `/api/cron/arusa-sync`. */
const clave = (s: string) => normalizarNombre(s).replace(/ /g, '');

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function rest<T>(q: string): Promise<T> {
    const res = await fetch(`${URL_BASE}/rest/v1/${q}`, { headers: H });
    if (!res.ok) throw new Error(`${q} -> ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
}

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const SOLO = arg('slug');

/** El mismo mapa de `/api/cron/arusa-sync`. */
const TORNEOS: { lev: string; slug: string; ramas: string[] }[] = [
    { lev: '1328550', slug: 'top-10-de-arusa', ramas: ['Titulares'] },
    { lev: '1328552', slug: 'segunda-division-de-arusa', ramas: ['Titulares'] },
    { lev: '1328553', slug: 'tercera-division-de-arusa', ramas: ['Titulares'] },
    { lev: '1328554', slug: 'cuarta-division-de-arusa', ramas: ['Fase Regular'] },
    { lev: '1328550', slug: 'intermedia-de-primera-de-arusa', ramas: ['Intermedia'] },
    { lev: '1328552', slug: 'intermedia-de-segunda-de-arusa', ramas: ['Intermedia'] },
    { lev: '1328553', slug: 'intermedia-de-tercera-de-arusa', ramas: ['Intermedia'] },
    { lev: '1329068', slug: 'femenino-xv-de-arusa', ramas: ['Fase Regular'] },
    { lev: '1332975', slug: 'm18-primera-de-arusa', ramas: ['Torneo M18'] },
    { lev: '1332976', slug: 'm16-primera-de-arusa', ramas: ['Torneo M16'] },
    { lev: '1332977', slug: 'm14-primera-de-arusa', ramas: ['Torneo M14'] },
    { lev: '1332978', slug: 'm13-primera-de-arusa', ramas: ['Torneo M13'] },
    { lev: '1332982', slug: 'm18-segunda-de-arusa', ramas: ['Clausura M18', 'Zona 1', 'Zona 2'] },
    { lev: '1332984', slug: 'm16-segunda-de-arusa', ramas: ['Torneo M16', 'Zona 1', 'Zona 2'] },
    { lev: '1332985', slug: 'm14-segunda-de-arusa', ramas: ['Torneo M14', '2da Rueda M14'] },
];

type Fila = {
    club_id: string;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    scored: number;
    conceded: number;
    points: number;
};

async function main() {
    // El mismo par que usa el cron: los vínculos explícitos primero, el nombre
    // del participante después. Solo 9 equipos de ARUSA tienen vínculo propio.
    const equivalencias = await rest<{ club_id: string; external_id: string }[]>(
        'club_external_ids?select=club_id,external_id&provider=eq.arusa&limit=5000',
    );

    let desvios = 0;
    let ramasOk = 0;
    let revisar = 0;

    for (const t of TORNEOS) {
        if (SOLO && t.slug !== SOLO) continue;

        const [torneo] = await rest<{ id: string; name: string }[]>(
            `tournaments?select=id,name&slug=eq.${t.slug}&limit=1`,
        );
        if (!torneo) {
            console.log(`\n### ${t.slug}: NO EXISTE en la base`);
            desvios += 1;
            continue;
        }

        const fases = await rest<{ id: string; name: string }[]>(
            `tournament_phases?select=id,name&tournament_id=eq.${torneo.id}`,
        );
        const participantes = await rest<{ club_id: string | null; clubs: { name?: string; short_name?: string } | null }[]>(
            `tournament_participants?select=club_id,clubs(name,short_name)&tournament_id=eq.${torneo.id}&limit=500`,
        );
        const paraResolver = participantes.map((p) => ({
            club_id: p.club_id,
            nombre: p.clubs?.name ?? null,
            corto: p.clubs?.short_name ?? null,
        }));
        const cabecera = await fetchCabecera(t.lev);

        for (const rama of t.ramas) {
            const grupo = cabecera.grupos.find((g) => clave(g.nombre) === clave(rama));
            // Mismo emparejamiento que el cron, con su repesca: los torneos
            // cargados antes de que hubiera varias ramas tienen una sola fase
            // ("Regular Season") que no se llama como la rama de Leverade.
            const fase = grupo
                ? (fases.find((f) => clave(f.name) === clave(grupo.nombre))
                    ?? (fases.length === 1 && t.ramas.length === 1 ? fases[0] : undefined))
                : undefined;
            const etiqueta = `${t.slug} · ${rama}`;

            if (!grupo) { console.log(`\n### ${etiqueta}: la rama no está en Leverade`); desvios += 1; continue; }
            if (!fase) { console.log(`\n### ${etiqueta}: no hay fase con ese nombre en G22`); desvios += 1; continue; }

            const oficial = await fetchTabla(grupo.id);
            const nuestra = await rest<Fila[]>(
                `tournament_standings?select=club_id,position,played,won,drawn,lost,scored,conceded,points`
                + `&tournament_id=eq.${torneo.id}&phase_id=eq.${fase.id}&order=position.asc`,
            );
            const porClub = new Map(nuestra.map((f) => [f.club_id, f]));
            const resolver = construirResolver({ equivalencias, participantes: paraResolver, ramaId: grupo.id });

            const problemas: string[] = [];
            for (const of of oficial) {
                const club = resolver({ id: of.equipoId, nombre: of.equipo });
                if (!club) { problemas.push(`  ${of.equipo}: no se pudo resolver a un club de G22 (equipo ${of.equipoId})`); continue; }
                const mia = porClub.get(club);
                if (!mia) { problemas.push(`  ${of.equipo} (${club}): no está en nuestra tabla`); continue; }
                porClub.delete(club);

                const dif: string[] = [];
                const cmp = (n: string, oficial: number, nuestra: number) => {
                    if (oficial !== nuestra) dif.push(`${n} nuestra=${nuestra} oficial=${oficial}`);
                };
                cmp('pos', of.posicion, mia.position);
                cmp('PJ', of.jugados, mia.played);
                cmp('PG', of.ganados, mia.won);
                cmp('PE', of.empatados, mia.drawn);
                cmp('PP', of.perdidos, mia.lost);
                cmp('PF', of.aFavor, mia.scored);
                cmp('PC', of.enContra, mia.conceded);
                cmp('PTS', of.puntos, mia.points);
                if (!dif.length) continue;

                /**
                 * No toda diferencia es un dato mal cargado. Hay tres clases y
                 * conviene separarlas, porque dos se arreglan solas y la
                 * tercera es la única que pide ir a mirar.
                 *
                 * · fuente atrasada: tenemos MÁS partidos jugados que la tabla
                 *   oficial. El resultado del partido ya está en el fixture de
                 *   Leverade —de ahí lo sacamos— pero su tabla agregada todavía
                 *   no lo sumó. Se empareja sola en la corrida siguiente.
                 * · solo orden: los ocho números coinciden y cambia la
                 *   posición. En las formativas (M13/M14) ARUSA no ordena por
                 *   puntos, así que la lista oficial y la nuestra difieren sin
                 *   que ningún dato esté mal.
                 * · REVISAR: todo lo demás.
                 */
                const soloOrden = dif.length === 1 && dif[0].startsWith('pos ');
                const adelantados = mia.played > of.jugados;
                const clase = soloOrden ? '[solo orden]' : adelantados ? '[fuente atrasada]' : '[REVISAR]';
                if (clase === '[REVISAR]') revisar += 1;
                problemas.push(`  ${clase} ${of.equipo} (${club}): ${dif.join(' · ')}`);
            }
            for (const sobra of porClub.values()) {
                revisar += 1;
                problemas.push(`  [REVISAR] ${sobra.club_id}: está en nuestra tabla y no en la oficial`);
            }

            if (problemas.length === 0) {
                ramasOk += 1;
                console.log(`OK   ${etiqueta} — ${oficial.length} filas idénticas`);
            } else {
                desvios += problemas.length;
                console.log(`\nDIF  ${etiqueta} — ${problemas.length} desvío(s)`);
                problemas.forEach((p) => console.log(p));
                console.log('');
            }
        }
    }

    console.log(`\nRamas idénticas a la oficial: ${ramasOk} · filas con diferencia: ${desvios} · de ellas a REVISAR: ${revisar}`);
    process.exit(revisar === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
