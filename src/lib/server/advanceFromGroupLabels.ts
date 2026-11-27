/**
 * Avance por rótulo: un partido que todavía no tiene clubes dice de dónde salen
 * (`home_source_label` = "2º Zona B", "1º Copa de Oro") y, cuando ese grupo termina,
 * se completa solo con el club que quedó en ese puesto.
 *
 * Sirve para formatos que el cuadro de playoff no cubre: zonas que alimentan
 * triangulares (copas de Oro/Plata/Bronce de un seven) y triangulares que alimentan
 * una final. Lo corre `FixtureService.updateMatch` después de cada guardado, así que
 * da lo mismo si el resultado lo carga el gestor, el match center o un script.
 *
 * Es OPT-IN: solo actúa si la temporada tiene `settings.autoAdvanceFromLabels: true`.
 * Sin la bandera no lee nada más que la temporada, para no pisar torneos que usan otros
 * mecanismos (advancement rules, playoffSeeding) con rótulos parecidos.
 *
 * Corregir un resultado rehace el cruce mientras el partido de destino siga
 * `scheduled`; si el grupo deja de estar terminado, el cupo vuelve a quedar vacío.
 * Un partido ya empezado o jugado no se toca nunca.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Supa = SupabaseClient<any, any, any>;

export type Puntos = { win: number; draw: number; loss: number };
const PUNTOS_DEFAULT: Puntos = { win: 2, draw: 1, loss: 0 };

export interface LabelMatch {
  id: string;
  phase_id: string | null;
  group_id: string | null;
  status: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  score: { home?: number | string | null; away?: number | string | null } | null;
  home_source_label: string | null;
  away_source_label: string | null;
  is_visible?: boolean | null;
}

export interface LabelGroup {
  id: string;
  name: string;
  phase_id: string | null;
}

export interface LabelUpdate {
  id: string;
  phase_id: string | null;
  group_id: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  is_visible: boolean;
}

const LABEL_RE = /^\s*(\d+)\s*[ºo°.]\s*(.+?)\s*$/i;

/** "2º Zona B" → { puesto: 2, grupo: "Zona B" } */
export function parseSourceLabel(label: string | null | undefined): { puesto: number; grupo: string } | null {
  const m = label?.match(LABEL_RE);
  if (!m) return null;
  const puesto = Number(m[1]);
  return puesto >= 1 ? { puesto, grupo: m[2] } : null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Posiciones de un grupo terminado: puntos, resultado entre los igualados,
 * diferencia, tantos a favor y, como último recurso estable, el id del club.
 */
export function rankGroup(
  partidos: Array<{ h: string; a: string; hs: number; as: number }>,
  puntos: Puntos = PUNTOS_DEFAULT,
): string[] {
  const st = new Map<string, { pts: number; pf: number; pc: number }>();
  const fila = (c: string) => {
    if (!st.has(c)) st.set(c, { pts: 0, pf: 0, pc: 0 });
    return st.get(c)!;
  };
  const pts = (mio: number, suyo: number) => (mio > suyo ? puntos.win : mio === suyo ? puntos.draw : puntos.loss);
  for (const p of partidos) {
    const h = fila(p.h);
    const a = fila(p.a);
    h.pf += p.hs; h.pc += p.as; a.pf += p.as; a.pc += p.hs;
    h.pts += pts(p.hs, p.as);
    a.pts += pts(p.as, p.hs);
  }
  const clubes = [...st.keys()].sort();
  const h2h = (c: string, empatados: Set<string>) =>
    partidos
      .filter((p) => empatados.has(p.h) && empatados.has(p.a) && (p.h === c || p.a === c))
      .reduce((s, p) => s + (p.h === c ? pts(p.hs, p.as) : pts(p.as, p.hs)), 0);
  return [...clubes].sort((x, y) => {
    const X = st.get(x)!;
    const Y = st.get(y)!;
    if (X.pts !== Y.pts) return Y.pts - X.pts;
    const emp = new Set(clubes.filter((c) => st.get(c)!.pts === X.pts));
    const hx = h2h(x, emp);
    const hy = h2h(y, emp);
    if (hx !== hy) return hy - hx;
    const dx = X.pf - X.pc;
    const dy = Y.pf - Y.pc;
    if (dx !== dy) return dy - dx;
    if (X.pf !== Y.pf) return Y.pf - X.pf;
    return x.localeCompare(y);
  });
}

/**
 * Núcleo puro: qué partidos cambian. `puntosDeFase` da el sistema de puntos de la
 * fase de cada grupo (si falta, 2/1/0).
 */
export function planGroupLabelAdvancement(
  groups: LabelGroup[],
  matches: LabelMatch[],
  puntosDeFase: (phaseId: string | null) => Puntos = () => PUNTOS_DEFAULT,
): { updates: LabelUpdate[]; standings: Map<string, string[]> } {
  const clave = (s: string) => s.trim().toLowerCase();
  const standings = new Map<string, string[]>();
  for (const g of groups) {
    const delGrupo = matches.filter((m) => m.group_id === g.id);
    if (!delGrupo.length) continue;
    const terminado = delGrupo.every((m) => m.status === 'final' && m.home_club_id && m.away_club_id);
    if (!terminado) continue;
    standings.set(
      clave(g.name),
      rankGroup(
        delGrupo.map((m) => ({ h: m.home_club_id!, a: m.away_club_id!, hs: num(m.score?.home), as: num(m.score?.away) })),
        puntosDeFase(g.phase_id),
      ),
    );
  }
  const nombres = new Set(groups.map((g) => clave(g.name)));

  const updates: LabelUpdate[] = [];
  for (const m of matches) {
    if (m.status !== 'scheduled') continue;
    const lh = parseSourceLabel(m.home_source_label);
    const la = parseSourceLabel(m.away_source_label);
    // Solo los rótulos que apuntan a un grupo de esta temporada son nuestros.
    const nuestro = (l: typeof lh) => Boolean(l && nombres.has(clave(l.grupo)));
    if (!nuestro(lh) && !nuestro(la)) continue;
    const resolver = (l: typeof lh, actual: string | null) => {
      if (!l || !nuestro(l)) return actual;
      return standings.get(clave(l.grupo))?.[l.puesto - 1] ?? null;
    };
    const home = resolver(lh, m.home_club_id);
    const away = resolver(la, m.away_club_id);
    const visible = Boolean(home && away);
    if (home === m.home_club_id && away === m.away_club_id && Boolean(m.is_visible) === visible) continue;
    updates.push({ id: m.id, phase_id: m.phase_id, group_id: m.group_id, home_club_id: home, away_club_id: away, is_visible: visible });
  }
  return { updates, standings };
}

export interface LabelAdvancementResult {
  ok: boolean;
  enabled: boolean;
  changed: number;
  error?: string;
}

/** Corre el avance por rótulo para la temporada del partido. Nunca tira. */
export async function advanceFromGroupLabels(supabase: Supa, matchId: string): Promise<LabelAdvancementResult> {
  try {
    const { data: match } = await supabase.from('matches').select('tournament_id, season_id').eq('id', matchId).maybeSingle();
    if (!match?.season_id) return { ok: true, enabled: false, changed: 0 };
    return await advanceSeasonFromGroupLabels(supabase, match.tournament_id as string, match.season_id as string);
  } catch (e) {
    return { ok: false, enabled: true, changed: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function advanceSeasonFromGroupLabels(
  supabase: Supa,
  tournamentId: string,
  seasonId: string,
  opts: { force?: boolean } = {},
): Promise<LabelAdvancementResult> {
  const { data: season } = await supabase.from('tournament_seasons').select('settings').eq('id', seasonId).maybeSingle();
  const enabled = Boolean((season?.settings as { autoAdvanceFromLabels?: boolean } | null)?.autoAdvanceFromLabels);
  if (!enabled && !opts.force) return { ok: true, enabled: false, changed: 0 };

  const [{ data: phases }, { data: groups }, { data: matches }, { data: parts }] = await Promise.all([
    supabase.from('tournament_phases').select('id, order_index, is_active, settings').eq('season_id', seasonId),
    supabase.from('tournament_groups').select('id, name, phase_id').eq('season_id', seasonId),
    supabase
      .from('matches')
      .select('id, phase_id, group_id, status, home_club_id, away_club_id, score, home_source_label, away_source_label, is_visible')
      .eq('season_id', seasonId),
    supabase.from('tournament_participants').select('id, club_id, season_entry_id').eq('season_id', seasonId),
  ]);

  const puntosDeFase = (phaseId: string | null): Puntos => {
    const ps = (phases ?? []).find((p) => p.id === phaseId)?.settings?.pointsSystem;
    return ps && Number.isFinite(Number(ps.win))
      ? { win: num(ps.win), draw: num(ps.draw), loss: num(ps.loss) }
      : PUNTOS_DEFAULT;
  };
  const { updates } = planGroupLabelAdvancement(
    (groups ?? []) as LabelGroup[],
    (matches ?? []) as LabelMatch[],
    puntosDeFase,
  );
  if (!updates.length) return { ok: true, enabled: true, changed: 0 };

  const partDe = new Map((parts ?? []).map((p) => [p.club_id as string, p]));
  let changed = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from('matches')
      .update({
        home_club_id: u.home_club_id,
        away_club_id: u.away_club_id,
        home_season_entry_id: u.home_club_id ? partDe.get(u.home_club_id)?.season_entry_id ?? null : null,
        away_season_entry_id: u.away_club_id ? partDe.get(u.away_club_id)?.season_entry_id ?? null : null,
        is_visible: u.is_visible,
      })
      .eq('id', u.id)
      .eq('status', 'scheduled');
    if (error) return { ok: false, enabled: true, changed, error: error.message };
    changed += 1;

    // El club queda inscripto en la fase (y en el grupo) de destino, para que la
    // tabla del triangular lo cuente.
    for (const club of [u.home_club_id, u.away_club_id]) {
      const pid = club ? partDe.get(club)?.id : null;
      if (!pid || !u.phase_id) continue;
      const { data: ya } = await supabase
        .from('tournament_phase_participants')
        .select('id')
        .eq('phase_id', u.phase_id)
        .eq('participant_id', pid)
        .limit(1);
      if (ya?.length) continue;
      await supabase.from('tournament_phase_participants').insert([
        {
          tournament_id: tournamentId,
          season_id: seasonId,
          phase_id: u.phase_id,
          participant_id: pid,
          status: 'active',
          ...(u.group_id ? { group_id: u.group_id } : {}),
        },
      ]);
    }
  }

  // Fase activa = la primera (por orden) que todavía tiene partidos por jugar.
  const { data: ms2 } = await supabase.from('matches').select('phase_id, status').eq('season_id', seasonId);
  const ordenadas = [...(phases ?? [])].sort((a, b) => num(a.order_index) - num(b.order_index));
  const activa = ordenadas.find((f) => (ms2 ?? []).some((m) => m.phase_id === f.id && m.status !== 'final'));
  if (activa && !activa.is_active) {
    await supabase.from('tournament_phases').update({ is_active: false }).eq('season_id', seasonId).neq('id', activa.id);
    await supabase.from('tournament_phases').update({ is_active: true }).eq('id', activa.id);
  }
  return { ok: true, enabled: true, changed };
}
