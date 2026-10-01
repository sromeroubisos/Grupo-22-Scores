/**
 * Etiquetas de tabla (la banda de color por puesto) de los torneos juveniles
 * cargados por script: Dos Orillas 2026 y Juvenil de Tucumán 2026, según el
 * reglamento de cada uno.
 *
 *   node scripts/etiquetas-juveniles.mjs --plan
 *   node scripts/etiquetas-juveniles.mjs --execute
 *
 * La banda que se ve en la web sale de `team_labels` POR POSICIÓN (con
 * `phase_id`) más `ui_labels` (nombre y color); `settings.groupLabels` es la
 * lista que el gestor ofrece. Se escriben las tres. Una etiqueta por fase, como
 * hace el gestor: compartirla acoplaría dos torneos por el color.
 *
 * Idempotente: antes de asignar se limpia la POSICIÓN entera de la fase (no
 * sólo las etiquetas que este script conoce): dos etiquetas en el mismo puesto
 * hacen que la web pinte la que devuelva el heap.
 *
 * Reglamentos:
 * - Dos Orillas 2026 (Tercer Tiempo, 25/3 y 13/6): clasifican los 6 primeros de
 *   cada divisional a la Final Six de Oro; en M14-M17 el 7.° y 8.° van a la
 *   Plata con los de Formación; en M19 del 7.° al 10.° juegan la Plata. De la
 *   Final Six: 1.°-4.° de Oro a la Final Four de Oro; 5.°-6.° de Oro y 1.°-2.°
 *   de Plata a la Final Four de Plata; el resto de la Plata a la de Bronce.
 * - URT 2026 (boletín Nº 12, Anexo III): 1.°-4.° de la primera ronda a la Copa
 *   de Oro y del 5.° en adelante a la Plata; en M19, 5.°-8.° Plata y 9.°-11.°
 *   Bronce. Copa de Oro: el 1.° y el 2.° juegan la final. Copa de Plata: con 5 o
 *   6 equipos, semifinales 1.°-4.°; con 4 (M19), final entre el 1.° y el 2.°.
 *   Iniciación: el cierre fueron cruces por puesto entre zonas (1.° A vs 1.° B
 *   por el título), así que sólo el 1.° de cada zona lleva "Final".
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
const U = env.NEXT_PUBLIC_SUPABASE_URL; const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const req = async (metodo, recurso, cuerpo) => {
  const res = await fetch(encodeURI(`${U}/rest/v1/${recurso}`), {
    method: metodo, headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? [] : res.json();
};

const ORO = '#00a365'; const PLATA = '#3b82f6'; const BRONCE = '#eab308';
const FIN = Infinity;

/** Reglas: por torneo y fase, rangos de puestos [desde, hasta] (hasta FIN = último). */
function reglas(slug, fase, equipos) {
  const m19 = /-m19(-|$)/.test(slug);
  if (slug.startsWith('dos-orillas-juvenil-')) {
    if (fase === 'Fase clasificatoria') return m19
      ? [['Final Six Oro', ORO, 1, 6], ['Final Six Plata', PLATA, 7, 10]]
      : [['Final Six Oro', ORO, 1, 6], ['Final Six Plata', PLATA, 7, 8]];
    if (fase === 'Competencia Formación') return [['Final Six Plata', PLATA, 1, FIN]];
    if (fase === 'Final Six Oro') return [['Final Four Oro', ORO, 1, 4], ['Final Four Plata', PLATA, 5, 6]];
    if (fase === 'Final Six Plata') return [['Final Four Plata', PLATA, 1, 2], ['Final Four Bronce', BRONCE, 3, FIN]];
    return [];
  }
  if (slug.startsWith('urt-juvenil-')) {
    if (/^Iniciación/.test(fase)) return [['Final', ORO, 1, 1]];
    if (fase === 'Anual · Primera ronda') return m19
      ? [['Copa de Oro', ORO, 1, 4], ['Copa de Plata', PLATA, 5, 8], ['Copa de Bronce', BRONCE, 9, FIN]]
      : [['Copa de Oro', ORO, 1, 4], ['Copa de Plata', PLATA, 5, FIN]];
    if (fase === 'Anual · Copa de Oro') return [['Final', ORO, 1, 2]];
    if (fase === 'Anual · Copa de Plata') return equipos <= 4 ? [['Final', PLATA, 1, 2]] : [['Semifinales', PLATA, 1, 4]];
    return [];
  }
  return [];
}

const SLUGS = ['m15', 'm16', 'm17', 'm19'].flatMap((d) => [
  `dos-orillas-juvenil-${d}`, `urt-juvenil-${d}`, `urt-juvenil-${d}-reserva`,
]);

async function main() {
  console.log(`modo: ${modo}\n`);
  const torneos = await req('GET', `tournaments?select=id,slug,current_season_id&slug=in.(${SLUGS.join(',')})`);
  let nFases = 0; let nAsig = 0;
  for (const t of torneos.sort((a, b) => a.slug.localeCompare(b.slug))) {
    const fases = await req('GET', `tournament_phases?select=id,name,settings&season_id=eq.${t.current_season_id}&order=order_index`);
    for (const f of fases) {
      const equipos = (await req('GET', `tournament_phase_participants?select=id&phase_id=eq.${f.id}`)).length;
      const rs = reglas(t.slug, f.name, equipos).map(([nombre, color, desde, hasta]) => ({
        nombre, color, desde, hasta: Math.min(hasta, equipos),
      })).filter((r) => r.desde <= r.hasta);
      if (!rs.length) continue;
      nFases++;
      console.log(`${t.slug.padEnd(28)} ${f.name.padEnd(24)} (${equipos}) ${rs.map((r) => `${r.nombre} ${r.desde}-${r.hasta}`).join(' · ')}`);
      if (modo === 'plan') { nAsig += rs.reduce((n, r) => n + r.hasta - r.desde + 1, 0); continue; }

      const labels = rs.map((r) => ({ id: crypto.randomUUID(), name: r.nombre, color: r.color, scope: 'standings' }));
      await req('POST', 'ui_labels', labels);
      await req('DELETE', `team_labels?phase_id=eq.${f.id}`);
      const asignaciones = rs.flatMap((r, i) => Array.from({ length: r.hasta - r.desde + 1 }, (_, k) => ({
        label_id: labels[i].id, club_id: null, position: r.desde + k,
        tournament_id: t.id, phase_id: f.id, group_id: null,
      })));
      await req('POST', 'team_labels', asignaciones);
      nAsig += asignaciones.length;
      // El PATCH de la fase pisa settings entero: se parte del actual.
      const settings = { ...(f.settings || {}) };
      settings.groupLabels = labels.map((l) => ({ id: l.id, name: l.name, color: l.color, colorMode: 'manual', autoColorIndex: 0 }));
      settings.groupTags = labels.map((l) => l.name);
      await req('PATCH', `tournament_phases?id=eq.${f.id}`, { settings });
    }
  }
  console.log(`\n${nFases} fases · ${nAsig} puestos etiquetados${modo === 'plan' ? ' (plan: no se escribió nada)' : ''}`);
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
