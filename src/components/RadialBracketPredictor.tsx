'use client';

import React, { useMemo, useState } from 'react';
import styles from './RadialBracketPredictor.module.css';

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

function buildPredictorTree(rounds: PredictorRoundLike[]): { root: BNode | null; maxLevel: number; nodes: BNode[] } {
    const firstRound = rounds.find((r) => Array.isArray(r?.matches) && r.matches!.length > 0);
    const matches = firstRound?.matches ?? [];
    if (matches.length === 0) return { root: null, maxLevel: 0, nodes: [] };

    let counter = 0;
    const nextId = () => `n${counter++}`;
    const nodes: BNode[] = [];

    const makeLeaf = (team: BracketTeam | null): BNode => {
        const node: BNode = { id: nextId(), kind: 'leaf', team, children: [], parent: null, level: 0, angle: 0, radius: 0, x: 0, y: 0 };
        nodes.push(node);
        return node;
    };

    const leavesFor = (slice: any[]): BNode[] =>
        slice.flatMap((m) => [
            makeLeaf(extractTeam(m?.home_team ?? null, m?.home_participant ?? null)),
            makeLeaf(extractTeam(m?.away_team ?? null, m?.away_participant ?? null)),
        ]);

    // Pair adjacent subtrees into match nodes until a single root remains.
    const pairUp = (subtrees: BNode[]): BNode => {
        if (subtrees.length === 1) return subtrees[0];
        const next: BNode[] = [];
        for (let i = 0; i < subtrees.length; i += 2) {
            if (i + 1 < subtrees.length) {
                const node: BNode = {
                    id: nextId(),
                    kind: 'match',
                    team: null,
                    children: [subtrees[i], subtrees[i + 1]],
                    parent: null,
                    level: 0,
                    angle: 0,
                    radius: 0,
                    x: 0,
                    y: 0,
                };
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
    const leftLeaves = leavesFor(matches.slice(0, half));
    const rightLeaves = leavesFor(matches.slice(half));

    const leftRoot = pairUp(leftLeaves);
    const rightRoot = rightLeaves.length > 0 ? pairUp(rightLeaves) : null;

    let root: BNode;
    if (rightRoot) {
        root = {
            id: nextId(),
            kind: 'match',
            team: null,
            children: [leftRoot, rightRoot],
            parent: null,
            level: 0,
            angle: 0,
            radius: 0,
            x: 0,
            y: 0,
        };
        leftRoot.parent = root;
        rightRoot.parent = root;
        nodes.push(root);
    } else {
        root = leftRoot;
    }

    // ── Layout ──────────────────────────────────────────────────────────────
    // Levels: distance from root (root = 0). Deeper = further out.
    const assignLevels = (node: BNode, level: number) => {
        node.level = level;
        node.children.forEach((c) => assignLevels(c, level + 1));
    };
    assignLevels(root, 0);
    const maxLevel = Math.max(1, ...nodes.map((n) => n.level));

    // Hierarchical (dendrogram) layout: each subtree gets an arc, split between its
    // two children with a gap in the middle. Because the gap is a fixed fraction of
    // each node's own (shrinking) span, sibling groups that meet sooner in the tree
    // end up closer together — i.e. two matches that cross into the same next round
    // sit nearer each other than matches that only meet much later. The two teams of
    // a first-round match are placed tight around their match center.
    const GROUP_GAP_FRACTION = 0.28;
    const PAIR_HALF_GAP = 7; // degrees on each side of a first-round match center

    const layoutSubtree = (node: BNode, start: number, end: number) => {
        if (node.kind === 'leaf') {
            node.angle = (start + end) / 2;
            return;
        }
        const center = (start + end) / 2;
        // First-round match (both children are teams) → tight pair around the center.
        if (node.children.length === 2 && node.children.every((c) => c.kind === 'leaf')) {
            const half = Math.min(Math.abs(end - start) * 0.22, PAIR_HALF_GAP);
            const dir = end >= start ? 1 : -1;
            node.children[0].angle = center - dir * half;
            node.children[1].angle = center + dir * half;
            node.angle = center;
            return;
        }
        if (node.children.length === 2) {
            const span = end - start;
            const gap = span * GROUP_GAP_FRACTION;
            const childSpan = (span - gap) / 2;
            layoutSubtree(node.children[0], start, start + childSpan);
            layoutSubtree(node.children[1], end - childSpan, end);
            node.angle = (node.children[0].angle + node.children[1].angle) / 2;
            return;
        }
        // Bye / single child — pass the arc straight through.
        layoutSubtree(node.children[0], start, end);
        node.angle = node.children[0].angle;
    };

    layoutSubtree(leftRoot, 180 - ARC_HALF, 180 + ARC_HALF);
    if (rightRoot) layoutSubtree(rightRoot, -ARC_HALF, ARC_HALF);
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

    return { root, maxLevel, nodes };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function teamAtNode(node: BNode, winners: Record<string, string>): BracketTeam | null {
    if (node.kind === 'leaf') return node.team;
    const chosenId = winners[node.id];
    if (!chosenId) return null;
    const child = node.children.find((c) => c.id === chosenId);
    return child ? teamAtNode(child, winners) : null;
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
    const { root, nodes } = useMemo(() => buildPredictorTree(rounds), [rounds]);
    const [winners, setWinners] = useState<Record<string, string>>({});

    const champion = root ? teamAtNode(root, winners) : null;

    const handlePick = (node: BNode) => {
        const parent = node.parent;
        if (!parent) return; // champion node — nothing further to advance to
        setWinners((prev) => {
            const next = { ...prev };
            const wasChosen = next[parent.id] === node.id;
            // Clear this choice and every ancestor choice (downstream changed).
            let walker: BNode | null = parent;
            while (walker) {
                delete next[walker.id];
                walker = walker.parent;
            }
            if (!wasChosen) next[parent.id] = node.id; // toggle off when re-clicking
            return next;
        });
    };

    const reset = () => setWinners({});

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
        const W = 1080;
        const H = shareFormat === 'story' ? 1920 : 1350;
        const TITLE_H = shareFormat === 'story' ? 200 : 130;
        const FOOTER_H = (champion ? 300 : 180) + (shareFormat === 'story' ? 120 : 0);
        const margin = 60;
        const availW = W - margin * 2;
        const availH = H - TITLE_H - FOOTER_H;
        const scale = Math.min(availW / VIEW, availH / VIEW);
        const drawnBR = VIEW * scale;
        const bracketLeft = (W - drawnBR) / 2;
        const bracketTop = TITLE_H + Math.max(0, (availH - drawnBR) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#f4f1ea';
        ctx.fillRect(0, 0, W, H);

        // Title
        ctx.fillStyle = '#16181d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 44px system-ui, "Segoe UI", sans-serif';
        ctx.fillText(title || 'Mi predicción', W / 2, TITLE_H / 2 + 8);

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

        ctx.strokeStyle = 'rgba(22,24,29,0.55)';
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
                ctx.strokeStyle = 'rgba(22,24,29,0.5)';
                ctx.lineWidth = 1.6 / scale;
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.kind === 'leaf' ? 6 : 5, 0, Math.PI * 2);
                ctx.stroke();
                return;
            }
            const isChampion = node.parent === root && winners[root.id] === node.id;
            const r = isChampion ? TEAM_RADIUS + 3 : TEAM_RADIUS;
            const img = teamImgs[i];
            if (img) {
                drawImageContain(ctx, img, node.x, node.y, r);
            } else {
                ctx.fillStyle = '#d9d4c8';
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#16181d';
                ctx.font = `800 ${r * 0.82}px system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(getInitials(team.name), node.x, node.y);
            }
            if (isChampion) {
                ctx.strokeStyle = '#d4a017';
                ctx.lineWidth = 4 / scale;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        // Centre cup = tournament logo
        if (cupImg) {
            drawImageContain(ctx, cupImg, CENTER, CENTER, CUP_RADIUS);
        } else {
            ctx.fillStyle = '#16181d';
            ctx.font = '52px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🏆', CENTER, CENTER);
        }
        ctx.restore();

        // ── Footer — champion call-out + brand (absolute coords) ──
        const footerTop = H - FOOTER_H;
        if (champion) {
            ctx.fillStyle = '#d4a017';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '900 56px system-ui, "Segoe UI", sans-serif';
            ctx.fillText('¡Campeón!', W / 2, footerTop + 70);

            ctx.font = '800 42px system-ui, "Segoe UI", sans-serif';
            const nameWidth = ctx.measureText(champion.name).width;
            const crestR = 36;
            const gap = 18;
            const blockWidth = crestR * 2 + gap + nameWidth;
            const startX = W / 2 - blockWidth / 2;
            const rowY = footerTop + 160;
            if (champImg) {
                drawImageContain(ctx, champImg, startX + crestR, rowY, crestR);
            }
            ctx.fillStyle = '#d4a017';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(champion.name, startX + crestR * 2 + gap, rowY);
        }

        // G22 Scores brand
        if (brandImg) {
            const bh = 44;
            const bw = (brandImg.naturalWidth / brandImg.naturalHeight) * bh || 130;
            ctx.globalAlpha = 0.92;
            ctx.drawImage(brandImg, W / 2 - bw / 2, H - bh - 34, bw, bh);
            ctx.globalAlpha = 1;
        } else {
            ctx.fillStyle = 'rgba(22,24,29,0.7)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '800 28px system-ui, sans-serif';
            ctx.fillText('G22 Scores', W / 2, H - 44);
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

    const nodeVisualRadius = (_node: BNode) => TEAM_RADIUS;

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
                                    return (
                                        <TeamCircle
                                            key={`${node.id}-${team.id}`}
                                            node={node}
                                            team={team}
                                            radius={isChampion ? r + 4 : r}
                                            isChampion={isChampion}
                                            clickable
                                            onPick={handlePick}
                                        />
                                    );
                                })}
                        </svg>
                    )}
                </div>

                <footer className={styles.footer}>
                    {champion ? (
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
                    ) : (
                        <span className={styles.hint}>Tocá un equipo para hacerlo avanzar hacia el centro.</span>
                    )}
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
