/**
 * Relee de la base lo que cargó `seed.mjs` y lo compara con la fuente: por cada
 * fase, los puntos de la tabla calculada contra la ÚLTIMA línea de
 * "Posiciones" que publicó Tercer Tiempo para esa fase.
 *
 *   node scripts/dos-orillas/verificar.mjs            (todo)
 *   node scripts/dos-orillas/verificar.mjs --anio=2026
 *
 * Correrlo DESPUÉS de `arusa-recalcular.ts`: sin recálculo la tabla está vacía.
 *
 * Una diferencia no siempre es un error de carga: las tablas publicadas tienen
 * erratas (un club con un partido pendiente, un bonus que después se
 * corrigió). El control que decide es la suma: si la fuente no cierra consigo
 * misma, no se copia. Lo que queda distinto se lista para revisarlo a mano.
 */
import fs from 'node:fs';
import path from 'node:path';

import { DIVISIONES, fichaDe, torneoDe } from './datos.mjs';

const REPO = process.cwd();
const DIR_EXTRACT = path.join(REPO, 'scripts', 'dos-orillas', 'extract');
const soloAnio = process.argv.find((a) => a.startsWith('--anio='))?.split('=')[1] ?? null;

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const leer = async (r) => {
  const res = await fetch(encodeURI(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${r}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${r}: ${res.status}`);
  return res.json();
};

const nombreFase = (fase, grupo) => (grupo ? `${fase} · ${grupo}` : fase);

async function main() {
  const extraccion = fs.readdirSync(DIR_EXTRACT).filter((f) => /^\d{4}\.json$/.test(f)).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR_EXTRACT, f), 'utf8')))
    .filter((a) => !soloAnio || String(a.year) === soloAnio);

  let fasesOk = 0; let fasesMal = 0; let sinTabla = 0;
  const malas = [];

  for (const division of DIVISIONES) {
    const { slug, nombre } = torneoDe(division);
    const [torneo] = await leer(`tournaments?select=id&slug=eq.${slug}`);
    if (!torneo) { console.log(`${nombre}: NO ESTÁ en la base`); continue; }
    const temporadas = new Map((await leer(`tournament_seasons?select=id,season_code&tournament_id=eq.${torneo.id}`)).map((s) => [s.season_code, s.id]));
    const fases = await leer(`tournament_phases?select=id,name,season_id&tournament_id=eq.${torneo.id}`);

    for (const anio of extraccion) {
      const seasonId = temporadas.get(String(anio.year));
      const publicadas = (anio.standings || []).filter((s) => s.division === division);
      // La última publicada de cada fase.
      const ultima = new Map();
      for (const s of publicadas) {
        const clave = nombreFase(s.phase, s.group);
        const previa = ultima.get(clave);
        if (!previa || (s.afterRound ?? 0) >= (previa.afterRound ?? 0)) ultima.set(clave, s);
      }
      for (const [clave, pub] of ultima) {
        const fase = fases.find((f) => f.season_id === seasonId && f.name === clave);
        if (!fase) { sinTabla++; malas.push(`${division} ${anio.year} ${clave}: la fase no está en la base`); continue; }
        const calc = new Map((await leer(`tournament_standings?select=club_id,points,played&phase_id=eq.${fase.id}`)).map((r) => [r.club_id, r]));
        if (!calc.size) { sinTabla++; malas.push(`${division} ${anio.year} ${clave}: tabla vacía (¿faltó el recálculo?)`); continue; }
        const dif = [];
        for (const row of pub.rows) {
          let id; try { id = fichaDe(row.club, division).id; } catch { dif.push(`${row.club}: alias desconocido`); continue; }
          const c = calc.get(id);
          if (!c) dif.push(`${row.club}: no está en la tabla`);
          else if (c.points !== row.pts) dif.push(`${row.club} ${c.points} (fuente ${row.pts})`);
        }
        if (dif.length) { fasesMal++; malas.push(`${division} ${anio.year} ${clave} [tras fecha ${pub.afterRound ?? '?'}]: ${dif.join(' · ')}`); }
        else fasesOk++;
      }
    }
  }

  console.log(`fases que cierran con la última tabla publicada: ${fasesOk}`);
  console.log(`fases con diferencias: ${fasesMal} · sin tabla para comparar: ${sinTabla}\n`);
  for (const m of malas) console.log(`  ${m}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
