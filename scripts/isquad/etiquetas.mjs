/**
 * Etiquetas de tabla (la banda de color por puesto) de las competiciones de la
 * FER que se sincronizan desde iSquad, según el formato 2026/27 publicado por
 * la federación. iSquad no las publica: su tabla no tiene leyenda.
 *
 *   node scripts/isquad/etiquetas.mjs --plan
 *   node scripts/isquad/etiquetas.mjs --execute
 *
 * Fuentes (consultadas el 2026-10-01):
 * - ferugby.es, "Sorteados los calendarios de División de Honor, División de
 *   Honor Élite, División de Honor B y Liga M23 para la temporada 2026/27":
 *   · DH Élite: fase regular, "seguida de semifinales y final"; "el último
 *     clasificado descenderá a División de Honor B".
 *   · DH B: "los tres primeros clasificados de los grupos A, B y C, junto con el
 *     primer clasificado del Grupo D, accederán al Grupo Ascenso". "Descenderán
 *     directamente el último clasificado de los grupos A, B y C y los cinco
 *     últimos del Grupo D, mientras que los séptimos clasificados de los grupos
 *     A, B y C y el tercer clasificado del Grupo D disputarán una eliminatoria
 *     de permanencia".
 *   · M23: "los cuatro primeros clasificados de cada grupo accederán al play-off
 *     por el título", con cuartos cruzados. Sin ascensos ni descensos.
 * - rugbyfemenino.com.es, "La RFER confirma el formato y el calendario de la Liga
 *   Iberdrola y la DHF B para 2026/27" (21/07/2026):
 *   · Liga Iberdrola: "los cuatro primeros clasificados jugarán un play-off por
 *     el título".
 *   · DH B Femenina: tras 7 jornadas "los equipos se dividirán en dos grupos de
 *     cuatro (A y B) según su clasificación".
 *
 * Lo que NO se etiqueta, a propósito:
 * - El fondo de la Liga Iberdrola: el formato habla de 8 equipos (7.º a
 *   promoción, 8.º desciende) pero iSquad tiene 7 inscriptos; con 7 no está
 *   publicado qué le toca al último.
 * - El Grupo D de la DH B tiene 6 equipos, no 8: "los cinco últimos" de un grupo
 *   de 8 son del 4.º al 8.º, que en uno de 6 queda del 4.º al 6.º. Se etiqueta
 *   así; el 3.º va a permanencia como dice el texto.
 *
 * La banda que se ve en la web sale de `team_labels` POR POSICIÓN (con
 * `phase_id` y, en las fases por zonas, `group_id`) más `ui_labels`. En las
 * fases de un solo grupo se escribe además `settings.groupLabels` (la lista del
 * gestor). En las fases por zonas NO: ahí `groupLabels` son las zonas mismas.
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

const VERDE = '#00a365'; const AZUL = '#3b82f6'; const AMARILLO = '#eab308'; const ROJO = '#ef4444';
const FIN = Infinity;

/** Reglas por campeonato de iSquad y nombre de grupo: [nombre, color, desde, hasta]. */
function reglas(campeonato, grupo) {
  switch (campeonato) {
    case '419': return [['Play-off por el título', VERDE, 1, 4]];
    case '417': return [['Semifinales', VERDE, 1, 4], ['Descenso', ROJO, FIN, FIN]];
    case '420': return [['Fase final · Grupo A', VERDE, 1, 4], ['Fase final · Grupo B', AZUL, 5, 8]];
    case '418': return grupo === 'Grupo D'
      ? [['Grupo Ascenso', VERDE, 1, 1], ['Eliminatoria de permanencia', AMARILLO, 3, 3], ['Descenso', ROJO, 4, FIN]]
      : [['Grupo Ascenso', VERDE, 1, 3], ['Eliminatoria de permanencia', AMARILLO, 7, 7], ['Descenso', ROJO, FIN, FIN]];
    case '421': return [['Cuartos de final', VERDE, 1, 4]];
    default: return [];
  }
}

async function main() {
  console.log(`modo: ${modo}\n`);
  const torneos = await req('GET', 'tournaments?select=id,name,external_id&external_id=like.isquad:*');
  let nAsig = 0;
  for (const t of torneos.sort((a, b) => a.name.localeCompare(b.name))) {
    const campeonato = t.external_id.split(':')[2];
    const fases = await req('GET', `tournament_phases?select=id,name,settings&tournament_id=eq.${t.id}`);
    for (const f of fases) {
      const grupos = f.settings?.isquad?.grupos ?? [];
      const conZonas = grupos.some((g) => g.groupId);
      const tramos = [];
      for (const g of grupos) {
        const equipos = (await req('GET', `tournament_phase_participants?select=id&phase_id=eq.${f.id}${g.groupId ? `&group_id=eq.${g.groupId}` : ''}`)).length;
        const rs = reglas(campeonato, g.nombre).map(([nombre, color, desde, hasta]) => ({
          nombre, color, groupId: g.groupId ?? null, grupo: g.nombre,
          desde: desde === FIN ? equipos : desde, hasta: Math.min(hasta === FIN ? equipos : hasta, equipos),
        })).filter((r) => r.desde >= 1 && r.desde <= r.hasta);
        tramos.push(...rs);
        console.log(`${t.name.padEnd(30)} ${(g.nombre ?? '').padEnd(8)} (${equipos}) ${rs.map((r) => `${r.nombre} ${r.desde}-${r.hasta}`).join(' · ')}`);
      }
      if (!tramos.length) continue;
      nAsig += tramos.reduce((n, r) => n + r.hasta - r.desde + 1, 0);
      if (modo === 'plan') continue;

      // Una etiqueta por nombre y fase (las zonas la comparten), como hace el gestor.
      const porNombre = new Map();
      for (const r of tramos) if (!porNombre.has(r.nombre)) porNombre.set(r.nombre, { id: crypto.randomUUID(), name: r.nombre, color: r.color, scope: 'standings' });
      const labels = [...porNombre.values()];
      await req('POST', 'ui_labels', labels);
      await req('DELETE', `team_labels?phase_id=eq.${f.id}`);
      await req('POST', 'team_labels', tramos.flatMap((r) => Array.from({ length: r.hasta - r.desde + 1 }, (_, k) => ({
        label_id: porNombre.get(r.nombre).id, club_id: null, position: r.desde + k,
        tournament_id: t.id, phase_id: f.id, group_id: r.groupId,
      }))));
      if (!conZonas) {
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
