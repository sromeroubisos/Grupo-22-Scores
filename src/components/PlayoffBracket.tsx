import React from 'react';
import { Trophy, Medal } from 'lucide-react';
import styles from './PlayoffBracket.module.css';

interface PlayoffMatch {
    match_id: string | number;
    home_participant: {
        participant_id: string | number;
        participant_name: string;
        image_path?: string;
    } | null;
    home_team?: {
        id: string | number;
        name: string;
        logo?: string;
    };
    away_participant: {
        participant_id: string | number;
        participant_name: string;
        image_path?: string;
    } | null;
    away_team?: {
        id: string | number;
        name: string;
        logo?: string;
    };
    score_home?: string | number;
    score_away?: string | number;
    winner_id?: string | number;
    match_start_iso?: string;
    result?: string;
    status?: string;
    /**
     * De qué partido de la ronda anterior sale cada lado. Opcional: el cuadro
     * que lo trae en todas las rondas se dibuja como árbol con líneas; el que
     * no, en columnas sueltas como siempre.
     */
    home_source?: BracketSource | null;
    away_source?: BracketSource | null;
    /** Cruce del formato que todavía no se publicó ("Ganador ronda 1"). */
    placeholder?: boolean;
}

interface BracketSource {
    match_id: string | number | null;
    outcome: 'winner' | 'loser';
}

interface PlayoffRound {
    round_id: string | number;
    name: string;
    matches: PlayoffMatch[];
}

interface PlayoffBracketProps {
    data: PlayoffRound[];
    title?: string;
}

// La ronda por el tercer puesto llega con nombres distintos según la fuente:
// "3.º y 4.º puesto" (plantillas propias), "Tercer puesto", "3rd place" /
// "Third place" (FlashScore). El "3" se exige con borde no numérico para que
// "13.º puesto" no entre.
function isThirdPlaceRoundName(name: string): boolean {
    const n = name.toLowerCase();
    if (/third\s*place|3rd\s*place|bronze\s*final/.test(n)) return true;
    // La ronda de consolación ("Consolación (7.º y 8.º)") cuelga de la final de
    // ubicación como el 3.er puesto de la Final; "Final de consolación" es la
    // final, no el bloque chico.
    if (isConsolationRoundName(n) && !/^\s*final\b/.test(n)) return true;
    // "Final y 3.º puesto" es la columna de la final (el 3.º cuelga de ella),
    // no el bloque chico del tercer puesto.
    if (/^\s*final(es)?\s+(y|and|&)\s+(3|tercer|third)/.test(n)) return false;
    return /puesto/.test(n) && (/tercer/.test(n) || /(^|\D)3(\D|$)/.test(n));
}

// Las rondas de consolación definen puestos (5.º al 8.º) sin ser el cuadro del
// título: no llevan Campeón ni trofeo.
function isConsolationRoundName(name: string): boolean {
    return /consolaci[oó]n/i.test(name);
}

// "Semifinal" y "Cuartos de final" también contienen "final": la columna héroe
// es solo la que EMPIEZA con Final (o Gran Final).
function looksLikeFinalRoundName(name: string): boolean {
    return /^\s*(gran\s+)?final\b/i.test(name);
}

// "Final por el 5.º puesto" es una final de ubicación, no LA final: define un
// puesto, no un campeón. Nada de dorado ni de tira de Campeón para esas. El
// puesto 1 sí es la final por el título ("Final por el 1.er puesto"). El punto
// y el ordinal van por separado: "5.º" son dos caracteres, y con uno solo
// "7.º puesto" se leía como final y se quedaba con la columna héroe.
function isPlacementRoundName(name: string): boolean {
    const n = name.toLowerCase();
    // "Final y 3.º puesto" es LA final (el 3.º cuelga de ella), no una de ubicación.
    if (/^\s*final(es)?\s+(y|and|&)\s+(3|tercer|third)/.test(n)) return false;
    const m = n.match(/(\d+)\s*\.?\s*(?:º|°|o)?\s*(?:er|do|to|mo|vo|no)?\s*puesto|(\d+)(?:st|nd|rd|th)[-\s]*place/);
    if (!m) return false;
    const num = Number(m[1] ?? m[2]);
    return Number.isFinite(num) && num > 1;
}

type ParticipantView = {
    name: string;
    logo: string;
    score: string | number;
    pens: number | null;
    won: boolean;
    /** Cómo llegó al cruce cuando no fue ganando ("Mejor perdedor"). */
    note: string | null;
};

type MatchView = {
    key: string | number;
    dateLabel: string;
    statusLabel: string;
    hasPenalties: boolean;
    finished: boolean;
    placeholder: boolean;
    home: ParticipantView;
    away: ParticipantView;
};

// Un club que entró por la ventana del mejor perdedor lo dice en su fila: sin
// eso, el cuadro parece mostrar a un eliminado jugando la ronda siguiente.
function noteOf(source: BracketSource | null | undefined, placeholder: boolean): string | null {
    return !placeholder && source?.outcome === 'loser' ? 'Mejor perdedor' : null;
}

// El estado llega en inglés según la fuente ("scheduled", "NS"); acá se lee en castellano.
function statusLabelEs(status: string): string {
    const s = String(status).trim();
    const key = s.toLowerCase();
    if (key === 'finished' || key === 'final' || key === 'ft') return 'Final';
    if (key === 'scheduled' || key === 'ns' || key === 'not started') return 'Programado';
    if (key === 'live' || key === 'inprogress' || key === 'in progress') return 'En vivo';
    if (key === 'postponed') return 'Postergado';
    if (key === 'cancelled' || key === 'canceled') return 'Cancelado';
    return s;
}

function toMatchView(match: PlayoffMatch, matchIdx: number): MatchView {
    // Robust data extraction: cada proveedor manda los mismos datos con otra forma.
    const m = match as any;
    const homeName = m.home_participant?.participant_name || m.home_team?.name || m.HOME_NAME || m.home_name || m.home?.name || 'TBD';
    const awayName = m.away_participant?.participant_name || m.away_team?.name || m.AWAY_NAME || m.away_name || m.away?.name || 'TBD';

    const matchDate = m.match_start_iso || m.start_time || m.date;
    const status = m.result || m.status || m.match_status?.status || (m.winner_id ? 'Final' : '');

    const isScheduled = status === 'scheduled' || status === 'NS' || status === 'Not Started';
    const rawHomeScore = m.score_home ?? m.scores?.home ?? m.HOME_SCORE ?? m.home_score ?? m.home_team?.score ?? null;
    const rawAwayScore = m.score_away ?? m.scores?.away ?? m.AWAY_SCORE ?? m.away_score ?? m.away_team?.score ?? null;
    const homeScore = isScheduled || rawHomeScore == null ? '-' : rawHomeScore;
    const awayScore = isScheduled || rawAwayScore == null ? '-' : rawAwayScore;

    // Penalty shootout (when the match was decided on penalties)
    const penaltiesRaw = m.scores?.penalties ?? m.score?.penalties ?? null;
    const penHome = penaltiesRaw?.home;
    const penAway = penaltiesRaw?.away;
    const hasPenalties = !isScheduled && typeof penHome === 'number' && typeof penAway === 'number';

    const homeLogo = m.home_participant?.image_path || m.home_team?.image_path || m.home_team?.small_image_path || m.home_team?.logo || '';
    const awayLogo = m.away_participant?.image_path || m.away_team?.image_path || m.away_team?.small_image_path || m.away_team?.logo || '';

    // Winner logic
    const isFinished = status === 'finished' || status === 'Final' || !!m.winner_id;
    // Penalty winner when regulation ended level
    const homePensWon = hasPenalties && Number(homeScore) === Number(awayScore) && Number(penHome) > Number(penAway);
    const awayPensWon = hasPenalties && Number(homeScore) === Number(awayScore) && Number(penAway) > Number(penHome);

    const homeWon = m.winner_id
        ? (m.home_participant && m.winner_id == m.home_participant.participant_id) || (m.home_team && m.winner_id == m.home_team.id)
        : m.winner === 'home' || homePensWon || (isFinished && homeScore !== '-' && awayScore !== '-' && Number(homeScore) > Number(awayScore));

    const awayWon = m.winner_id
        ? (m.away_participant && m.winner_id == m.away_participant.participant_id) || (m.away_team && m.winner_id == m.away_team.id)
        : m.winner === 'away' || awayPensWon || (isFinished && homeScore !== '-' && awayScore !== '-' && Number(awayScore) > Number(homeScore));

    // Un cruce sin publicar no tiene fecha ni marcador: se lee "Por definir" una
    // vez, arriba, y las filas quedan sin guiones.
    const placeholder = Boolean(m.placeholder);

    return {
        key: m.match_id || matchIdx,
        dateLabel: placeholder
            ? 'Por definir'
            : matchDate
                ? new Date(matchDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                : 'TBD',
        statusLabel: placeholder ? '' : status ? statusLabelEs(status) : '',
        hasPenalties,
        finished: Boolean(isFinished),
        placeholder,
        home: {
            name: homeName,
            logo: homeLogo,
            score: placeholder ? '' : homeScore,
            pens: hasPenalties ? Number(penHome) : null,
            won: Boolean(homeWon),
            note: noteOf(m.home_source, placeholder),
        },
        away: {
            name: awayName,
            logo: awayLogo,
            score: placeholder ? '' : awayScore,
            pens: hasPenalties ? Number(penAway) : null,
            won: Boolean(awayWon),
            note: noteOf(m.away_source, placeholder),
        },
    };
}

function ParticipantRow({ side, hasPenalties }: { side: ParticipantView; hasPenalties: boolean }) {
    return (
        <div className={`${styles.participant} ${side.won ? styles.winner : ''}`}>
            <div className={styles.participantInfo}>
                {side.logo ? (
                    <img src={side.logo} alt="" className={styles.logo} />
                ) : (
                    <div className={`${styles.logo} ${styles.logoPlaceholder}`} />
                )}
                {side.note ? (
                    <span className={styles.nameStack}>
                        <span className={styles.name}>{side.name}</span>
                        <span className={styles.sourceNote}>{side.note}</span>
                    </span>
                ) : (
                    <span className={styles.name}>{side.name}</span>
                )}
            </div>
            <span className={styles.score}>
                {side.score}{hasPenalties ? <span className={styles.penaltyScore}> ({side.pens})</span> : null}
            </span>
        </div>
    );
}

function MatchCard({ view, variant, delayMs }: { view: MatchView; variant?: 'final' | 'third'; delayMs: number }) {
    const cardClass = [
        styles.matchCard,
        variant === 'final' ? styles.finalCard : '',
        variant === 'third' ? styles.thirdCard : '',
        view.placeholder ? styles.placeholderCard : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={cardClass} style={{ animationDelay: `${delayMs}ms` }}>
            <div className={styles.matchDate}>
                {view.dateLabel}
                {view.statusLabel && (
                    <span className={styles.matchStatus}>{view.statusLabel}</span>
                )}
            </div>
            <ParticipantRow side={view.home} hasPenalties={view.hasPenalties} />
            <ParticipantRow side={view.away} hasPenalties={view.hasPenalties} />
        </div>
    );
}

// ── Árbol ──────────────────────────────────────────────────────────────────
// Las filas de la grilla son los partidos de la primera ronda, todas de la
// misma altura (1fr). Cada cruce posterior ocupa las filas de los partidos que
// lo alimentan y se centra en ellas, así que su centro cae justo en el medio de
// sus orígenes: las líneas se dibujan en unidades de fila, sin medir el DOM.

type TreeSpan = { start: number; end: number };

type TreeNode = {
    view: MatchView;
    span: TreeSpan;
    /** Los partidos de la ronda anterior cuyo ganador llega acá. */
    feeders: { span: TreeSpan; decided: boolean }[];
};

type TreeRound = { key: string | number; name: string; nodes: TreeNode[] };

type ResolvedRound = { key: string | number; name: string; matches: PlayoffMatch[] };

const centerOf = (span: TreeSpan) => (span.start + span.end) / 2;

/**
 * El árbol, o `null` si el cuadro no trae con qué armarlo. Alcanza con que un
 * cruce no sepa de dónde viene, o que dos se pisen, para volver a columnas: un
 * árbol con una línea inventada miente más que uno sin líneas.
 */
function buildTreeLayout(rounds: ResolvedRound[]): { leaves: number; rounds: TreeRound[] } | null {
    if (rounds.length < 2 || rounds[0].matches.length === 0) return null;

    const tree: TreeRound[] = [];
    let previous = new Map<string, { span: TreeSpan; decided: boolean }>();

    for (let roundIdx = 0; roundIdx < rounds.length; roundIdx++) {
        const round = rounds[roundIdx];
        const nodes: TreeNode[] = [];

        for (let matchIdx = 0; matchIdx < round.matches.length; matchIdx++) {
            const match = round.matches[matchIdx];
            const view = toMatchView(match, matchIdx);
            if (roundIdx === 0) {
                nodes.push({ view, span: { start: matchIdx, end: matchIdx + 1 }, feeders: [] });
                continue;
            }

            const feeders = [match.home_source, match.away_source]
                .filter((source): source is BracketSource => source?.outcome === 'winner' && source.match_id != null)
                .map((source) => previous.get(String(source.match_id)))
                .filter((feeder): feeder is { span: TreeSpan; decided: boolean } => feeder !== undefined);
            if (feeders.length === 0) return null;

            nodes.push({
                view,
                span: {
                    start: Math.min(...feeders.map((feeder) => feeder.span.start)),
                    end: Math.max(...feeders.map((feeder) => feeder.span.end)),
                },
                feeders,
            });
        }

        nodes.sort((left, right) => left.span.start - right.span.start);
        for (let i = 1; i < nodes.length; i++) {
            if (nodes[i].span.start < nodes[i - 1].span.end) return null;
        }

        previous = new Map(
            nodes.map((node) => [
                String(node.view.key),
                { span: node.span, decided: node.view.finished && (node.view.home.won || node.view.away.won) },
            ]),
        );
        tree.push({ key: round.key, name: round.name, nodes });
    }

    return { leaves: rounds[0].matches.length, rounds: tree };
}

/**
 * Cuadros sin `home_source`/`away_source` (Rugby Europe, FlashScore): se infiere
 * de dónde sale cada lado mirando quién ganó en la ronda anterior, y se reordena
 * cada ronda para que los cruces que alimentan a un mismo partido queden juntos
 * (el orden de carga no es el del árbol). Solo si TODO cierra; si algún lado no
 * se puede ubicar, o hay un partido huérfano, se devuelve null y el cuadro sigue
 * en columnas como antes.
 */
function arrangeBySources(rounds: ResolvedRound[]): ResolvedRound[] | null {
    if (rounds.length < 2) return null;
    // Si el cuadro ya trae sus orígenes, se respeta tal cual.
    if (rounds.slice(1).every((r) => r.matches.every((m) => m.home_source || m.away_source))) return null;

    const winnerOf = (match: PlayoffMatch): string | null => {
        const view = toMatchView(match, 0);
        if (view.placeholder || !view.finished) return null;
        if (view.home.won) return view.home.name;
        if (view.away.won) return view.away.name;
        return null;
    };

    const parents: Array<Map<number, number>> = []; // por ronda i>0: índice de partido previo -> índice del partido que alimenta
    const out: ResolvedRound[] = rounds.map((r) => ({ ...r, matches: [...r.matches] }));

    for (let i = 1; i < out.length; i++) {
        const byWinner = new Map<string, number>();
        out[i - 1].matches.forEach((m, idx) => {
            const w = winnerOf(m);
            if (w) byWinner.set(w, idx);
        });
        const link = new Map<number, number>();
        out[i].matches = out[i].matches.map((m, idx) => {
            const view = toMatchView(m, idx);
            const homeFrom = byWinner.get(view.home.name);
            const awayFrom = byWinner.get(view.away.name);
            if (homeFrom == null && awayFrom == null) return m;
            if (homeFrom != null) link.set(homeFrom, idx);
            if (awayFrom != null) link.set(awayFrom, idx);
            const prev = out[i - 1].matches;
            return {
                ...m,
                home_source: homeFrom != null ? { match_id: prev[homeFrom].match_id, outcome: 'winner' as const } : m.home_source ?? null,
                away_source: awayFrom != null ? { match_id: prev[awayFrom].match_id, outcome: 'winner' as const } : m.away_source ?? null,
            };
        });
        if (out[i].matches.some((m) => !m.home_source && !m.away_source)) return null;
        if (link.size !== out[i - 1].matches.length) return null;
        parents.push(link);
    }

    // De la final hacia atrás: cada ronda se ordena por la posición de su "hijo".
    for (let i = out.length - 1; i >= 1; i--) {
        const link = parents[i - 1];
        const order = out[i - 1].matches
            .map((m, idx) => ({ m, parent: link.get(idx) ?? 0, idx }))
            .sort((a, b) => a.parent - b.parent || a.idx - b.idx);
        out[i - 1].matches = order.map((o) => o.m);
        // El orden de la ronda anterior cambió: los índices de su propio "link" ya no valen.
        if (i - 2 >= 0) {
            const old = parents[i - 2];
            const remap = new Map<number, number>();
            order.forEach((o, newIdx) => {
                for (const [child, parent] of old) if (parent === o.idx) remap.set(child, newIdx);
            });
            parents[i - 2] = remap;
        }
    }
    return out;
}

/**
 * "Final y 3.º puesto" llega como UNA ronda con dos partidos. El 3.º es el que
 * juegan los dos perdedores de la ronda anterior: se lo saca de la final para que
 * ésta quede sola (y con su trofeo) y el 3.º se dibuje aparte, más chico.
 */
function splitThirdFromFinal(rounds: ResolvedRound[]): { rounds: ResolvedRound[]; thirdViews: MatchView[] } | null {
    const last = rounds.length - 1;
    if (last < 1 || !looksLikeFinalRoundName(rounds[last].name) || rounds[last].matches.length < 2) return null;

    const losers = new Set<string>();
    for (const match of rounds[last - 1].matches) {
        const view = toMatchView(match, 0);
        if (view.placeholder || !view.finished) continue;
        if (view.home.won) losers.add(view.away.name);
        else if (view.away.won) losers.add(view.home.name);
    }
    const isThird = (match: PlayoffMatch) => {
        const view = toMatchView(match, 0);
        return losers.has(view.home.name) && losers.has(view.away.name);
    };
    const thirds = rounds[last].matches.filter(isThird);
    const rest = rounds[last].matches.filter((match) => !isThird(match));
    if (thirds.length === 0 || rest.length === 0) return null;

    return {
        rounds: rounds.map((round, idx) => (idx === last ? { ...round, matches: rest } : round)),
        thirdViews: thirds.map((match, idx) => toMatchView(match, idx)),
    };
}

type CrossLayout = {
    sources: MatchView[];
    /** Ganadores arriba, perdedores abajo. */
    targets: { view: MatchView; kind: 'winners' | 'losers' }[];
};

/**
 * Dos semifinales que mandan a sus ganadores a una final y a sus perdedores a
 * otra (5.º y 7.º puesto): cada semi alimenta a las dos finales, así que no es
 * un árbol sino un cruce. Solo cuando las semis están jugadas y cada final
 * tiene a dos de esos equipos; si no, null y se dibuja en columnas.
 */
function crossLayoutOf(rounds: ResolvedRound[]): CrossLayout | null {
    if (rounds.length !== 2 || rounds[0].matches.length !== 2 || rounds[1].matches.length !== 2) return null;
    const sources = rounds[0].matches.map((match, idx) => toMatchView(match, idx));
    if (sources.some((view) => view.placeholder || !view.finished || (!view.home.won && !view.away.won))) return null;

    const winners = new Set(sources.map((view) => (view.home.won ? view.home.name : view.away.name)));
    const losers = new Set(sources.map((view) => (view.home.won ? view.away.name : view.home.name)));
    const targets = rounds[1].matches.map((match, idx) => {
        const view = toMatchView(match, idx);
        const kind = winners.has(view.home.name) && winners.has(view.away.name)
            ? ('winners' as const)
            : losers.has(view.home.name) && losers.has(view.away.name)
                ? ('losers' as const)
                : null;
        return kind ? { view, kind } : null;
    });
    if (targets.some((target) => target === null)) return null;
    const ok = targets as { view: MatchView; kind: 'winners' | 'losers' }[];
    if (new Set(ok.map((target) => target.kind)).size !== 2) return null;
    return { sources, targets: ok.sort((left) => (left.kind === 'winners' ? -1 : 1)) };
}

function CrossBracket({ layout, names }: { layout: CrossLayout; names: [string, string] }) {
    // Dos filas iguales: el centro de cada cruce (y de cada final) cae a 0.5 y
    // 1.5 SOLO si la tarjeta queda centrada en su fila. Por eso el rótulo de
    // "Ganadores/Perdedores" flota sobre la tarjeta (posición absoluta) en vez
    // de sumarse a la celda: con el rótulo adentro el centro se corría y las
    // líneas no llegaban a las tarjetas.
    const centers = [0.5, 1.5];
    // Curva en S del centro de un cruce al centro de una final: las cuatro
    // forman una X y se lee que cada cruce alimenta a las dos finales.
    const curve = (from: number, to: number) => `M0 ${from} C5 ${from} 5 ${to} 10 ${to}`;
    const floatingLabel: React.CSSProperties = {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        margin: '0 0 4px',
        whiteSpace: 'nowrap',
    };
    const cell = (column: number, row: number): React.CSSProperties => ({
        gridColumn: column,
        gridRow: row,
        display: 'flex',
        alignItems: 'center',
        // Simétrico: el centro de la tarjeta tiene que ser el de la fila.
        padding: '18px 0',
    });
    return (
        <div
            className={styles.tree}
            style={{ gridTemplateColumns: 'var(--tree-col) 72px var(--tree-final-col)', gridTemplateRows: 'auto 1fr 1fr' }}
        >
            <h3 className={`${styles.roundTitle} ${styles.treeTitle}`} style={{ gridColumn: 1, gridRow: 1 }}>{names[0]}</h3>
            <h3 className={`${styles.roundTitle} ${styles.treeTitle}`} style={{ gridColumn: 3, gridRow: 1 }}>{names[1]}</h3>
            {layout.sources.map((view, idx) => (
                <div key={view.key} className={styles.treeCell} style={cell(1, idx + 2)}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <MatchCard view={view} delayMs={idx * 45} />
                    </div>
                </div>
            ))}
            <svg
                className={styles.treeLinks}
                style={{ gridColumn: 2, gridRow: '2 / 4' }}
                viewBox="0 0 10 2"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
            >
                {centers.flatMap((from, sourceIdx) =>
                    layout.targets.map((target, targetIdx) => (
                        <path
                            key={`${sourceIdx}-${targetIdx}`}
                            d={curve(from, centers[targetIdx])}
                            className={`${styles.treeLink} ${target.kind === 'winners' ? styles.treeLinkDecided : ''}`}
                            strokeDasharray={target.kind === 'losers' ? '4 3' : undefined}
                        />
                    )),
                )}
            </svg>
            {layout.targets.map((target, idx) => (
                <div key={target.view.key} className={styles.treeCell} style={cell(3, idx + 2)}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <span className={styles.thirdLabel} style={floatingLabel}>
                            {target.kind === 'winners' ? 'Ganadores de las semis' : 'Perdedores de las semis'}
                        </span>
                        {/* La de los ganadores define el puesto más alto: se destaca
                            como una final. La de los perdedores, más chica, como el
                            3.er puesto del cuadro principal. */}
                        <MatchCard
                            view={target.view}
                            variant={target.kind === 'winners' ? 'final' : 'third'}
                            delayMs={90 + idx * 45}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

/** El codo que une un origen con su cruce, en unidades de fila (x va de 0 a 10). */
function linkPath(fromY: number, toY: number): string {
    return `M0 ${fromY} H5 V${toY} H10`;
}

function TreeLinks({ targets, leaves, column }: { targets: TreeNode[]; leaves: number; column: number }) {
    return (
        <svg
            className={styles.treeLinks}
            style={{ gridColumn: column, gridRow: `2 / ${leaves + 2}` }}
            viewBox={`0 0 10 ${leaves}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            {targets.flatMap((target) =>
                target.feeders.map((feeder, idx) => (
                    <path
                        key={`${target.view.key}-${idx}`}
                        d={linkPath(centerOf(feeder.span), centerOf(target.span))}
                        className={`${styles.treeLink} ${feeder.decided ? styles.treeLinkDecided : ''}`}
                    />
                )),
            )}
        </svg>
    );
}

function BracketTree({ layout, finalIdx, thirdPlace = [] }: { layout: { leaves: number; rounds: TreeRound[] }; finalIdx: number; thirdPlace?: MatchView[] }) {
    const { leaves, rounds } = layout;
    const lastIdx = rounds.length - 1;
    // Una columna de Campeón al final del árbol, como el remate de un cuadro
    // impreso: con la final jugada muestra al ganador; antes, el lugar vacío.
    const finalNode = finalIdx === lastIdx && rounds[lastIdx].nodes.length === 1 ? rounds[lastIdx].nodes[0] : null;
    const champion = finalNode && finalNode.view.finished
        ? (finalNode.view.home.won ? finalNode.view.home : finalNode.view.away.won ? finalNode.view.away : null)
        : null;

    const roundColumn = (roundIdx: number) => roundIdx * 2 + 1;
    const columns = rounds
        .map((_, roundIdx) => (roundIdx === finalIdx ? 'var(--tree-final-col)' : 'var(--tree-col)'))
        .join(' var(--tree-gutter) ')
        + (finalNode ? ' var(--tree-gutter) var(--tree-champion-col)' : '');
    const championColumn = roundColumn(rounds.length);
    const allRows = `2 / ${leaves + 2}`;

    return (
        <div
            className={styles.tree}
            style={{ gridTemplateColumns: columns, gridTemplateRows: `auto repeat(${leaves}, 1fr)` }}
        >
            {rounds.map((round, roundIdx) => {
                const isFinalCol = roundIdx === finalIdx;
                return (
                    <React.Fragment key={round.key}>
                        <h3
                            className={`${styles.roundTitle} ${styles.treeTitle} ${isFinalCol ? styles.finalRoundTitle : ''}`}
                            style={{ gridColumn: roundColumn(roundIdx), gridRow: 1 }}
                        >
                            {isFinalCol ? <Trophy size={12} aria-hidden="true" /> : null}
                            {round.name}
                        </h3>
                        {round.nodes.map((node, matchIdx) => (
                            <div
                                key={node.view.key}
                                className={styles.treeCell}
                                style={{ gridColumn: roundColumn(roundIdx), gridRow: `${node.span.start + 2} / ${node.span.end + 2}` }}
                            >
                                {isFinalCol && thirdPlace.length > 0 ? (
                                    <div style={{ position: 'relative', width: '100%' }}>
                                        <MatchCard
                                            view={node.view}
                                            variant="final"
                                            delayMs={Math.min(roundIdx * 90 + matchIdx * 45, 600)}
                                        />
                                        {/* El 3.er puesto cuelga debajo de la final sin mover la tarjeta
                                            de su centro (las líneas del árbol llegan a ese centro). */}
                                        <div className={styles.thirdBlock} style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 16 }}>
                                            <span className={styles.thirdLabel}>
                                                <Medal size={12} aria-hidden="true" />
                                                3.er puesto
                                            </span>
                                            {thirdPlace.map((view, idx) => (
                                                <MatchCard key={view.key} view={view} variant="third" delayMs={Math.min(rounds.length * 90 + idx * 45, 600)} />
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <MatchCard
                                        view={node.view}
                                        variant={isFinalCol ? 'final' : undefined}
                                        delayMs={Math.min(roundIdx * 90 + matchIdx * 45, 600)}
                                    />
                                )}
                            </div>
                        ))}
                        {roundIdx > 0 ? (
                            <TreeLinks targets={round.nodes} leaves={leaves} column={roundColumn(roundIdx) - 1} />
                        ) : null}
                    </React.Fragment>
                );
            })}

            {finalNode ? (
                <>
                    <h3
                        className={`${styles.roundTitle} ${styles.treeTitle} ${styles.finalRoundTitle}`}
                        style={{ gridColumn: championColumn, gridRow: 1 }}
                    >
                        Campeón
                    </h3>
                    <svg
                        className={styles.treeLinks}
                        style={{ gridColumn: championColumn - 1, gridRow: allRows }}
                        viewBox={`0 0 10 ${leaves}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            d={linkPath(centerOf(finalNode.span), centerOf(finalNode.span))}
                            className={`${styles.treeLink} ${champion ? styles.treeLinkChampion : ''}`}
                        />
                    </svg>
                    <div
                        className={styles.treeCell}
                        style={{ gridColumn: championColumn, gridRow: `${finalNode.span.start + 2} / ${finalNode.span.end + 2}` }}
                    >
                        <div
                            className={`${styles.championBox} ${champion ? '' : styles.championBoxPending}`}
                            style={{ animationDelay: `${Math.min(rounds.length * 90, 600)}ms` }}
                        >
                            {champion ? (
                                <>
                                    {champion.logo ? (
                                        <img src={champion.logo} alt="" className={styles.championBoxLogo} />
                                    ) : (
                                        <Trophy size={22} aria-hidden="true" />
                                    )}
                                    <span className={styles.championBoxName}>{champion.name}</span>
                                    <span className={styles.championStripTag}>Campeón</span>
                                </>
                            ) : (
                                <>
                                    <Trophy size={20} aria-hidden="true" />
                                    <span className={styles.championBoxName}>Por definir</span>
                                </>
                            )}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}

export default function PlayoffBracket({ data, title = 'Cuadro Final' }: PlayoffBracketProps) {
    if (!data || data.length === 0) {
        return (
            <div className={styles.emptyState}>
                <p>No hay información del cuadro disponible.</p>
            </div>
        );
    }

    // Rounds arrive in play order (e.g. Quarter-finals -> Semi-finals -> Final).
    const resolved = data.map((round, idx) => ({
        key: round.round_id ?? idx,
        name: String(round.name || (round as any).round_name || (round as any).ROUND_NAME || `Ronda ${idx + 1}`),
        matches: (round.matches || (round as any).MATCHES || (round as any).events || []) as PlayoffMatch[],
    }));

    // El 3.er puesto no compite visualmente con la Final: sale de la grilla de
    // columnas y se muestra compacto debajo de ella. Si por la forma de los
    // datos no hay una columna Final reconocible, vuelve como columna propia
    // pero achicada.
    let thirdPlaceRounds = resolved.filter((round) => isThirdPlaceRoundName(round.name));
    let mainRounds = resolved.filter((round) => !isThirdPlaceRoundName(round.name));
    if (mainRounds.length === 0) {
        mainRounds = resolved;
        thirdPlaceRounds = [];
    }

    // El 3.º que vino metido en la ronda de la final se saca de ahí.
    let thirdFromFinal: MatchView[] = [];
    const splitFinal = thirdPlaceRounds.length === 0 ? splitThirdFromFinal(mainRounds) : null;
    if (splitFinal) {
        mainRounds = splitFinal.rounds;
        thirdFromFinal = splitFinal.thirdViews;
    }

    // La columna héroe es la ÚLTIMA ronda que no sea de ubicación, y solo si
    // parece una final de verdad. Un cuadro que solo define puestos (Final por
    // el 5.º, por el 7.º) no tiene héroe: ahí nadie sale campeón de nada.
    let finalIdx = -1;
    for (let i = mainRounds.length - 1; i >= 0; i--) {
        const round = mainRounds[i];
        if (isPlacementRoundName(round.name)) continue;
        if (looksLikeFinalRoundName(round.name) || (i === mainRounds.length - 1 && round.matches.length === 1)) {
            finalIdx = i;
        }
        break;
    }
    const hasFinalColumn = finalIdx >= 0;

    const thirdPlaceViews = hasFinalColumn
        ? [
            ...thirdPlaceRounds.flatMap((round) => round.matches.map((match, idx) => toMatchView(match, idx))),
            ...thirdFromFinal,
        ]
        : [];
    const trailingThirdRounds = hasFinalColumn ? [] : thirdPlaceRounds;

    // Árbol con líneas solo si cada cruce sabe de dónde sale (hoy: Ultimate
    // Sevens). Con 3.er puesto no: esa ronda no cuelga de ningún cruce del árbol.
    const cross = thirdPlaceRounds.length === 0 ? crossLayoutOf(mainRounds) : null;
    if (cross) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>{title}</h2>
                <div className={styles.bracketScroll}>
                    <CrossBracket layout={cross} names={[mainRounds[0].name, mainRounds[1].name]} />
                </div>
            </div>
        );
    }

    const tree = thirdPlaceRounds.length === 0
        ? buildTreeLayout(arrangeBySources(mainRounds) ?? mainRounds)
        : null;
    if (tree) {
        return (
            <div className={styles.container}>
                <h2 className={styles.title}>{title}</h2>
                <div className={styles.bracketScroll}>
                    <BracketTree layout={tree} finalIdx={finalIdx} thirdPlace={thirdFromFinal} />
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.bracketScroll}>
                <div className={styles.bracketGrid}>
                    {mainRounds.map((round, roundIdx) => {
                        const isFinalCol = roundIdx === finalIdx;
                        const views = round.matches.map((match, idx) => toMatchView(match, idx));
                        const delayOf = (matchIdx: number) => Math.min(roundIdx * 90 + matchIdx * 45, 600);

                        if (!isFinalCol) {
                            return (
                                <div key={round.key} className={styles.roundColumn}>
                                    <h3 className={styles.roundTitle}>{round.name}</h3>
                                    <div className={styles.matchesList}>
                                        {views.map((view, matchIdx) => (
                                            <MatchCard key={view.key} view={view} delayMs={delayOf(matchIdx)} />
                                        ))}
                                    </div>
                                </div>
                            );
                        }

                        // Campeón: solo cuando la final está terminada y con ganador.
                        const finalView = views.length === 1 ? views[0] : null;
                        const isConsolationFinal = isConsolationRoundName(round.name);
                        const champion = finalView && finalView.finished && !isConsolationFinal
                            ? (finalView.home.won ? finalView.home : finalView.away.won ? finalView.away : null)
                            : null;

                        return (
                            <div key={round.key} className={`${styles.roundColumn} ${styles.finalColumn}`}>
                                <h3 className={`${styles.roundTitle} ${styles.finalRoundTitle}`}>
                                    {isConsolationFinal ? <Medal size={12} aria-hidden="true" /> : <Trophy size={12} aria-hidden="true" />}
                                    {round.name}
                                </h3>
                                <div className={styles.finalStack}>
                                    {views.map((view, matchIdx) => (
                                        <MatchCard key={view.key} view={view} variant="final" delayMs={delayOf(matchIdx)} />
                                    ))}
                                    {champion && (
                                        <div className={styles.championStrip} style={{ animationDelay: `${delayOf(views.length)}ms` }}>
                                            <Trophy size={14} aria-hidden="true" />
                                            {champion.logo ? (
                                                <img src={champion.logo} alt="" className={styles.championStripLogo} />
                                            ) : null}
                                            <span className={styles.championStripName}>{champion.name}</span>
                                            <span className={styles.championStripTag}>Campeón</span>
                                        </div>
                                    )}
                                    {thirdPlaceViews.length > 0 && (
                                        <div className={styles.thirdBlock}>
                                            <span className={styles.thirdLabel}>
                                                <Medal size={12} aria-hidden="true" />
                                                {thirdPlaceRounds.find((round) => isConsolationRoundName(round.name))?.name ?? '3.er puesto'}
                                            </span>
                                            {thirdPlaceViews.map((view, matchIdx) => (
                                                <MatchCard key={view.key} view={view} variant="third" delayMs={delayOf(views.length + 1 + matchIdx)} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {trailingThirdRounds.map((round, idx) => (
                        <div key={round.key} className={`${styles.roundColumn} ${styles.thirdColumn}`}>
                            <h3 className={`${styles.roundTitle} ${styles.thirdRoundTitle}`}>
                                <Medal size={11} aria-hidden="true" />
                                {round.name}
                            </h3>
                            <div className={styles.matchesList}>
                                {round.matches.map((match, matchIdx) => {
                                    const view = toMatchView(match, matchIdx);
                                    return (
                                        <MatchCard
                                            key={view.key}
                                            view={view}
                                            variant="third"
                                            delayMs={Math.min((mainRounds.length + idx) * 90 + matchIdx * 45, 600)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
