/**
 * Etiquetas de tabla (la banda de color por puesto) de las competiciones de la
 * CBRu que se sincronizan desde SporTI. SporTI no las publica: su tabla no
 * tiene leyenda.
 *
 *   node scripts/sporti/etiquetas.mjs --plan
 *   node scripts/sporti/etiquetas.mjs --execute
 *
 * Fuente (consultada el 2026-10-02): brasilrugby.com.br, "Hexagonal e
 * Repescagem do Super 12 têm tabelas definidas" (31/08/2026):
 * - "os 6 melhores times da 1ª divisão encarando o Hexagonal […] com os dois
 *   melhores se qualificando para a grande final de novembro".
 * - "os 6 times de pior campanha na 1ª fase da 1ª divisão encararão os 6
 *   melhores da 2ª divisão […] os 2 melhores de cada grupo se garantirão na
 *   1ª divisão de 2027". Por la desistencia de Tornados Indaiatuba un grupo
 *   juega con 3.
 *
 * Lo que NO se etiqueta, a propósito: el fondo de la Segunda (la nota no dice
 * que alguien descienda) y las Copas do Brasil, que son eliminatorias.
 *
 * La banda que se ve en la web sale de `team_labels` POR POSICIÓN (con
 * `phase_id` y, en las fases por grupos, `group_id`) más `ui_labels`. En las
 * fases de un solo grupo se escribe además `settings.groupLabels` (la lista del
 * gestor); en las de grupos NO, porque ahí `groupLabels` son los grupos mismos.
 *
 * Idempotente: antes de asignar se limpia la POSICIÓN entera de la fase.
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

const VERDE = '#00a365'; const AMARILLO = '#eab308'; const ROJO = '#ef4444';
const FIN = Infinity;

/** Reglas por campeonato y fase de SporTI: [nombre, color, desde, hasta]. */
function reglas(campeonato, fase) {
  switch (`${campeonato}/${fase}`) {
    case '3542/1367': return [['Hexagonal', VERDE, 1, 2], ['Repescagem', AMARILLO, 3, FIN]];
    case '3542/1365': return [['Final', VERDE, 1, 2]];
    case '3543/1368': return [['Repescagem', VERDE, 1, 2]];
    case '3544/1597': return [['Primeira Divisão 2027', VERDE, 1, 2], ['Segunda Divisão 2027', ROJO, 3, FIN]];
    default: return [];
  }
}

async function main() {
  console.log(`modo: ${modo}\n`);
  const torneos = await req('GET', 'tournaments?select=id,name,external_id&external_id=like.sporti:*');
  let nAsig = 0;
  for (const t of torneos.sort((a, b) => a.name.localeCompare(b.name))) {
    const campeonato = t.external_id.split(':')[1];
    const fases = await req('GET', `tournament_phases?select=id,name,settings&tournament_id=eq.${t.id}`);
    for (const f of fases) {
      const cfg = f.settings?.sporti;
      if (!cfg) continue;
      const definicion = reglas(campeonato, cfg.fase);
      if (!definicion.length) continue;
      // Sin grupos, la fase entera es un solo "grupo" con `group_id` null.
      const grupos = cfg.grupos ? Object.entries(cfg.grupos).sort(([a], [b]) => a.localeCompare(b)) : [[null, null]];
      const conGrupos = Boolean(cfg.grupos);
      const tramos = [];
      for (const [letra, groupId] of grupos) {
        const equipos = (await req('GET', `tournament_phase_participants?select=id&phase_id=eq.${f.id}${groupId ? `&group_id=eq.${groupId}` : ''}`)).length;
        const rs = definicion.map(([nombre, color, desde, hasta]) => ({
          nombre, color, groupId,
          desde: desde === FIN ? equipos : desde, hasta: Math.min(hasta === FIN ? equipos : hasta, equipos),
        })).filter((r) => r.desde >= 1 && r.desde <= r.hasta);
        tramos.push(...rs);
        console.log(`${`${t.name} · ${f.name}`.padEnd(48)} ${(letra ? `Grupo ${letra}` : '').padEnd(8)} (${equipos}) ${rs.map((r) => `${r.nombre} ${r.desde}-${r.hasta}`).join(' · ')}`);
      }
      if (!tramos.length) continue;
      nAsig += tramos.reduce((n, r) => n + r.hasta - r.desde + 1, 0);
      if (modo === 'plan') continue;

      // Una etiqueta por nombre y fase (los grupos la comparten), como hace el gestor.
      const porNombre = new Map();
      for (const r of tramos) if (!porNombre.has(r.nombre)) porNombre.set(r.nombre, { id: crypto.randomUUID(), name: r.nombre, color: r.color, scope: 'standings' });
      const labels = [...porNombre.values()];
      await req('POST', 'ui_labels', labels);
      await req('DELETE', `team_labels?phase_id=eq.${f.id}`);
      await req('POST', 'team_labels', tramos.flatMap((r) => Array.from({ length: r.hasta - r.desde + 1 }, (_, k) => ({
        label_id: porNombre.get(r.nombre).id, club_id: null, position: r.desde + k,
        tournament_id: t.id, phase_id: f.id, group_id: r.groupId,
      }))));
      if (!conGrupos) {
        // El PATCH de la fase pisa settings entero: se parte del actual.
        const settings = { ...(f.settings || {}) };
        settings.groupLabels = labels.map((l) => ({ id: l.id, name: l.name, color: l.color, colorMode: 'manual', autoColorIndex: 0 }));
        settings.groupTags = labels.map((l) => l.name);
        await req('PATCH', `tournament_phases?id=eq.${f.id}`, { settings });
      }
    }
  }
  console.log(`\n${nAsig} puestos etiquetados${modo === 'plan' ? ' (plan: no se escribió nada)' : ''}`);
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
