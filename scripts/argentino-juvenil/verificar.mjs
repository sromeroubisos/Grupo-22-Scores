/**
 * Verifica contra la base lo que dejó `seed.mjs`: no confía en el conteo que
 * imprimió la carga, vuelve a leer y compara contra el canon de `datos.mjs`.
 *
 *   node scripts/argentino-juvenil/verificar.mjs
 *
 * Chequea las tres tablas del participante por separado a propósito: cada una
 * la lee un consumidor distinto —la página, el motor de posiciones— y ninguno
 * avisa cuando falta la suya.
 */
import fs from 'node:fs';
import path from 'node:path';

import { CLUBES_M17, CLUBES_M18, DIAS, instanteDe, PALMARES_M17, PALMARES_M18, TORNEOS, TORNEO_M18 } from './datos.mjs';

const REPO = process.cwd();
const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const leer = async (r) => {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${r}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${r}: ${res.status}`);
  return res.json();
};

let fallas = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const mal = (m) => { fallas++; console.log(`  ✗ ${m}`); };
const igual = (nombre, real, esperado) => (real === esperado ? ok(`${nombre}: ${real}`) : mal(`${nombre}: ${real} (esperaba ${esperado})`));

async function main() {
  // ── Clubes ────────────────────────────────────────────────────────────────
  console.log('\nCLUBES');
  const ids = [...CLUBES_M17, ...CLUBES_M18].map((c) => c.id);
  const clubes = await leer(`clubs?select=id,name,logo_url,primary_color,sport_id,union_id,is_visible&id=in.(${ids.join(',')})`);
  igual('filas', clubes.length, ids.length);
  const sinEscudo = clubes.filter((c) => c.logo_url !== `/clubs/${c.id}.png`);
  sinEscudo.length ? mal(`escudos mal apuntados: ${sinEscudo.map((c) => c.id).join(', ')}`) : ok('los 20 apuntan a /clubs/<id>.png');
  const archivoFaltante = clubes.filter((c) => !fs.existsSync(path.join(REPO, 'public', 'clubs', `${c.id}.png`)));
  archivoFaltante.length ? mal(`sin archivo en public/: ${archivoFaltante.map((c) => c.id).join(', ')}`) : ok('los 20 archivos están en public/clubs');
  const embebido = clubes.filter((c) => String(c.logo_url).startsWith('data:'));
  embebido.length ? mal(`${embebido.length} en base64`) : ok('ninguno en base64');
  const noRugby = clubes.filter((c) => c.sport_id !== 'rugby' || !c.is_visible);
  noRugby.length ? mal(`sport_id o visibilidad mal: ${noRugby.map((c) => c.id).join(', ')}`) : ok('los 20 son rugby y visibles');

  // ── Torneos de 2026 ───────────────────────────────────────────────────────
  for (const t of TORNEOS) {
    console.log(`\n${t.nombre.toUpperCase()}`);
    const [torneo] = await leer(`tournaments?select=*&slug=eq.${t.slug}`);
    if (!torneo) { mal('no está en la base'); continue; }
    igual('logo', torneo.logo_url, '/competiciones/ar-argentino-juvenil.png');
    igual('estado', `${torneo.status}/activo:${torneo.is_active}/visible:${torneo.is_visible}`, 'published/activo:true/visible:true');
    igual('puntos del reglamento', JSON.stringify(torneo.ruleset?.pointsSystem), JSON.stringify({ win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1, allowBonusPoints: true }));
    Array.isArray(torneo.ruleset?.tiebreakers) ? ok('desempates como array') : mal('desempates NO son array: el motor cae a diferencia de tantos');

    const [temporada] = await leer(`tournament_seasons?select=id,season_code,is_active&tournament_id=eq.${torneo.id}&season_code=eq.2026`);
    if (!temporada) { mal('sin temporada 2026'); continue; }
    igual('temporada 2026 vinculada', torneo.current_season_id === temporada.id, true);

    const fases = await leer(`tournament_phases?select=id,name,phase_type,order_index,is_active&tournament_id=eq.${torneo.id}&order=order_index`);
    igual('fases', fases.map((f) => `${f.name}(${f.phase_type})`).join(' + '), 'Fase de Grupos(group_stage) + Fase Final(playoff)');
    const grupos = await leer(`tournament_groups?select=id,name&phase_id=eq.${fases[0].id}&order=order_index`);
    igual('zonas', grupos.map((g) => g.name).join(' + '), t.zonas.map((z) => z.nombre).join(' + '));
    const rondas = await leer(`tournament_rounds?select=name,phase_id,start_date&phase_id=in.(${fases.map((f) => f.id).join(',')})`);
    igual('fechas', rondas.length, 5);

    // Las tres tablas del participante
    const participantes = await leer(`tournament_participants?select=id,club_id,group_id,season_entry_id&tournament_id=eq.${torneo.id}`);
    const entradas = await leer(`team_season_entries?select=id,club_id,group_id,zone&tournament_id=eq.${torneo.id}`);
    const enFase = await leer(`tournament_phase_participants?select=id,phase_id,participant_id,group_id&tournament_id=eq.${torneo.id}`);
    igual('participantes', participantes.length, 8);
    igual('entradas de temporada', entradas.length, 8);
    igual('asignaciones de fase', enFase.length, 16);
    const sinBackref = participantes.filter((p) => !p.season_entry_id);
    sinBackref.length ? mal(`${sinBackref.length} participantes sin back-ref a su entrada`) : ok('los 8 back-refs cerrados');
    const zonaPorGrupo = new Map(grupos.map((g) => [g.id, g.name]));
    for (const z of t.zonas) {
      const enZona = participantes.filter((p) => zonaPorGrupo.get(p.group_id) === z.nombre).map((p) => p.club_id).sort();
      igual(`  ${z.nombre}`, enZona.join(','), [...z.clubes].sort().join(','));
    }
    const enFinal = enFase.filter((f) => f.phase_id === fases[1].id);
    igual('los 8 entran a la fase final', enFinal.length, 8);

    // Partidos
    const partidos = await leer(`matches?select=*&tournament_id=eq.${torneo.id}&order=date_time`);
    igual('partidos', partidos.length, 20);
    const zona = partidos.filter((p) => p.phase_id === fases[0].id);
    const finales = partidos.filter((p) => p.phase_id === fases[1].id);
    igual('  de zona', zona.length, 12);
    igual('  de fase final', finales.length, 8);
    const esperadoPorCodigo = new Map([
      ...t.grupos.map((g) => [`${g.local}>${g.visitante}`, instanteDe(g.fecha, g.hora)]),
      ...t.final.map((f) => [`P${f.n}`, instanteDe(f.fecha, f.hora)]),
    ]);
    const horaMal = partidos.filter((p) => {
      const esperado = esperadoPorCodigo.get(p.bracket_match_code || `${p.home_club_id}>${p.away_club_id}`);
      return !esperado || new Date(p.date_time).toISOString() !== esperado;
    });
    horaMal.length
      ? mal(`${horaMal.length} partidos con horario distinto al del canon`)
      : ok('los 20 con el horario del canon');
    const zonaSinGrupo = zona.filter((p) => !p.group_id);
    zonaSinGrupo.length ? mal(`${zonaSinGrupo.length} partidos de zona sin group_id`) : ok('los 12 de zona con su zona');
    const sinFase = partidos.filter((p) => !p.phase_id);
    sinFase.length ? mal(`${sinFase.length} partidos sin phase_id: invisibles para la tabla`) : ok('los 20 con phase_id');
    const sinRonda = partidos.filter((p) => !p.round_uuid);
    sinRonda.length ? mal(`${sinRonda.length} partidos sin fecha`) : ok('los 20 atados a su fecha');
    const zonaOculta = zona.filter((p) => !p.is_visible);
    zonaOculta.length ? mal(`${zonaOculta.length} partidos de zona ocultos`) : ok('los 12 de zona visibles');
    const finalVisible = finales.filter((p) => p.is_visible);
    finalVisible.length ? mal(`${finalVisible.length} cruces visibles sin equipos`) : ok('los 8 cruces ocultos hasta tener rivales');
    const codigos = finales.map((p) => p.bracket_match_code).sort();
    igual('  códigos de cruce', codigos.join(','), t.final.map((f) => `P${f.n}`).sort().join(','));
    const sinEtiqueta = finales.filter((p) => !p.home_source_label || !p.away_source_label);
    sinEtiqueta.length ? mal(`${sinEtiqueta.length} cruces sin etiqueta de origen`) : ok('los 8 cruces dicen de dónde sale cada equipo');

    // Fixture, cruce por cruce
    const clave = (p) => `${p.home_club_id}>${p.away_club_id}@${p.date_time.slice(0, 10)}`;
    const reales = new Set(zona.map(clave));
    const faltan = t.grupos.filter((g) => !reales.has(`${g.local}>${g.visitante}@${DIAS[g.fecha]}`));
    faltan.length ? mal(`faltan del fixture: ${faltan.map((g) => `P${g.n}`).join(', ')}`) : ok('el fixture de zona coincide partido por partido');

    // Avance automático
    const reglas = await leer(`tournament_match_advancement_rules?select=source_match_id,outcome,target_match_id,target_slot&phase_id=eq.${fases[1].id}`);
    igual('reglas de avance', reglas.length, 8);
    const codigoPorId = new Map(finales.map((p) => [p.id, p.bracket_match_code]));
    const grafo = reglas.map((r) => `${codigoPorId.get(r.source_match_id)}:${r.outcome}→${codigoPorId.get(r.target_match_id)}.${r.target_slot}`).sort();
    const esperado = t.final.filter((f) => f.fecha === 5).flatMap((f) => [
      `P${f.local.de}:${f.local.resultado}→P${f.n}.home`,
      `P${f.visitante.de}:${f.visitante.resultado}→P${f.n}.away`,
    ]).sort();
    igual('  grafo de avance', grafo.join(' '), esperado.join(' '));
  }

  // ── Palmarés ──────────────────────────────────────────────────────────────
  console.log('\nPALMARÉS');
  const [principal] = await leer(`tournaments?select=id&slug=eq.${TORNEOS[0].slug}`);
  const temporadasM17 = await leer(`tournament_seasons?select=season_code,champion_club_id,status&tournament_id=eq.${principal.id}&order=season_code`);
  igual('temporadas del M17', temporadasM17.length, PALMARES_M17.length + 1);
  for (const p of PALMARES_M17) {
    const fila = temporadasM17.find((s) => s.season_code === p.anio);
    igual(`  M17 ${p.anio}`, fila?.champion_club_id, p.campeon);
  }
  const [m18] = await leer(`tournaments?select=id,name,logo_url,age_grade&slug=eq.${TORNEO_M18.slug}`);
  if (!m18) { mal('no está el torneo M18'); }
  else {
    const temporadasM18 = await leer(`tournament_seasons?select=season_code,champion_club_id&tournament_id=eq.${m18.id}&order=season_code&limit=100`);
    igual('temporadas del M18', temporadasM18.length, PALMARES_M18.length);
    const diferencias = PALMARES_M18.filter((p) => temporadasM18.find((s) => s.season_code === p.anio)?.champion_club_id !== p.campeon);
    diferencias.length ? mal(`campeones que no coinciden: ${diferencias.map((d) => d.anio).join(', ')}`) : ok('los 21 campeones coinciden con el cuadro de honor');
    temporadasM18.some((s) => s.season_code === '2020') ? mal('2020 tiene temporada y no se disputó') : ok('2020 sin temporada: no se disputó');
  }

  console.log(fallas ? `\n${fallas} VERIFICACIONES FALLARON` : '\nTodo verificado.');
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
