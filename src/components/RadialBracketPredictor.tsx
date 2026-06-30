'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './RadialBracketPredictor.module.css';

// ── Social proof GLOBAL: contador de exportes + votos de campeón ──────────────
// El estado vive en la DB (vía /api/predictor/stats) y es compartido por todos los
// usuarios. Los seeds son solo el fallback/piso inicial mientras carga o si la
// migración aún no se aplicó.
const SEED_BRACKETS_EXPORTED = 127;
const SEED_CHAMPION_VOTES: Array<{ name: string; count: number }> = [
    { name: 'Argentina', count: 40 },
    { name: 'España', count: 36 },
    { name: 'Francia', count: 30 },
    { name: 'Portugal', count: 20 },
    { name: 'Brasil', count: 1 },
];

type ChampionVote = { name: string; count: number };

function normalizeChampionKey(name: string) {
    return name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

function seedChampionList(): ChampionVote[] {
    return [...SEED_CHAMPION_VOTES].sort((a, b) => b.count - a.count);
}

// Sanitiza la respuesta del API a {name, count} válidos.
function normalizeChampionList(raw: unknown): ChampionVote[] {
    if (!Array.isArray(raw)) return seedChampionList();
    const list = raw
        .map((item) => ({
            name: String((item as { name?: unknown })?.name ?? '').trim(),
            count: Number((item as { count?: unknown })?.count) || 0,
        }))
        .filter((item) => item.name);
    return list.length ? list : seedChampionList();
}

// ── Types ──────────────────────────────────────────────────────────────────

interface BracketTeam {
    id: string;
    name: string;
    logo: string;
}

interface PredictorRoundLike {
    name?: string;
    matches?: any[];
}

interface RadialBracketPredictorProps {
    rounds: PredictorRoundLike[];
    title?: string;
    logo?: string;
    onClose: () => void;
}

interface BNode {
    id: string;
    kind: 'leaf' | 'match';
    team: BracketTeam | null; // leaf only
    children: BNode[]; // match only
    parent: BNode | null;
    level: number;
    angle: number; // degrees
    radius: number;
    x: number;
    y: number;
}

// ── Data extraction ────────────────────────────────────────────────────────

function extractTeam(
    side: { id?: string | number; name?: string; logo?: string } | null | undefined,
    participant: { participant_id?: string | number; participant_name?: string; image_path?: string } | null | undefined,
): BracketTeam | null {
    const name = participant?.participant_name || side?.name || '';
    if (!name || /^tbd$/i.test(name.trim())) return null;
    const logo = participant?.image_path || side?.logo || '';
    const id = String(participant?.participant_id ?? side?.id ?? name);
    return { id, name, logo };
}

const VIEW = 1000;
const CENTER = VIEW / 2;
const OUTER_RADIUS = 432;
const ARC_HALF = 78; // half-span in degrees for each side
const TEAM_RADIUS = 31; // uniform size for every crest, on every round
const CUP_RADIUS = 42;

function deg2rad(deg: number) {
    return (deg * Math.PI) / 180;
}

function polar(radius: number, angleDeg: number) {
    return {
        x: CENTER + radius * Math.cos(deg2rad(angleDeg)),
        y: CENTER + radius * Math.sin(deg2rad(angleDeg)),
    };
}

function makeBNode(id: string, kind: 'leaf' | 'match', team: BracketTeam | null): BNode {
    return { id, kind, team, children: [], parent: null, level: 0, angle: 0, radius: 0, x: 0, y: 0 };
}

const PLACEHOLDER_NAME_RE = /\b(winner|2nd place|3rd place|runner[- ]?up|loser|tbd)\b/i;

// Real bracket structure from the server linkage (matchNumber-derived slot + the
// "Round of X N Winner" feeder refs). Returns null when that metadata is absent so
// the caller can fall back to adjacency pairing.
function buildFeederStructure(rounds: PredictorRoundLike[]): { root: BNode; nodes: BNode[]; matchByNode: Map<string, any> } | null {
    const bySlot = new Map<string, any>();
    const byRound = new Map<string, any[]>();
    const roundOrder: string[] = [];
    const seenRound = new Set<string>();
    let haveLinkage = false;

    for (const r of rounds) {
        for (const m of (r?.matches ?? [])) {
            const rk = m?.round_key;
            const slot = m?.slot;
            if (!rk || slot == null) continue;
            bySlot.set(`${rk}#${slot}`, m);
            if (!byRound.has(rk)) byRound.set(rk, []);
            byRound.get(rk)!.push(m);
            if (!seenRound.has(rk)) { seenRound.add(rk); roundOrder.push(rk); }
            if (m.home_source || m.away_source) haveLinkage = true;
        }
    }
    if (!haveLinkage) return null;

    // roundOrder is outer → inner (first round first), so "below" = toward the leaves.
    const roundIdx = new Map(roundOrder.map((rk, i) => [rk, i]));
    const roundBelow = (rk: string): string | null => {
        const i = roundIdx.get(rk);
        return i != null && i > 0 ? roundOrder[i - 1] : null;
    };

    const finalMatch =
        [...roundOrder].reverse().map((rk) => (!/third/i.test(rk) && rk.toLowerCase() === 'final' ? (byRound.get(rk) || [])[0] : null)).find(Boolean) ||
        [...roundOrder].reverse().map((rk) => (!/third/i.test(rk) && (byRound.get(rk) || []).length === 1 ? byRound.get(rk)![0] : null)).find(Boolean) ||
        null;
    if (!finalMatch) return null;

    let counter = 0;
    const nextId = () => `n${counter++}`;
    const nodes: BNode[] = [];
    const makeLeaf = (team: BracketTeam | null): BNode => {
        const node = makeBNode(nextId(), 'leaf', team);
        nodes.push(node);
        return node;
    };

    const nameKey = (s: any) => String(s ?? '').trim().toLowerCase();
    const realTeamOf = (m: any, side: 'home' | 'away'): BracketTeam | null => {
        const team = extractTeam(m?.[`${side}_team`] ?? null, m?.[`${side}_participant`] ?? null);
        return team && !PLACEHOLDER_NAME_RE.test(team.name) ? team : null;
    };
    const findChildByTeam = (childRoundKey: string, teamName: string): any =>
        (byRound.get(childRoundKey) || []).find(
            (m) => nameKey(m.home_team_name) === nameKey(teamName) || nameKey(m.away_team_name) === nameKey(teamName),
        ) || null;

    const visiting = new Set<any>();
    const resolveSide = (match: any, side: 'home' | 'away'): BNode => {
        const src = match?.[`${side}_source`];
        if (src && src.round_key && src.slot != null) {
            const child = bySlot.get(`${src.round_key}#${src.slot}`);
            if (child && child !== match && !visiting.has(child)) return buildNode(child);
        }
        // A decided team is shown in place of its feeder ref — recurse into the match
        // it came from so the first round still forms the leaves.
        const team = realTeamOf(match, side);
        const below = roundBelow(match.round_key);
        if (team && below) {
            const child = findChildByTeam(below, team.name);
            if (child && child !== match && !visiting.has(child)) return buildNode(child);
        }
        return makeLeaf(team);
    };
    const matchByNode = new Map<string, any>();
    const buildNode = (match: any): BNode => {
        const node = makeBNode(nextId(), 'match', null);
        nodes.push(node);
        matchByNode.set(node.id, match);
        visiting.add(match);
        (['home', 'away'] as const).forEach((side) => {
            const child = resolveSide(match, side);
            node.children.push(child);
            child.parent = node;
        });
        visiting.delete(match);
        return node;
    };

    const root = buildNode(finalMatch);
    return { root, nodes, matchByNode };
}

// Fallback when there's no bracket linkage: pair the first round's matches by
// adjacency (does not reflect the real crossings, but keeps older data renderable).
function buildNaiveStructure(rounds: PredictorRoundLike[]): { root: BNode; nodes: BNode[] } | null {
    const firstRound = rounds.find((r) => Array.isArray(r?.matches) && r.matches!.length > 0);
    const matches = firstRound?.matches ?? [];
    if (matches.length === 0) return null;

    let counter = 0;
    const nextId = () => `n${counter++}`;
    const nodes: BNode[] = [];

    const makeLeaf = (team: BracketTeam | null): BNode => {
        const node = makeBNode(nextId(), 'leaf', team);
        nodes.push(node);
        return node;
    };
    const leavesFor = (slice: any[]): BNode[] =>
        slice.flatMap((m) => [
            makeLeaf(extractTeam(m?.home_team ?? null, m?.home_participant ?? null)),
            makeLeaf(extractTeam(m?.away_team ?? null, m?.away_participant ?? null)),
        ]);

    const pairUp = (subtrees: BNode[]): BNode => {
        if (subtrees.length === 1) return subtrees[0];
        const next: BNode[] = [];
        for (let i = 0; i < subtrees.length; i += 2) {
            if (i + 1 < subtrees.length) {
                const node = makeBNode(nextId(), 'match', null);
                node.children = [subtrees[i], subtrees[i + 1]];
                subtrees[i].parent = node;
                subtrees[i + 1].parent = node;
                nodes.push(node);
                next.push(node);
            } else {
                next.push(subtrees[i]); // odd one out gets a bye
            }
        }
        return pairUp(next);
    };

    const half = Math.ceil(matches.length / 2);
    const leftRoot = pairUp(leavesFor(matches.slice(0, half)));
    const rightLeaves = leavesFor(matches.slice(half));
    const rightRoot = rightLeaves.length > 0 ? pairUp(rightLeaves) : null;

    if (!rightRoot) return { root: leftRoot, nodes };

    const root = makeBNode(nextId(), 'match', null);
    root.children = [leftRoot, rightRoot];
    leftRoot.parent = root;
    rightRoot.parent = root;
    nodes.push(root);
    return { root, nodes };
}

// Even angular layout shared by both structure builders. Crests live on the outer
// ring, so the first round (the most teams) is the tightest: we spread the leaves
// evenly across each side's arc and size the crest so neighbours can never overlap.
function layoutRadialTree(root: BNode, nodes: BNode[]): { root: BNode; maxLevel: number; nodes: BNode[]; teamRadius: number } {
    const assignLevels = (node: BNode, level: number) => {
        node.level = level;
        node.children.forEach((c) => assignLevels(c, level + 1));
    };
    assignLevels(root, 0);
    const maxLevel = Math.max(1, ...nodes.map((n) => n.level));

    // The root's two children are the two halves of the bracket (left / right).
    const leftRoot = root.children[0] ?? root;
    const rightRoot = root.children[1] ?? null;

    const PAD_PX = 12; // minimum empty gap (in viewBox px) we want between two crests

    const orderedLeaves = (node: BNode): BNode[] =>
        node.kind === 'leaf' ? [node] : node.children.flatMap(orderedLeaves);

    const leftLeafCount = orderedLeaves(leftRoot).length;
    const rightLeafCount = rightRoot ? orderedLeaves(rightRoot).length : 0;
    const leavesPerSide = Math.max(1, leftLeafCount, rightLeafCount);

    // Adaptive crest radius: keep the default size unless a side is crowded enough
    // that it would overlap, in which case shrink to fit the even per-leaf step.
    const evenStepDeg = (2 * ARC_HALF) / leavesPerSide;
    const radiusFromStep = (OUTER_RADIUS * deg2rad(evenStepDeg) - PAD_PX) / 2;
    const teamRadius = Math.max(15, Math.min(TEAM_RADIUS, radiusFromStep));

    // Smallest angular separation (deg) that still keeps two crests from touching.
    const minSepDeg = ((2 * teamRadius + PAD_PX) / OUTER_RADIUS) * (180 / Math.PI);

    const placeSideLeaves = (sideRoot: BNode, startDeg: number, endDeg: number) => {
        const leaves = orderedLeaves(sideRoot);
        const n = leaves.length;
        if (n === 0) return;
        const step = (endDeg - startDeg) / n;
        // Pull each (home, away) pair together a touch, but never closer than minSep.
        const wantPairPull = step * 0.32;
        const maxPairPull = Math.max(0, (step - minSepDeg) / 2);
        const pull = Math.min(wantPairPull, maxPairPull);
        leaves.forEach((leaf, i) => {
            const slotCenter = startDeg + step * (i + 0.5);
            leaf.angle = slotCenter + (i % 2 === 0 ? pull : -pull);
        });
    };

    placeSideLeaves(leftRoot, 180 - ARC_HALF, 180 + ARC_HALF);
    if (rightRoot) placeSideLeaves(rightRoot, -ARC_HALF, ARC_HALF);

    // Inner (match) nodes follow the average of their children so the connectors
    // stay centred between the two crests they join.
    const setBranchAngle = (node: BNode): number => {
        if (node.kind === 'leaf') return node.angle;
        const childAngles = node.children.map(setBranchAngle);
        node.angle = childAngles.reduce((sum, a) => sum + a, 0) / childAngles.length;
        return node.angle;
    };
    setBranchAngle(leftRoot);
    if (rightRoot) setBranchAngle(rightRoot);
    root.angle = (leftRoot.angle + (rightRoot?.angle ?? leftRoot.angle)) / 2;

    // Radius from level, then cartesian position. Root sits at the exact center.
    nodes.forEach((node) => {
        node.radius = (node.level / maxLevel) * OUTER_RADIUS;
        node.x = CENTER + node.radius * Math.cos(deg2rad(node.angle));
        node.y = CENTER + node.radius * Math.sin(deg2rad(node.angle));
    });
    root.x = CENTER;
    root.y = CENTER;
    root.radius = 0;

    return { root, maxLevel, nodes, teamRadius };
}

function buildPredictorTree(rounds: PredictorRoundLike[]): {
    root: BNode | null;
    maxLevel: number;
    nodes: BNode[];
    teamRadius: number;
    seedWinners: Record<string, string>;
    lockedIds: Set<string>;
} {
    const feeder = buildFeederStructure(rounds);
    const built = feeder ?? buildNaiveStructure(rounds);
    if (!built) {
        return { root: null, maxLevel: 0, nodes: [], teamRadius: TEAM_RADIUS, seedWinners: {}, lockedIds: new Set() };
    }
    const laid = layoutRadialTree(built.root, built.nodes);
    const { seed, locked } = feeder
        ? computeSeedWinners(laid.nodes, feeder.matchByNode)
        : { seed: {} as Record<string, string>, locked: new Set<string>() };
    return { ...laid, seedWinners: seed, lockedIds: locked };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function teamAtNode(node: BNode, winners: Record<string, string>): BracketTeam | null {
    if (node.kind === 'leaf') return node.team;
    const chosenId = winners[node.id];
    if (!chosenId) return null;
    const child = node.children.find((c) => c.id === chosenId);
    return child ? teamAtNode(child, winners) : null;
}

function teamNameKey(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

// The winning team's name for a match that has already finished, else null.
function decidedWinnerName(match: any): string | null {
    const status = teamNameKey(match?.status ?? match?.match_status ?? match?.result);
    if (status !== 'final' && status !== 'finished' && status !== 'ft') return null;

    const homeName = match?.home_team?.name ?? match?.home_team_name ?? null;
    const awayName = match?.away_team?.name ?? match?.away_team_name ?? null;

    const winnerId = match?.winner_id;
    if (winnerId != null) {
        if (match?.home_team?.id != null && String(match.home_team.id) === String(winnerId)) return homeName;
        if (match?.away_team?.id != null && String(match.away_team.id) === String(winnerId)) return awayName;
    }

    const hs = Number(match?.score_home ?? match?.scores?.home);
    const as = Number(match?.score_away ?? match?.scores?.away);
    if (Number.isFinite(hs) && Number.isFinite(as)) {
        if (hs > as) return homeName;
        if (as > hs) return awayName;
        const ph = Number(match?.scores?.penalties?.home);
        const pa = Number(match?.scores?.penalties?.away);
        if (Number.isFinite(ph) && Number.isFinite(pa)) {
            if (ph > pa) return homeName;
            if (pa > ph) return awayName;
        }
    }
    return null;
}

// Pre-fill (and lock) the winners of matches already finished, so the bracket
// reflects real results as crossings complete. Processed bottom-up so each round's
// winners resolve before the round that depends on them.
function computeSeedWinners(
    nodes: BNode[],
    matchByNode: Map<string, any>,
): { seed: Record<string, string>; locked: Set<string> } {
    const seed: Record<string, string> = {};
    const locked = new Set<string>();
    const matchNodes = nodes.filter((n) => n.kind === 'match').sort((a, b) => b.level - a.level);
    for (const node of matchNodes) {
        const winnerName = decidedWinnerName(matchByNode.get(node.id));
        if (!winnerName) continue;
        const child = node.children.find((c) => {
            const team = teamAtNode(c, seed);
            return team && teamNameKey(team.name) === teamNameKey(winnerName);
        });
        if (child) {
            seed[node.id] = child.id;
            locked.add(node.id);
        }
    }
    return { seed, locked };
}

function getInitials(name: string) {
    const words = name.split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
}

// ── Share-image helpers (canvas render for a social-ready PNG) ───────────────

function loadImg(src?: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        if (!src) {
            resolve(null);
            return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

// Draw an image fitted (contain) into a 2r×2r box centred at (cx, cy).
function drawImageContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const scale = Math.min((2 * r) / iw, (2 * r) / ih);
    const w = iw * scale;
    const h = ih * scale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function RadialBracketPredictor({ rounds, title, logo, onClose }: RadialBracketPredictorProps) {
    const { root, nodes, teamRadius, seedWinners, lockedIds } = useMemo(() => buildPredictorTree(rounds), [rounds]);
    const [winners, setWinners] = useState<Record<string, string>>(seedWinners);

    // As real matches finish, fold the freshly-decided results into the picks (real
    // results win), while keeping the user's predictions for the undecided crossings.
    useEffect(() => {
        setWinners((prev) => ({ ...prev, ...seedWinners }));
    }, [seedWinners]);

    const champion = root ? teamAtNode(root, winners) : null;

    const handlePick = (node: BNode) => {
        const parent = node.parent;
        if (!parent) return; // champion node — nothing further to advance to
        if (lockedIds.has(parent.id)) return; // already settled by a real result
        setWinners((prev) => {
            const next = { ...prev };
            const wasChosen = next[parent.id] === node.id;
            // Clear this choice and every ancestor choice (downstream changed), but
            // never wipe a locked (real) result along the way.
            let walker: BNode | null = parent;
            while (walker) {
                if (!lockedIds.has(walker.id)) delete next[walker.id];
                walker = walker.parent;
            }
            if (!wasChosen) next[parent.id] = node.id; // toggle off when re-clicking
            return next;
        });
    };

    // Reset clears predictions but keeps the real, already-decided results.
    const reset = () => setWinners(seedWinners);

    // ── Social proof GLOBAL (compartido por todos los usuarios, vía /api/predictor/stats) ──
    const [bracketsExported, setBracketsExported] = useState<number>(SEED_BRACKETS_EXPORTED);
    const [championVotes, setChampionVotes] = useState<ChampionVote[]>(() => seedChampionList());

    // Lee el estado global al montar (contador + tabla de campeones más elegidos).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/predictor/stats', { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                if (typeof data?.bracketsExported === 'number') setBracketsExported(data.bracketsExported);
                if (Array.isArray(data?.champions)) setChampionVotes(normalizeChampionList(data.champions));
            } catch {
                /* sin red: dejamos los seeds */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Export exitoso: incrementa el contador GLOBAL y suma el voto del campeón actual.
    // Optimista en el cliente y luego reconcilia con la respuesta autoritativa.
    const registerBracketExport = (championName: string | null) => {
        setBracketsExported((prev) => prev + 1);
        (async () => {
            try {
                const res = await fetch('/api/predictor/stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ champion: championName }),
                });
                if (!res.ok) return;
                const data = await res.json();
                if (typeof data?.bracketsExported === 'number') setBracketsExported(data.bracketsExported);
                if (Array.isArray(data?.champions)) setChampionVotes(normalizeChampionList(data.champions));
            } catch {
                /* el incremento optimista ya se ve; el server reconcilia al recargar */
            }
        })();
    };

    // Tabla de campeones más elegidos (desc), con la elección actual resaltada.
    const championLeaderboard = useMemo(() => (
        [...championVotes]
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
            .slice(0, 8)
            .map((vote) => ({ ...vote, key: normalizeChampionKey(vote.name) }))
    ), [championVotes]);
    const currentChampionKey = champion ? normalizeChampionKey(champion.name) : null;

    const [shareNote, setShareNote] = useState('');
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const buildShareText = () => {
        const lines = [`🏆 Mi predicción — ${title || 'Cuadro'}`];
        if (root) {
            const finalists = root.children
                .map((c) => teamAtNode(c, winners)?.name)
                .filter(Boolean);
            if (finalists.length === 2) lines.push(`Final: ${finalists[0]} vs ${finalists[1]}`);
        }
        if (champion) lines.push(`Campeón: ${champion.name}`);
        return lines.join('\n');
    };
    // Render the whole prediction to a social-ready PNG (post or story) with the
    // G22 logo and the champion called out at the bottom.
    const buildShareImageBlob = async (shareFormat: 'post' | 'story'): Promise<Blob | null> => {
        if (!root) return null;
        const isStory = shareFormat === 'story';
        const W = 1080;
        const H = isStory ? 1920 : 1350;

        // Premium dark-framed poster: cool near-white sheet, navy bands, gold accents.
        const INK = '#0E1424';
        const INK_DEEP = '#070B16';
        const BODY = '#F3F4F7';
        const LINE = 'rgba(14,20,36,0.30)';
        const GOLD = '#E7B24A';
        const GOLD_DEEP = '#B9852A';
        const GREEN = '#13B981';
        const FAMILY = 'system-ui, "Segoe UI", sans-serif';

        const HEADER_H = isStory ? 250 : 190;
        const LOGO_BAND_H = isStory ? 150 : 118;
        const CHAMP_H = champion ? (isStory ? 230 : 200) : 60;
        const FOOTER_H = CHAMP_H + LOGO_BAND_H;
        const margin = 70;
        const availW = W - margin * 2;
        const availH = H - HEADER_H - FOOTER_H;
        const scale = Math.min(availW / VIEW, availH / VIEW);
        const drawnBR = VIEW * scale;
        const bracketLeft = (W - drawnBR) / 2;
        const bracketTop = HEADER_H + Math.max(0, (availH - drawnBR) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const fitFont = (text: string, maxW: number, weight: number, startPx: number) => {
            let px = startPx;
            ctx.font = `${weight} ${px}px ${FAMILY}`;
            while (px > 22 && ctx.measureText(text).width > maxW) {
                px -= 2;
                ctx.font = `${weight} ${px}px ${FAMILY}`;
            }
            return px;
        };
        const setTracking = (v: number) => {
            try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${v}px`; } catch { /* unsupported */ }
        };

        // Background: cool sheet + soft brand glow behind the bracket.
        ctx.fillStyle = BODY;
        ctx.fillRect(0, 0, W, H);
        const glowCx = W / 2;
        const glowCy = bracketTop + drawnBR / 2;
        const glow = ctx.createRadialGradient(glowCx, glowCy, 0, glowCx, glowCy, drawnBR * 0.6);
        glow.addColorStop(0, 'rgba(19,185,129,0.12)');
        glow.addColorStop(1, 'rgba(19,185,129,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, HEADER_H, W, availH);

        // Header band: title + call-to-action.
        const headGrad = ctx.createLinearGradient(0, 0, 0, HEADER_H);
        headGrad.addColorStop(0, INK);
        headGrad.addColorStop(1, INK_DEEP);
        ctx.fillStyle = headGrad;
        ctx.fillRect(0, 0, W, HEADER_H);
        ctx.fillStyle = GOLD;
        ctx.fillRect(0, HEADER_H - 4, W, 4);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const titleText = (title || 'Mi predicción').toUpperCase();
        const titlePx = fitFont(titleText, availW, 800, isStory ? 60 : 52);
        ctx.fillStyle = '#FFFFFF';
        setTracking(titlePx * 0.01);
        ctx.font = `800 ${titlePx}px ${FAMILY}`;
        ctx.fillText(titleText, W / 2, HEADER_H * 0.42);
        setTracking(0);

        const ctaText = 'ENTRA EN G22SCORES.COM Y ARMÁ TU BRACKET!';
        const ctaPx = fitFont(ctaText, availW, 700, isStory ? 26 : 24);
        ctx.fillStyle = GOLD;
        setTracking(1.5);
        ctx.font = `700 ${ctaPx}px ${FAMILY}`;
        ctx.fillText(ctaText, W / 2, HEADER_H * 0.72);
        setTracking(0);

        // Preload crests
        const [brandImg, cupImg, champImg] = await Promise.all([
            loadImg('/header-logo.png'),
            loadImg(logo),
            loadImg(champion?.logo),
        ]);
        const teamNodes = nodes.filter((n) => n !== root);
        const teamImgs = await Promise.all(teamNodes.map((n) => loadImg(teamAtNode(n, winners)?.logo)));

        // ── Bracket drawn in its native 0..VIEW space, scaled into place ──
        ctx.save();
        ctx.translate(bracketLeft, bracketTop);
        ctx.scale(scale, scale);

        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1.8 / scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        nodes
            .filter((n) => n.kind === 'match')
            .forEach((node) => {
                const c0 = node.children[0];
                const c1 = node.children[1];
                if (!c0 || !c1) return;
                const sameRadius = Math.abs(c0.radius - c1.radius) < 0.5;
                if (node === root || !sameRadius) {
                    ctx.beginPath();
                    ctx.moveTo(c0.x, c0.y);
                    ctx.lineTo(node.x, node.y);
                    ctx.moveTo(c1.x, c1.y);
                    ctx.lineTo(node.x, node.y);
                    ctx.stroke();
                    return;
                }
                ctx.beginPath();
                ctx.arc(CENTER, CENTER, c0.radius, deg2rad(c0.angle), deg2rad(c1.angle), c1.angle < c0.angle);
                ctx.stroke();
                const tap = polar(c0.radius, node.angle);
                ctx.beginPath();
                ctx.moveTo(tap.x, tap.y);
                ctx.lineTo(node.x, node.y);
                ctx.stroke();
            });

        teamNodes.forEach((node, i) => {
            const team = teamAtNode(node, winners);
            if (!team) {
                ctx.strokeStyle = LINE;
                ctx.lineWidth = 1.6 / scale;
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.kind === 'leaf' ? 6 : 5, 0, Math.PI * 2);
                ctx.stroke();
                return;
            }
            const isChampion = node.parent === root && winners[root.id] === node.id;
            const r = isChampion ? teamRadius + 3 : teamRadius;
            const img = teamImgs[i];
            if (img) {
                drawImageContain(ctx, img, node.x, node.y, r);
            } else {
                ctx.fillStyle = '#E6E8EE';
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = INK;
                ctx.font = `800 ${r * 0.82}px ${FAMILY}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(getInitials(team.name), node.x, node.y);
            }
            if (isChampion) {
                ctx.strokeStyle = GOLD;
                ctx.lineWidth = 4 / scale;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        // Centre = competition logo on a soft gold halo
        const halo = ctx.createRadialGradient(CENTER, CENTER, 0, CENTER, CENTER, CUP_RADIUS * 1.95);
        halo.addColorStop(0, 'rgba(231,178,74,0.30)');
        halo.addColorStop(1, 'rgba(231,178,74,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(CENTER, CENTER, CUP_RADIUS * 1.95, 0, Math.PI * 2);
        ctx.fill();
        if (cupImg) {
            drawImageContain(ctx, cupImg, CENTER, CENTER, CUP_RADIUS);
        } else {
            ctx.fillStyle = INK;
            ctx.font = '52px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🏆', CENTER, CENTER);
        }
        ctx.restore();

        // ── Champion call-out ──
        const footerTop = H - FOOTER_H;
        if (champion) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = GOLD_DEEP;
            setTracking(6);
            ctx.font = `800 ${isStory ? 30 : 26}px ${FAMILY}`;
            ctx.fillText('CAMPEÓN', W / 2, footerTop + (isStory ? 56 : 50));
            setTracking(0);

            const namePx = fitFont(champion.name, availW - 120, 800, isStory ? 50 : 44);
            ctx.font = `800 ${namePx}px ${FAMILY}`;
            const nameWidth = ctx.measureText(champion.name).width;
            const crestR = isStory ? 42 : 38;
            const gap = 20;
            const blockWidth = crestR * 2 + gap + nameWidth;
            const startX = W / 2 - blockWidth / 2;
            const rowY = footerTop + (isStory ? 140 : 128);
            if (champImg) {
                drawImageContain(ctx, champImg, startX + crestR, rowY, crestR);
            }
            ctx.fillStyle = INK;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(champion.name, startX + crestR * 2 + gap, rowY);
        }

        // ── Bottom band: G22 Scores logo ──
        const bandTop = H - LOGO_BAND_H;
        const footGrad = ctx.createLinearGradient(0, bandTop, 0, H);
        footGrad.addColorStop(0, INK);
        footGrad.addColorStop(1, INK_DEEP);
        ctx.fillStyle = footGrad;
        ctx.fillRect(0, bandTop, W, LOGO_BAND_H);
        ctx.fillStyle = GOLD;
        ctx.fillRect(0, bandTop, W, 3);
        if (brandImg) {
            const bh = isStory ? 56 : 50;
            const bw = (brandImg.naturalWidth / brandImg.naturalHeight) * bh || 150;
            ctx.drawImage(brandImg, W / 2 - bw / 2, bandTop + (LOGO_BAND_H - bh) / 2, bw, bh);
        } else {
            ctx.fillStyle = GREEN;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `800 30px ${FAMILY}`;
            ctx.fillText('G22 SCORES', W / 2, bandTop + LOGO_BAND_H / 2);
        }

        return await new Promise<Blob | null>((resolve) => {
            try {
                canvas.toBlob((b) => resolve(b), 'image/png');
            } catch {
                resolve(null);
            }
        });
    };

    const handleShare = async (shareFormat: 'post' | 'story') => {
        setShareMenuOpen(false);
        setShareNote('Generando…');
        let blob: Blob | null = null;
        try {
            blob = await buildShareImageBlob(shareFormat);
        } catch {
            blob = null;
        }

        if (blob) {
            // Export exitoso: sumamos al contador global y al voto del campeón.
            registerBracketExport(champion?.name ?? null);
            const file = new File([blob], `prediccion-g22-${shareFormat}.png`, { type: 'image/png' });
            const nav = navigator as Navigator & { canShare?: (data: any) => boolean };
            if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
                try {
                    await nav.share({ files: [file], title: title || 'Mi predicción', text: buildShareText() });
                    setShareNote('');
                } catch {
                    setShareNote('');
                }
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `prediccion-g22-${shareFormat}.png`;
            a.click();
            URL.revokeObjectURL(url);
            setShareNote('Descargada');
            window.setTimeout(() => setShareNote(''), 1800);
            return;
        }

        // Fallback: text share / copy if the image could not be generated.
        const text = buildShareText();
        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({ title: title || 'Predicción', text });
            } catch {
                /* dismissed */
            }
            setShareNote('');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setShareNote('¡Copiado!');
        } catch {
            setShareNote('No se pudo');
        }
        window.setTimeout(() => setShareNote(''), 1800);
    };

    const nodeVisualRadius = (_node: BNode) => teamRadius;

    return (
        <div className={styles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
            <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                <header className={styles.header}>
                    <div className={styles.headerText}>
                        <span className={styles.kicker}>Predictor</span>
                        <h2 className={styles.title}>{title || 'Cuadro interactivo'}</h2>
                    </div>
                    <div className={styles.headerActions}>
                        <button type="button" className={styles.resetBtn} onClick={reset}>
                            Reiniciar
                        </button>
                        <div className={styles.shareWrap}>
                            <button
                                type="button"
                                className={styles.shareBtn}
                                onClick={() => setShareMenuOpen((o) => !o)}
                            >
                                {shareNote || 'Compartir'}
                            </button>
                            {shareMenuOpen && (
                                <div className={styles.shareMenu}>
                                    <button type="button" onClick={() => handleShare('post')}>
                                        Post (cuadrado)
                                    </button>
                                    <button type="button" onClick={() => handleShare('story')}>
                                        Historia (vertical)
                                    </button>
                                </div>
                            )}
                        </div>
                        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
                            ×
                        </button>
                    </div>
                </header>

                <div className={styles.stage}>
                    {!root ? (
                        <p className={styles.empty}>No hay cruces cargados para predecir.</p>
                    ) : (
                        <svg className={styles.canvas} viewBox={`0 0 ${VIEW} ${VIEW}`} role="img">
                            {/* Connectors — circular arc joining each pair + a radial stub inward */}
                            <g className={styles.connectors}>
                                {nodes
                                    .filter((n) => n.kind === 'match')
                                    .map((node) => {
                                        const c0 = node.children[0];
                                        const c1 = node.children[1];
                                        if (!c0 || !c1) return null;
                                        // The final (root) splits left/right — keep its two
                                        // legs straight through the centerpiece.
                                        const sameRadius = Math.abs(c0.radius - c1.radius) < 0.5;
                                        if (node === root || !sameRadius) {
                                            return (
                                                <g key={`conn-${node.id}`}>
                                                    <line x1={c0.x} y1={c0.y} x2={node.x} y2={node.y} />
                                                    <line x1={c1.x} y1={c1.y} x2={node.x} y2={node.y} />
                                                </g>
                                            );
                                        }
                                        const rc = c0.radius;
                                        const a0 = c0.angle;
                                        const a1 = c1.angle;
                                        const largeArc = Math.abs(a1 - a0) > 180 ? 1 : 0;
                                        const sweep = a1 > a0 ? 1 : 0;
                                        const tap = polar(rc, node.angle);
                                        return (
                                            <g key={`conn-${node.id}`}>
                                                <path
                                                    d={`M ${c0.x} ${c0.y} A ${rc} ${rc} 0 ${largeArc} ${sweep} ${c1.x} ${c1.y}`}
                                                    fill="none"
                                                />
                                                <path d={`M ${tap.x} ${tap.y} L ${node.x} ${node.y}`} fill="none" />
                                            </g>
                                        );
                                    })}
                            </g>

                            {/* Center — tournament logo acts as the "cup"; gold ring once decided */}
                            <g className={styles.center}>
                                <CenterPiece logo={logo} decided={!!champion} />
                            </g>

                            {/* Nodes (skip root — rendered as champion above) */}
                            {nodes
                                .filter((n) => n !== root)
                                .map((node) => {
                                    const team = teamAtNode(node, winners);
                                    const r = nodeVisualRadius(node);
                                    if (!team) {
                                        return (
                                            <circle
                                                key={node.id}
                                                cx={node.x}
                                                cy={node.y}
                                                r={node.kind === 'leaf' ? 6 : 5}
                                                className={styles.placeholder}
                                            />
                                        );
                                    }
                                    // Champion = the finalist that wins the final (root's chosen child).
                                    const isChampion = node.parent === root && winners[root!.id] === node.id;
                                    // A crossing already settled by a real result is locked (not pickable).
                                    const clickable = !node.parent || !lockedIds.has(node.parent.id);
                                    return (
                                        <TeamCircle
                                            key={`${node.id}-${team.id}`}
                                            node={node}
                                            team={team}
                                            radius={isChampion ? r + 4 : r}
                                            isChampion={isChampion}
                                            clickable={clickable}
                                            onPick={handlePick}
                                        />
                                    );
                                })}
                        </svg>
                    )}
                </div>

                <footer className={styles.footer}>
                    {champion ? (
                        <>
                            <div className={styles.championBanner}>
                                <span className={styles.championTitle}>¡Campeón!</span>
                                <div className={styles.championTeam}>
                                    {champion.logo ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={champion.logo} alt="" className={styles.championLogo} />
                                    ) : null}
                                    <span className={styles.championName}>{champion.name}</span>
                                </div>
                            </div>

                            <div className={styles.championsTable}>
                                <span className={styles.championsTableTitle}>Campeones más elegidos</span>
                                <ol className={styles.championsList}>
                                    {championLeaderboard.map((entry, index) => (
                                        <li
                                            key={entry.key}
                                            className={`${styles.championRow} ${entry.key === currentChampionKey ? styles.championRowCurrent : ''}`.trim()}
                                        >
                                            <span className={styles.championRank}>{index + 1}.</span>
                                            <span className={styles.championRowName}>{entry.name}</span>
                                            <span className={styles.championCount}>{entry.count.toLocaleString('es-AR')}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        </>
                    ) : (
                        <span className={styles.hint}>Tocá un equipo para hacerlo avanzar hacia el centro.</span>
                    )}

                    <p className={styles.exportCounter}>
                        Brackets exportadas: <strong>{bracketsExported.toLocaleString('es-AR')}</strong>
                    </p>
                </footer>
            </div>
        </div>
    );
}

// ── Team circle (flag/logo clipped to a circle) ─────────────────────────────

function TeamCircle({
    node,
    team,
    radius,
    isChampion = false,
    clickable,
    onPick,
}: {
    node: BNode;
    team: BracketTeam;
    radius: number;
    isChampion?: boolean;
    clickable: boolean;
    onPick: (node: BNode) => void;
}) {
    // No circular container — the crest is shown whole (natural shape), uniform size.
    return (
        <g
            className={`${styles.teamAnim} ${clickable ? styles.teamClickable : ''}`.trim()}
            onClick={clickable ? () => onPick(node) : undefined}
        >
            <title>{team.name}</title>
            {/* Área de toque ampliada (invisible): en mobile el escudo renderiza a
                ~18px, demasiado chico para el dedo. Este círculo agranda el blanco
                de tap sin cambiar el tamaño visual. Solo en nodos pickeables. */}
            {clickable && (
                <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius + 11}
                    fill="transparent"
                    pointerEvents="all"
                />
            )}
            {team.logo ? (
                <image
                    href={team.logo}
                    x={node.x - radius}
                    y={node.y - radius}
                    width={radius * 2}
                    height={radius * 2}
                    preserveAspectRatio="xMidYMid meet"
                />
            ) : (
                <>
                    <circle cx={node.x} cy={node.y} r={radius} className={styles.fallbackFill} />
                    <text x={node.x} y={node.y + radius * 0.32} textAnchor="middle" className={styles.fallbackText} style={{ fontSize: radius * 0.82 }}>
                        {getInitials(team.name)}
                    </text>
                </>
            )}
            {isChampion && (
                <>
                    <circle cx={node.x} cy={node.y} r={radius + 2} className={styles.teamRingChampion} />
                    <text x={node.x} y={node.y - radius - 6} textAnchor="middle" className={styles.crown}>
                        👑
                    </text>
                </>
            )}
        </g>
    );
}

// ── Centerpiece (tournament logo as the "cup") ──────────────────────────────

function CenterPiece({ logo, decided }: { logo?: string; decided: boolean }) {
    const radius = CUP_RADIUS;
    const ringClass = `${styles.centerRing} ${decided ? styles.centerRingDecided : ''}`.trim();
    if (!logo) {
        return (
            <>
                <text x={CENTER} y={CENTER + 14} className={styles.trophy} textAnchor="middle">
                    🏆
                </text>
                {decided && <circle cx={CENTER} cy={CENTER} r={radius} className={ringClass} />}
            </>
        );
    }
    return (
        <g className={decided ? styles.centerDecided : undefined}>
            <image
                href={logo}
                x={CENTER - radius}
                y={CENTER - radius}
                width={radius * 2}
                height={radius * 2}
                preserveAspectRatio="xMidYMid meet"
            />
            {decided && <circle cx={CENTER} cy={CENTER} r={radius + 6} className={ringClass} />}
        </g>
    );
}
