/**
 * Fecha 24 del Bloque Juvenil "B" (M15 B, M16 B, M17 B) de la UCR, semana del 28/10 al 31/10/2026.
 * Idempotente: no repite un cruce que ya existe en el torneo desde el 28/10.
 *   node scripts/cordoba-bloque-b-fecha24/cargar.mjs [--execute]
 * Sin hora en la planilla -> 12:00 (misma regla que cordoba-torneos/seed.mjs).
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const EXEC = process.argv.includes('--execute');
const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  if (l.includes('=') && !l.startsWith('#')) { const i = l.indexOf('='); env[l.slice(0, i)] = l.slice(i + 1).trim().replace(/^["']|["']$/g, ''); }
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const get = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json(); };

const TORNEOS = { m15: 'ffaaab95-59d4-4a2c-a4c3-5d16b1216064', m16: '34135c1b-9ed1-4e5e-afed-0da7724845ce', m17: 'adcb3e20-f98e-4f18-bbe4-694758c75e6e' };
// [categoria, nro UCR, local, visitante, dd/mm, hora|null]; los ids de club son <madre>-<categoria>-<letra>
const P = [
  ['m15', 328012, 'club-la-tablada-m15-b', 'tala-rugby-club-m15-c', '31/10', '11:30'],
  ['m15', 328018, 'uru-cure-rugby-club-m15-b', 'alta-gracia-r-c-m15-b', '31/10', '11:00'],
  ['m15', 328017, 'san-francisco-r-c-m15-b', 'cordoba-athletic-club-m15-b', '31/10', '10:30'],
  ['m15', 328016, 'club-universitario-de-cordoba-m15-b', 'club-la-tablada-m15-c', '31/10', null],
  ['m15', 328013, 'tala-rugby-club-m15-b', 'baguales-r-c-m15-b', '30/10', '21:45'],
  ['m15', 328015, 'club-palermo-bajo-m15-b', 'jockey-club-cordoba-m15-c', '30/10', '20:00'],
  ['m15', 328014, 'jockey-club-cordoba-m15-b', 'cordoba-rugby-club-m15-b', '29/10', '20:00'],
  ['m16', 328005, 'club-la-tablada-m16-b', 'tala-rugby-club-m16-c', '31/10', '13:00'],
  ['m16', 328008, 'club-palermo-bajo-m16-b', 'los-cuervos-r-c-m16-b', '31/10', '13:00'],
  ['m16', 328011, 'aero-club-rio-iv-m16-b', 'alta-gracia-r-c-m16-b', '31/10', '10:00'],
  ['m16', 328009, 'club-universitario-de-cordoba-m16-b', 'club-la-tablada-m16-c', '31/10', null],
  ['m16', 328010, 'san-francisco-r-c-m16-b', 'cordoba-athletic-club-m16-b', '31/10', null, { home: 28, away: 0 }],
  ['m16', 328006, 'tala-rugby-club-m16-b', 'baguales-r-c-m16-b', '30/10', '20:15'],
  ['m16', 328007, 'jockey-club-cordoba-m16-b', 'cordoba-rugby-club-m16-b', '29/10', '21:30'],
  ['m17', 328001, 'club-palermo-bajo-m17-b', 'los-cuervos-r-c-m17-b', '31/10', '13:00'],
  ['m17', 328003, 'san-francisco-r-c-m17-b', 'cordoba-athletic-club-m17-b', '31/10', '12:00'],
  ['m17', 328004, 'uru-cure-rugby-club-m17-b', 'alta-gracia-r-c-m17-b', '31/10', '11:00'],
  ['m17', 328002, 'club-universitario-de-cordoba-m17-b', 'club-la-tablada-m17-c', '31/10', null],
  ['m17', 328000, 'jockey-club-cordoba-m17-b', 'cordoba-rugby-club-m17-b', '30/10', '20:30'],
  ['m17', 327999, 'tala-rugby-club-m17-b', 'baguales-r-c-m17-b', '30/10', '20:15'],
  ['m17', 327998, 'club-la-tablada-m17-b', 'tala-rugby-club-m17-c', '28/10', '20:30'],
];

const fases = {};
for (const [k, t] of Object.entries(TORNEOS)) {
  const f = await get(`tournament_phases?select=id,season_id&tournament_id=eq.${t}&name=eq.Campeonato`);
  if (f.length !== 1) throw new Error(`${k}: fase Campeonato = ${f.length}`);
  fases[k] = f[0];
}
const ids = [...new Set(P.flatMap((p) => [p[2], p[3]]))];
const existen = new Set((await get(`clubs?select=id&id=in.(${ids.join(',')})`)).map((c) => c.id));
const faltan = ids.filter((i) => !existen.has(i));
if (faltan.length) throw new Error(`Clubes inexistentes: ${faltan.join(', ')}`);

const filas = [];
for (const [k, nro, h, a, fecha, hora, score] of P) {
  const [d, m] = fecha.split('/');
  const dt = new Date(`2026-${m}-${d}T${hora ?? '12:00'}:00-03:00`).toISOString();
  const t = TORNEOS[k];
  const ya = await get(`matches?select=id&tournament_id=eq.${t}&home_club_id=eq.${h}&away_club_id=eq.${a}&date_time=gte.2026-10-28`);
  if (ya.length) { console.log('YA ESTÁ', nro, h, 'vs', a); continue; }
  filas.push({
    id: crypto.randomUUID(), tournament_id: t, season_id: fases[k].season_id, phase_id: fases[k].id,
    home_club_id: h, away_club_id: a, date_time: dt, round_label: 'Fecha 24', is_visible: true, review_status: 'approved',
    status: score ? 'final' : 'scheduled', score: score ?? null, notes: score ? 'W.O.: ganado por no presentación del rival.' : null,
  });
  console.log(EXEC ? 'INSERTA' : 'PLAN', nro, k, h, 'vs', a, dt, score ? `${score.home}-${score.away}` : '');
}
if (EXEC && filas.length) {
  const r = await fetch(`${URL}/rest/v1/matches`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(filas) });
  if (!r.ok) throw new Error(`POST matches: ${r.status} ${await r.text()}`);
  console.log('listo', filas.length);
}
