/**
 * Logo de la Unión Cordobesa y etiquetas de tabla (la banda de color por puesto)
 * del Torneo Cordobés M19 "A" 2026.
 *
 *   node scripts/cordoba-m19/etiquetas.mjs --plan
 *   node scripts/cordoba-m19/etiquetas.mjs --execute
 *
 * Logo: el escudo de la Unión que ya está en Storage como logo del Top 10 del
 * Centro (mismo archivo, no se sube otra copia).
 *
 * Etiquetas: la banda sale de `team_labels` POR POSICIÓN (con `phase_id`) más
 * `ui_labels`; `settings.groupLabels` es la lista que ofrece el gestor. Se
 * escriben las tres. Idempotente: antes de asignar se limpia la posición entera
 * de la fase (dos etiquetas en un puesto hacen que la web pinte una al azar).
 *
 * OJO con lo que NO se etiqueta: los playoffs salieron de la tabla de las 18
 * fechas, pero la tabla oficial acumula también la ronda REC. Ahí Urú Curé queda
 * 4.º (juega la llave 5.°-8.°) y Jockey Villa María 5.º (juega semifinales). Como
 * la etiqueta va por puesto y no por club, el 4.º y el 5.º quedan SIN banda:
 * pintarlos diría algo falso de uno de los dos.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const req = async (metodo, recurso, cuerpo) => {
  const res = await fetch(encodeURI(`${U}/rest/v1/${recurso}`), {
    method: metodo, headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? [] : res.json();
};

const SLUG = 'torneo-cordobes-m19-a';
const LOGO = `${U}/storage/v1/object/public/tournaments/logos/55f28144-3d92-484b-a57d-646e06740808-1787176338921.png`;
const ORO = '#00a365'; const PLATA = '#3b82f6'; const BRONCE = '#eab308';
const REGLAS = [
  ['Semifinales', ORO, 1, 3],
  ['Posicionamiento 5° al 8°', PLATA, 6, 8],
  ['Posicionamiento 9° y 10°', BRONCE, 9, 10],
];

async function main() {
  console.log(`modo: ${modo}\n`);
  const [t] = await req('GET', `tournaments?select=id,logo_url,current_season_id&slug=eq.${SLUG}`);
  if (!t) throw new Error('el torneo no existe');
  const [fase] = await req('GET', `tournament_phases?select=id,settings&season_id=eq.${t.current_season_id}&name=eq.Campeonato`);
  console.log(`logo: ${t.logo_url ? 'ya tiene' : 'se pone el de la Unión'}`);
  for (const [n, , d, h] of REGLAS) console.log(`etiqueta ${n}: puestos ${d}-${h}`);
  console.log('sin etiqueta: puestos 4 y 5 (ver nota del script)');
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió nada.'); return; }

  await req('PATCH', `tournaments?id=eq.${t.id}`, { logo_url: LOGO, updated_at: new Date().toISOString() });

  const labels = REGLAS.map(([name, color]) => ({ id: crypto.randomUUID(), name, color, scope: 'standings' }));
  await req('POST', 'ui_labels', labels);
  await req('DELETE', `team_labels?phase_id=eq.${fase.id}`);
  const asignaciones = REGLAS.flatMap(([, , desde, hasta], i) => Array.from({ length: hasta - desde + 1 }, (_, k) => ({
    label_id: labels[i].id, club_id: null, position: desde + k, tournament_id: t.id, phase_id: fase.id, group_id: null,
  })));
  await req('POST', 'team_labels', asignaciones);
  // El PATCH de la fase pisa settings entero: se parte del actual.
  const settings = { ...(fase.settings || {}) };
  settings.groupLabels = labels.map((l) => ({ id: l.id, name: l.name, color: l.color, colorMode: 'manual', autoColorIndex: 0 }));
  settings.groupTags = labels.map((l) => l.name);
  await req('PATCH', `tournament_phases?id=eq.${fase.id}`, { settings });
  console.log(`\n✓ logo · ${labels.length} etiquetas · ${asignaciones.length} puestos`);
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
