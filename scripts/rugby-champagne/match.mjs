// Empareja la cronología extraída de Rugby Champagne con NUESTROS partidos.
// Solo lectura sobre la base (REST + service key de .env.local). Escribe
// extract/match-report.json. No inserta nada en match_events.
//
//   node scripts/rugby-champagne/match.mjs
//
// Criterio: mismo torneo, fecha a ±2 días, mismo marcador final y al menos un
// club con nombre parecido. Solo cuenta como emparejado si queda UN candidato;
// si hay dos o ninguno va a `sinPareja` / `ambiguos`.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');

function leerEnv() {
  const env = { ...process.env };
  for (const l of readFileSync(join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = leerEnv();
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// PostgREST corta en 1000 filas: se pagina por lo que llegó.
async function rest(ruta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${desde}-${desde + 999}`, 'Range-Unit': 'items' },
    });
    if (!r.ok) throw new Error(`${ruta} -> ${r.status} ${await r.text()}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < 1000) return filas;
  }
}

const sinTilde = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const RUIDO = new Set(['club', 'asoc', 'asociacion', 'de', 'del', 'la', 'el', 'los', 'las', 'rugby', 'rc', 'ac', 'cr', 'c', 'y']);
const fichas = (s) =>
  new Set(
    sinTilde(s ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !RUIDO.has(t)),
  );
function parecido(a, b) {
  const A = fichas(a);
  const B = fichas(b);
  if (!A.size || !B.size) return 0;
  let comun = 0;
  for (const t of A) if (B.has(t)) comun++;
  return comun / Math.min(A.size, B.size);
}
const dias = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

async function main() {
  const ext = JSON.parse(readFileSync(join(AQUI, 'extract', '2026.json'), 'utf8'));
  const torneos = [...new Set(Object.values(ext).flatMap((c) => c.torneoIds))];
  const filtro = `tournament_id=in.(${torneos.join(',')})&date_time=gte.2026-01-01`;
  const partidos = await rest(`matches?select=id,tournament_id,date_time,status,score,home_club_id,away_club_id&${filtro}`);
  const clubes = new Map((await rest('clubs?select=id,name')).map((c) => [String(c.id), c.name]));
  const conEv = new Set();
  for (let i = 0; i < partidos.length; i += 100) {
    const ids = partidos.slice(i, i + 100).map((p) => p.id).join(',');
    for (const e of await rest(`match_events?select=match_id&match_id=in.(${ids})`)) conEv.add(e.match_id);
  }

  const informe = {};
  for (const [c, comp] of Object.entries(ext)) {
    const nuestros = partidos.filter((p) => comp.torneoIds.includes(p.tournament_id));
    const usados = new Set();
    const r = { sitio: comp.sitio, enSitio: comp.partidos.length, enBase: nuestros.length, jugados: 0, conCronologia: 0, emparejados: 0, emparejadosConCronologia: 0, yaConEventos: 0, conCronologiaYaConEventos: 0, sinPareja: [], ambiguos: [], soloMarcador: [], pares: [] };
    for (const p of comp.partidos.filter((x) => x.estado === 'Finalizado')) {
      r.jugados++;
      const tiene = p.cronologia?.some((e) => e.tipo);
      if (tiene) r.conCronologia++;
      // El marcador y la fecha mandan; el nombre desempata. Un club puede
      // llamarse distinto en cada lado ("SIC" / "San Isidro Club"), así que
      // alcanza con que UN lado se parezca. Sin ningún lado parecido el
      // partido NO se empareja: queda en `soloMarcador` para revisar a mano.
      const base = nuestros.filter((n) => {
        if (usados.has(n.id) || dias(n.date_time, p.fecha) > 2) return false;
        return n.score && n.score.home === p.marcador[0] && n.score.away === p.marcador[1];
      });
      const puntuados = base.map((n) => ({
        n,
        sim: parecido(p.local, clubes.get(String(n.home_club_id))) + parecido(p.visitante, clubes.get(String(n.away_club_id))),
      }));
      const cand = puntuados.filter((x) => x.sim >= 0.5).sort((a, b) => b.sim - a.sim);
      if (cand.length === 0 && base.length === 1) r.soloMarcador.push({ sitioId: p.id, local: p.local, visitante: p.visitante, baseId: base[0].id });
      if (cand.length > 1 && cand[0].sim === cand[1].sim) cand.length = 2;
      else cand.length = Math.min(cand.length, 1);
      const ficha = { sitioId: p.id, ronda: p.ronda, fecha: p.fecha, local: p.local, visitante: p.visitante, marcador: p.marcador, conCronologia: !!tiene };
      if (cand.length === 1) {
        usados.add(cand[0].n.id);
        r.pares.push({ sitioId: p.id, matchId: cand[0].n.id, homeClubId: cand[0].n.home_club_id, awayClubId: cand[0].n.away_club_id, yaConEventos: conEv.has(cand[0].n.id) });
        r.emparejados++;
        if (tiene) r.emparejadosConCronologia++;
        if (conEv.has(cand[0].n.id)) r.yaConEventos++;
        if (tiene && conEv.has(cand[0].n.id)) r.conCronologiaYaConEventos++;
      } else if (cand.length === 0) r.sinPareja.push(ficha);
      else r.ambiguos.push({ ...ficha, candidatos: cand.map((x) => x.n.id) });
    }
    informe[c] = r;
    console.log(
      `${c} ${r.sitio}: sitio ${r.enSitio} / base ${r.enBase} | jugados ${r.jugados}, con cronología ${r.conCronologia}, emparejados ${r.emparejados} (con cronología ${r.emparejadosConCronologia}, ya con eventos en base ${r.conCronologiaYaConEventos}), sin pareja ${r.sinPareja.length}, ambiguos ${r.ambiguos.length}, solo-marcador ${r.soloMarcador.length}`,
    );
  }
  writeFileSync(join(AQUI, 'extract', 'match-report.json'), JSON.stringify(informe, null, 1));
}

await main();
