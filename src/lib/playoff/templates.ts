/**
 * Playoff bracket templates.
 *
 * A template is a pure, abstract description of a multi-cup elimination
 * bracket: which cups exist, which rounds each cup has, every match, and
 * the winner/loser advancement edges between matches. It contains no
 * database ids — `playoffBracket.ts` persists a template into real
 * tournament_groups / tournament_rounds / matches / advancement_rules rows.
 *
 * MVP scope (agreed): template-based generation.
 *   - single_elimination            (any power of two, 2..64)
 *   - oro_plata                     (power of two 4..64; R1 losers -> Plata)
 *   - oro_plata_bronce_estimulo     (exactly 16 teams; the spec example)
 *   - custom                        (dynamic builder — next iteration)
 */

export type SlotSourceType = 'seed' | 'winner' | 'loser';

/** Where a match slot's participant comes from. */
export interface SlotSource {
  type: SlotSourceType;
  /** seed number (1-based) when type === 'seed', else source match code. */
  ref: number | string;
}

export interface TemplateCup {
  /** stable key inside the template, e.g. 'oro'. */
  key: string;
  /** default, user-renameable display name, e.g. 'Copa Oro'. */
  defaultName: string;
  /** lower = higher priority (Oro=0, Plata=1, …). */
  orderIndex: number;
}

export interface TemplateRound {
  key: string;
  /** null for the shared qualifier round (no cup yet). */
  cupKey: string | null;
  /** stage label, e.g. 'Cuartos de final'. */
  stageName: string;
  /** global display order across the whole phase. */
  orderIndex: number;
}

export interface TemplateMatch {
  /** stable bracket code, unique within the template, e.g. 'ORO-SF-1'. */
  code: string;
  cupKey: string | null;
  roundKey: string;
  orderInRound: number;
  home: SlotSource;
  away: SlotSource;
}

export interface BracketTemplate {
  id: PlayoffTemplateId;
  label: string;
  cups: TemplateCup[];
  rounds: TemplateRound[];
  matches: TemplateMatch[];
  /** number of seeded teams the qualifier round consumes. */
  teamCount: number;
}

export type PlayoffTemplateId =
  | 'single_elimination'
  | 'oro_plata'
  | 'oro_plata_bronce_estimulo'
  | 'custom';

export interface PlayoffBuilderConfig {
  templateId: PlayoffTemplateId;
  teamCount: number;
  /** override cup display names by cup key, e.g. { oro: 'Copa Campeonato' }. */
  cupNames?: Record<string, string>;
  /** add a 3rd-place match in cups that support it (default true). */
  thirdPlace?: boolean;
  /**
   * How the initial-round crossings are formed:
   *  - 'seed'   -> by seed number (1 vs N, 2 vs N-1, …). Default.
   *  - 'random' -> teams paired at random (a fresh draw on each generate).
   */
  seedMode?: 'seed' | 'random';
  /** required when templateId === 'custom'. */
  customSpec?: CustomBracketSpec;
}

/** User-authored bracket structure for the dynamic ('custom') builder. */
export interface CustomBracketSpec {
  /** display order = array order; orderIndex 0 = highest priority. */
  cups: Array<{ key: string; name: string }>;
  rounds: Array<{
    key: string;
    /** null = shared qualifier round (no cup yet). */
    cupKey: string | null;
    name: string;
    matches: Array<{
      code: string;
      home: SlotSource;
      away: SlotSource;
    }>;
  }>;
}

export interface PlayoffTemplateMeta {
  id: PlayoffTemplateId;
  label: string;
  description: string;
  /** allowed team counts; empty = any power of two. */
  teamCounts: number[];
  defaultTeamCount: number;
  available: boolean;
}

// ─── helpers ────────────────────────────────────────────────────────────

const isPowerOfTwo = (n: number) => n >= 2 && (n & (n - 1)) === 0;

/** Standard bracket seeding order for `slots` (power of two) positions. */
function standardSeedOrder(slots: number): number[] {
  let order = [1, 2];
  while (order.length < slots) {
    const len = order.length * 2 + 1;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed);
      next.push(len - seed);
    }
    order = next;
  }
  return order;
}

/** Human stage label from the number of teams playing that round. */
function stageNameFor(teamsInRound: number): string {
  switch (teamsInRound) {
    case 2:
      return 'Final';
    case 4:
      return 'Semifinal';
    case 8:
      return 'Cuartos de final';
    case 16:
      return 'Octavos de final';
    case 32:
      return 'Dieciseisavos de final';
    case 64:
      return 'Treintaidosavos de final';
    default:
      return `Ronda de ${teamsInRound}`;
  }
}

const winner = (code: string): SlotSource => ({ type: 'winner', ref: code });
const loser = (code: string): SlotSource => ({ type: 'loser', ref: code });
const seed = (n: number): SlotSource => ({ type: 'seed', ref: n });

interface ChainResult {
  rounds: TemplateRound[];
  matches: TemplateMatch[];
  /** round-1 match codes, in order (their losers can feed a consolation cup). */
  firstRoundCodes: string[];
  /** semifinal match codes (their losers can feed a 3rd-place match). */
  semifinalCodes: string[];
  /** the final match code. */
  finalCode: string;
}

/**
 * Build a single-elimination chain for one cup.
 *
 * `slotSources` length must be a power of two and feeds round 1 in order
 * (pairs are consecutive). Winners advance internally. The caller decides
 * what to do with round-1 / quarter / semi losers (e.g. route to another
 * cup) via the returned codes.
 */
function buildEliminationChain(params: {
  cupKey: string | null;
  codePrefix: string;
  slotSources: SlotSource[];
  /** starting global order index for this cup's rounds. */
  baseOrderIndex: number;
  thirdPlace: boolean;
}): ChainResult {
  const { cupKey, codePrefix, slotSources, baseOrderIndex, thirdPlace } = params;
  const teamCount = slotSources.length;

  const rounds: TemplateRound[] = [];
  const matches: TemplateMatch[] = [];
  const firstRoundCodes: string[] = [];
  let semifinalCodes: string[] = [];
  let finalCode = '';

  let teamsInRound = teamCount;
  let roundIndex = 0;
  // codes produced by the previous round, paired up for the next round.
  let prevWinnerCodes: string[] = [];
  let currentSources: SlotSource[] = slotSources;
  let orderIndex = baseOrderIndex;

  while (teamsInRound >= 2) {
    const stage = stageNameFor(teamsInRound);
    const roundKey = `${codePrefix}-r${roundIndex + 1}`;
    rounds.push({
      key: roundKey,
      cupKey,
      stageName: stage,
      orderIndex: orderIndex++,
    });

    const matchesInRound = teamsInRound / 2;
    const roundCodes: string[] = [];

    for (let i = 0; i < matchesInRound; i++) {
      const code =
        matchesInRound === 1
          ? `${codePrefix}-F`
          : `${codePrefix}-${shortStage(teamsInRound)}-${i + 1}`;
      const homeSrc =
        roundIndex === 0 ? currentSources[i * 2] : winner(prevWinnerCodes[i * 2]);
      const awaySrc =
        roundIndex === 0 ? currentSources[i * 2 + 1] : winner(prevWinnerCodes[i * 2 + 1]);

      matches.push({
        code,
        cupKey,
        roundKey,
        orderInRound: i + 1,
        home: homeSrc,
        away: awaySrc,
      });
      roundCodes.push(code);
      if (roundIndex === 0) firstRoundCodes.push(code);
    }

    if (teamsInRound === 4) semifinalCodes = [...roundCodes];
    if (teamsInRound === 2) finalCode = roundCodes[0];

    prevWinnerCodes = roundCodes;
    currentSources = [];
    teamsInRound = teamsInRound / 2;
    roundIndex += 1;
  }

  // Optional 3rd-place match (losers of the two semifinals).
  if (thirdPlace && semifinalCodes.length === 2) {
    const roundKey = `${codePrefix}-3p`;
    rounds.push({
      key: roundKey,
      cupKey,
      stageName: '3.º y 4.º puesto',
      orderIndex: orderIndex++,
    });
    matches.push({
      code: `${codePrefix}-3P`,
      cupKey,
      roundKey,
      orderInRound: 1,
      home: loser(semifinalCodes[0]),
      away: loser(semifinalCodes[1]),
    });
  }

  return { rounds, matches, firstRoundCodes, semifinalCodes, finalCode };
}

function shortStage(teamsInRound: number): string {
  switch (teamsInRound) {
    case 4:
      return 'SF';
    case 8:
      return 'QF';
    case 16:
      return 'R16';
    case 32:
      return 'R32';
    case 64:
      return 'R64';
    default:
      return `R${teamsInRound}`;
  }
}

// ─── template builders ──────────────────────────────────────────────────

function buildSingleElimination(config: PlayoffBuilderConfig): BracketTemplate {
  const { teamCount } = config;
  if (!isPowerOfTwo(teamCount) || teamCount < 2 || teamCount > 64) {
    throw new PlayoffTemplateError(
      'La eliminación simple requiere una cantidad de equipos potencia de 2 (2, 4, 8, 16, 32, 64).',
    );
  }

  const cupName = config.cupNames?.main ?? 'Copa';
  const order = standardSeedOrder(teamCount);
  const slotSources = order.map((s) => seed(s));

  const chain = buildEliminationChain({
    cupKey: 'main',
    codePrefix: 'M',
    slotSources,
    baseOrderIndex: 0,
    thirdPlace: config.thirdPlace ?? false,
  });

  return {
    id: 'single_elimination',
    label: 'Eliminación simple',
    teamCount,
    cups: [{ key: 'main', defaultName: cupName, orderIndex: 0 }],
    rounds: chain.rounds,
    matches: chain.matches,
  };
}

function buildOroPlata(config: PlayoffBuilderConfig): BracketTemplate {
  const { teamCount } = config;
  if (!isPowerOfTwo(teamCount) || teamCount < 4 || teamCount > 64) {
    throw new PlayoffTemplateError(
      'El playoff Oro/Plata requiere una cantidad de equipos potencia de 2 (4, 8, 16, 32, 64).',
    );
  }

  const oroName = config.cupNames?.oro ?? 'Copa Oro';
  const plataName = config.cupNames?.plata ?? 'Copa Plata';
  const thirdPlace = config.thirdPlace ?? true;

  // Shared qualifier round (group = null): winners -> Oro, losers -> Plata.
  const order = standardSeedOrder(teamCount);
  const qualifierMatches: TemplateMatch[] = [];
  const qualifierRoundKey = 'Q-r1';
  const qualifierRounds: TemplateRound[] = [
    { key: qualifierRoundKey, cupKey: null, stageName: stageNameFor(teamCount), orderIndex: 0 },
  ];
  const half = teamCount / 2;
  for (let i = 0; i < half; i++) {
    qualifierMatches.push({
      code: `Q-${i + 1}`,
      cupKey: null,
      roundKey: qualifierRoundKey,
      orderInRound: i + 1,
      home: seed(order[i * 2]),
      away: seed(order[i * 2 + 1]),
    });
  }

  // Oro: single elim among the `half` qualifier winners.
  const oro = buildEliminationChain({
    cupKey: 'oro',
    codePrefix: 'ORO',
    slotSources: qualifierMatches.map((m) => winner(m.code)),
    baseOrderIndex: 1,
    thirdPlace,
  });

  // Plata: consolation single elim among the `half` qualifier losers.
  const plata = buildEliminationChain({
    cupKey: 'plata',
    codePrefix: 'PLA',
    slotSources: qualifierMatches.map((m) => loser(m.code)),
    baseOrderIndex: 1 + oro.rounds.length,
    thirdPlace,
  });

  return {
    id: 'oro_plata',
    label: 'Playoff con Copa Oro / Plata',
    teamCount,
    cups: [
      { key: 'oro', defaultName: oroName, orderIndex: 0 },
      { key: 'plata', defaultName: plataName, orderIndex: 1 },
    ],
    rounds: [...qualifierRounds, ...oro.rounds, ...plata.rounds],
    matches: [...qualifierMatches, ...oro.matches, ...plata.matches],
  };
}

/**
 * 16 teams, 4 cups — the exact structure from the spec:
 *   Octavos -> winners Copa Oro / losers Copa Bronce
 *   Cuartos Oro -> winners Semi Oro / losers Semi Plata
 *   Cuartos Bronce -> winners Semi Bronce / losers Semi Estímulo
 *   each cup: Semi -> Final + 3.º/4.º puesto
 */
function buildOroPlataBronceEstimulo(config: PlayoffBuilderConfig): BracketTemplate {
  if (config.teamCount !== 16) {
    throw new PlayoffTemplateError(
      'La plantilla de 4 copas (Oro/Plata/Bronce/Estímulo) está disponible para exactamente 16 equipos en esta versión.',
    );
  }

  const names = {
    oro: config.cupNames?.oro ?? 'Copa Oro',
    plata: config.cupNames?.plata ?? 'Copa Plata',
    bronce: config.cupNames?.bronce ?? 'Copa Bronce',
    estimulo: config.cupNames?.estimulo ?? 'Copa Estímulo',
  };

  const cups: TemplateCup[] = [
    { key: 'oro', defaultName: names.oro, orderIndex: 0 },
    { key: 'plata', defaultName: names.plata, orderIndex: 1 },
    { key: 'bronce', defaultName: names.bronce, orderIndex: 2 },
    { key: 'estimulo', defaultName: names.estimulo, orderIndex: 3 },
  ];

  const rounds: TemplateRound[] = [];
  const matches: TemplateMatch[] = [];
  let order = 0;

  // Octavos (shared qualifier, no cup).
  const seedOrder = standardSeedOrder(16);
  rounds.push({ key: 'OCT', cupKey: null, stageName: 'Octavos de final', orderIndex: order++ });
  for (let i = 0; i < 8; i++) {
    matches.push({
      code: `OCT-${i + 1}`,
      cupKey: null,
      roundKey: 'OCT',
      orderInRound: i + 1,
      home: seed(seedOrder[i * 2]),
      away: seed(seedOrder[i * 2 + 1]),
    });
  }

  // Copa Oro: Cuartos (winners of octavos) -> Semi -> Final + 3P.
  rounds.push({ key: 'ORO-QF', cupKey: 'oro', stageName: 'Cuartos de final', orderIndex: order++ });
  rounds.push({ key: 'ORO-SF', cupKey: 'oro', stageName: 'Semifinal', orderIndex: order++ });
  rounds.push({ key: 'ORO-F', cupKey: 'oro', stageName: 'Final', orderIndex: order++ });
  rounds.push({ key: 'ORO-3P', cupKey: 'oro', stageName: '3.º y 4.º puesto', orderIndex: order++ });
  for (let i = 0; i < 4; i++) {
    matches.push({
      code: `ORO-QF-${i + 1}`,
      cupKey: 'oro',
      roundKey: 'ORO-QF',
      orderInRound: i + 1,
      home: winner(`OCT-${i * 2 + 1}`),
      away: winner(`OCT-${i * 2 + 2}`),
    });
  }
  matches.push({
    code: 'ORO-SF-1', cupKey: 'oro', roundKey: 'ORO-SF', orderInRound: 1,
    home: winner('ORO-QF-1'), away: winner('ORO-QF-2'),
  });
  matches.push({
    code: 'ORO-SF-2', cupKey: 'oro', roundKey: 'ORO-SF', orderInRound: 2,
    home: winner('ORO-QF-3'), away: winner('ORO-QF-4'),
  });
  matches.push({
    code: 'ORO-F', cupKey: 'oro', roundKey: 'ORO-F', orderInRound: 1,
    home: winner('ORO-SF-1'), away: winner('ORO-SF-2'),
  });
  matches.push({
    code: 'ORO-3P', cupKey: 'oro', roundKey: 'ORO-3P', orderInRound: 1,
    home: loser('ORO-SF-1'), away: loser('ORO-SF-2'),
  });

  // Copa Plata: losers of Cuartos Oro -> Semi -> Final + 3P.
  rounds.push({ key: 'PLA-SF', cupKey: 'plata', stageName: 'Semifinal', orderIndex: order++ });
  rounds.push({ key: 'PLA-F', cupKey: 'plata', stageName: 'Final', orderIndex: order++ });
  rounds.push({ key: 'PLA-3P', cupKey: 'plata', stageName: '3.º y 4.º puesto', orderIndex: order++ });
  matches.push({
    code: 'PLA-SF-1', cupKey: 'plata', roundKey: 'PLA-SF', orderInRound: 1,
    home: loser('ORO-QF-1'), away: loser('ORO-QF-2'),
  });
  matches.push({
    code: 'PLA-SF-2', cupKey: 'plata', roundKey: 'PLA-SF', orderInRound: 2,
    home: loser('ORO-QF-3'), away: loser('ORO-QF-4'),
  });
  matches.push({
    code: 'PLA-F', cupKey: 'plata', roundKey: 'PLA-F', orderInRound: 1,
    home: winner('PLA-SF-1'), away: winner('PLA-SF-2'),
  });
  matches.push({
    code: 'PLA-3P', cupKey: 'plata', roundKey: 'PLA-3P', orderInRound: 1,
    home: loser('PLA-SF-1'), away: loser('PLA-SF-2'),
  });

  // Copa Bronce: losers of Octavos -> Cuartos -> Semi -> Final + 3P.
  rounds.push({ key: 'BRO-QF', cupKey: 'bronce', stageName: 'Cuartos de final', orderIndex: order++ });
  rounds.push({ key: 'BRO-SF', cupKey: 'bronce', stageName: 'Semifinal', orderIndex: order++ });
  rounds.push({ key: 'BRO-F', cupKey: 'bronce', stageName: 'Final', orderIndex: order++ });
  rounds.push({ key: 'BRO-3P', cupKey: 'bronce', stageName: '3.º y 4.º puesto', orderIndex: order++ });
  for (let i = 0; i < 4; i++) {
    matches.push({
      code: `BRO-QF-${i + 1}`,
      cupKey: 'bronce',
      roundKey: 'BRO-QF',
      orderInRound: i + 1,
      home: loser(`OCT-${i * 2 + 1}`),
      away: loser(`OCT-${i * 2 + 2}`),
    });
  }
  matches.push({
    code: 'BRO-SF-1', cupKey: 'bronce', roundKey: 'BRO-SF', orderInRound: 1,
    home: winner('BRO-QF-1'), away: winner('BRO-QF-2'),
  });
  matches.push({
    code: 'BRO-SF-2', cupKey: 'bronce', roundKey: 'BRO-SF', orderInRound: 2,
    home: winner('BRO-QF-3'), away: winner('BRO-QF-4'),
  });
  matches.push({
    code: 'BRO-F', cupKey: 'bronce', roundKey: 'BRO-F', orderInRound: 1,
    home: winner('BRO-SF-1'), away: winner('BRO-SF-2'),
  });
  matches.push({
    code: 'BRO-3P', cupKey: 'bronce', roundKey: 'BRO-3P', orderInRound: 1,
    home: loser('BRO-SF-1'), away: loser('BRO-SF-2'),
  });

  // Copa Estímulo: losers of Cuartos Bronce -> Semi -> Final + 3P.
  rounds.push({ key: 'EST-SF', cupKey: 'estimulo', stageName: 'Semifinal', orderIndex: order++ });
  rounds.push({ key: 'EST-F', cupKey: 'estimulo', stageName: 'Final', orderIndex: order++ });
  rounds.push({ key: 'EST-3P', cupKey: 'estimulo', stageName: '3.º y 4.º puesto', orderIndex: order++ });
  matches.push({
    code: 'EST-SF-1', cupKey: 'estimulo', roundKey: 'EST-SF', orderInRound: 1,
    home: loser('BRO-QF-1'), away: loser('BRO-QF-2'),
  });
  matches.push({
    code: 'EST-SF-2', cupKey: 'estimulo', roundKey: 'EST-SF', orderInRound: 2,
    home: loser('BRO-QF-3'), away: loser('BRO-QF-4'),
  });
  matches.push({
    code: 'EST-F', cupKey: 'estimulo', roundKey: 'EST-F', orderInRound: 1,
    home: winner('EST-SF-1'), away: winner('EST-SF-2'),
  });
  matches.push({
    code: 'EST-3P', cupKey: 'estimulo', roundKey: 'EST-3P', orderInRound: 1,
    home: loser('EST-SF-1'), away: loser('EST-SF-2'),
  });

  return {
    id: 'oro_plata_bronce_estimulo',
    label: 'Playoff con Oro / Plata / Bronce / Estímulo',
    teamCount: 16,
    cups,
    rounds,
    matches,
  };
}

// ─── public API ─────────────────────────────────────────────────────────

export class PlayoffTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayoffTemplateError';
  }
}

export function listPlayoffTemplates(): PlayoffTemplateMeta[] {
  return [
    {
      id: 'single_elimination',
      label: 'Eliminación simple',
      description: 'Una sola copa. El ganador avanza, el perdedor queda eliminado.',
      teamCounts: [2, 4, 8, 16, 32, 64],
      defaultTeamCount: 16,
      available: true,
    },
    {
      id: 'oro_plata',
      label: 'Playoff con Copa Oro / Plata',
      description: 'Ganadores de la 1.ª ronda → Copa Oro. Perdedores → Copa Plata.',
      teamCounts: [4, 8, 16, 32, 64],
      defaultTeamCount: 16,
      available: true,
    },
    {
      id: 'oro_plata_bronce_estimulo',
      label: 'Playoff con Oro / Plata / Bronce / Estímulo',
      description:
        '16 equipos. Ganadores → Oro/Bronce; perdedores → Plata/Estímulo. Con finales y 3.º puesto.',
      teamCounts: [16],
      defaultTeamCount: 16,
      available: true,
    },
    {
      id: 'custom',
      label: 'Estructura personalizada',
      description: 'Definí copas, rondas y reglas de avance a mano (ganador/perdedor de cada partido).',
      teamCounts: [],
      defaultTeamCount: 16,
      available: true,
    },
  ];
}

/**
 * Build a BracketTemplate from a user-authored spec. Validates structure
 * and the advancement graph (every winner/loser ref must point to a match
 * in an earlier round, guaranteeing an acyclic, resolvable bracket).
 */
export function buildCustomTemplate(spec: CustomBracketSpec | undefined): BracketTemplate {
  if (!spec || !Array.isArray(spec.rounds) || spec.rounds.length === 0) {
    throw new PlayoffTemplateError('Definí al menos una ronda con partidos.');
  }

  // Cups
  const cups: TemplateCup[] = [];
  const cupKeys = new Set<string>();
  (spec.cups ?? []).forEach((c, idx) => {
    const key = String(c.key ?? '').trim();
    if (!key) throw new PlayoffTemplateError('Cada copa necesita una clave.');
    if (cupKeys.has(key)) throw new PlayoffTemplateError(`Clave de copa duplicada: ${key}`);
    cupKeys.add(key);
    cups.push({
      key,
      defaultName: String(c.name ?? '').trim() || key,
      orderIndex: idx,
    });
  });

  // Rounds + matches
  const rounds: TemplateRound[] = [];
  const matches: TemplateMatch[] = [];
  const roundKeys = new Set<string>();
  const codeToRoundIndex = new Map<string, number>();
  const allCodes = new Set<string>();

  spec.rounds.forEach((r, rIdx) => {
    const rKey = String(r.key ?? '').trim() || `round_${rIdx + 1}`;
    if (roundKeys.has(rKey)) throw new PlayoffTemplateError(`Clave de ronda duplicada: ${rKey}`);
    roundKeys.add(rKey);

    const cupKey = r.cupKey ? String(r.cupKey).trim() : null;
    if (cupKey && !cupKeys.has(cupKey)) {
      throw new PlayoffTemplateError(`La ronda "${r.name || rKey}" referencia una copa inexistente: ${cupKey}`);
    }
    if (!Array.isArray(r.matches) || r.matches.length === 0) {
      throw new PlayoffTemplateError(`La ronda "${r.name || rKey}" no tiene partidos.`);
    }

    rounds.push({
      key: rKey,
      cupKey,
      stageName: String(r.name ?? '').trim() || `Ronda ${rIdx + 1}`,
      orderIndex: rIdx,
    });

    r.matches.forEach((m, mIdx) => {
      const code = String(m.code ?? '').trim();
      if (!code) throw new PlayoffTemplateError('Cada partido necesita un código único.');
      if (allCodes.has(code)) throw new PlayoffTemplateError(`Código de partido duplicado: ${code}`);
      allCodes.add(code);
      codeToRoundIndex.set(code, rIdx);
      matches.push({
        code,
        cupKey,
        roundKey: rKey,
        orderInRound: mIdx + 1,
        home: normalizeSlot(m.home),
        away: normalizeSlot(m.away),
      });
    });
  });

  // Validate the advancement graph: a winner/loser ref must resolve to a
  // match in a strictly earlier round (acyclic + resolvable before use).
  for (const m of matches) {
    const targetRoundIdx = codeToRoundIndex.get(m.code)!;
    for (const slot of [m.home, m.away]) {
      if (slot.type === 'seed') {
        if (!Number.isFinite(Number(slot.ref)) || Number(slot.ref) < 1) {
          throw new PlayoffTemplateError(`Sembrado inválido en el partido ${m.code}.`);
        }
        continue;
      }
      const ref = String(slot.ref);
      if (!allCodes.has(ref)) {
        throw new PlayoffTemplateError(
          `El partido ${m.code} referencia un partido inexistente: ${ref}`,
        );
      }
      const sourceRoundIdx = codeToRoundIndex.get(ref)!;
      if (sourceRoundIdx >= targetRoundIdx) {
        throw new PlayoffTemplateError(
          `El partido ${m.code} toma a ${slot.type === 'winner' ? 'ganador' : 'perdedor'} de ${ref}, ` +
            'que debe estar en una ronda anterior.',
        );
      }
    }
  }

  const seedRefs = matches
    .flatMap((m) => [m.home, m.away])
    .filter((s) => s.type === 'seed')
    .map((s) => Number(s.ref));
  const teamCount = seedRefs.length ? Math.max(...seedRefs) : 0;

  return {
    id: 'custom',
    label: 'Estructura personalizada',
    teamCount,
    cups,
    rounds,
    matches,
  };
}

function normalizeSlot(slot: unknown): SlotSource {
  const s = slot && typeof slot === 'object' ? (slot as Record<string, unknown>) : {};
  const type = String(s.type ?? '');
  if (type === 'winner' || type === 'loser') {
    return { type, ref: String(s.ref ?? '').trim() };
  }
  // default to seed
  const n = Number(s.ref ?? 0);
  return { type: 'seed', ref: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 };
}

/** Build the concrete (still db-less) bracket spec for a config. */
export function buildBracketTemplate(config: PlayoffBuilderConfig): BracketTemplate {
  switch (config.templateId) {
    case 'single_elimination':
      return buildSingleElimination(config);
    case 'oro_plata':
      return buildOroPlata(config);
    case 'oro_plata_bronce_estimulo':
      return buildOroPlataBronceEstimulo(config);
    case 'custom':
      return buildCustomTemplate(config.customSpec);
    default:
      throw new PlayoffTemplateError(`Plantilla de playoff desconocida: ${config.templateId}`);
  }
}

/** Map a cup key to its resolved (possibly renamed) display name. */
export function resolveCupName(
  template: BracketTemplate,
  cupKey: string,
  cupNames?: Record<string, string>,
): string {
  const override = cupNames?.[cupKey];
  if (override && override.trim()) return override.trim();
  return template.cups.find((c) => c.key === cupKey)?.defaultName ?? cupKey;
}
