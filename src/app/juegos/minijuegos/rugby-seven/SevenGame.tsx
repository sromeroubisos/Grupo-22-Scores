'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { Silkscreen } from 'next/font/google';
import MatchView from './MatchView';
import SpritePreview from './SpritePreview';
import TeamEditor from './TeamEditor';
import { matchupOdds, type MatchConfig, type MatchEvent } from './engine';
import { POSITIONS, playerNames } from './names';
import { APPROX_KIT, NATION_BY_CODE, NATION_ZONE, NATIONS, ZONES } from './nations';
import { randomLook } from './sprites';
import {
    DIFFICULTIES,
    DURATIONS,
    loadSaved,
    TOUR_SLOTS,
    PRESET_TEAMS,
    saveSaved,
    type CupProgress,
    type Difficulty,
    type Duration,
    type SevenTeam,
} from './teams';
import {
    closeRound,
    createTour,
    defOf,
    finalRanking,
    GROUP_LETTERS,
    groupStandings,
    koLabel,
    myFixture,
    nextOpponent,
    ratingBoost,
    ratingOf,
    roundLabel,
    replaceInDef,
    setRatingContext,
    simulate,
    TOURS,
    TOUR_CATS,
    catOf,
    type Stage,
    type TourDef,
    type ScoreEvent,
    type TourState,
} from './tours';
import { AR_CLUBS, AR_DIVISIONS_PLAYABLE } from './arClubs';
import { CLUB_LEAGUES, CLUBS, teamOfCode } from './clubs';
import {
    advanceCareer,
    CAREER_PHASE_LABEL,
    careerBoosts,
    careerNames,
    careerRating,
    careerVerdict,
    closesSeason,
    createCareer,
    divisionLabel,
    divisionOf,
    formatOf,
    liveScorers,
    markCelebrated,
    myTitles,
    palmaresFor,
    palmaresKeys,
    palmaresLabel,
    pendingCelebration,
    myRoster,
    NAC_FORMATS,
    otherTours,
    parallelView,
    renamePlayer,
    seasonFixture,
    seasonPlan,
    settleCareer,
    type NacFormat,
} from './career';
import { advanceRoad, AUTO_QUALIFIED, createRoad, PHASE_LABEL, regionalDef, regionFor, regionName, roadEligible, roadVerdict } from './road';
import { CloudSync, type CloudStatus } from './cloudSave';
import styles from './seven.module.css';

const pixel = Silkscreen({ weight: ['400', '700'], subsets: ['latin'], display: 'swap' });

type Mode = 'quick' | 'cup' | 'tour';
type Screen =
    | { k: 'menu' }
    | { k: 'quick'; step: 1 | 2 }
    | { k: 'cupSetup'; step: 1 | 2 }
    | { k: 'cup' }
    | { k: 'slots' }
    | { k: 'tourPick' }
    | { k: 'tourSetup'; step: 1 | 2 }
    | { k: 'customSetup' }
    | { k: 'roadSetup'; step: 1 | 2 }
    | { k: 'careerSetup'; step: 1 | 2 }
    | { k: 'tour' }
    | { k: 'teams' }
    | { k: 'edit'; team: SevenTeam }
    | { k: 'match'; cfg: MatchConfig; mode: Mode; nonce: number }
    | { k: 'result'; cfg: MatchConfig; mode: Mode; score: [number, number] };

interface Category {
    name: string;
    teams: SevenTeam[];
    /** Primer nivel del selector (Internacional, Inventados, Mis equipos; después, Clubes). Sin grupo, es su propio nivel. */
    group?: string;
    /** Cómo se llama el segundo nivel dentro del grupo ("Continente"). */
    kind?: string;
}

const CUP_ROUNDS = ['Cuartos de final', 'Semifinal', 'Final'];

/** Formatos del torneo personalizado, con cuántos equipos admite cada uno. */
const CUSTOM_FORMATS: { label: string; hint: string; stage: Stage; min: number; max: number; valid: (n: number) => boolean; need: string }[] = [
    { label: 'Liga a una vuelta', hint: 'Todos contra todos una vez.', stage: { kind: 'liga', legs: 1 }, min: 3, max: 12, valid: (n) => n >= 3 && n <= 12, need: 'Elegí entre 3 y 12 selecciones.' },
    { label: 'Liga a dos vueltas', hint: 'Todos contra todos, ida y vuelta.', stage: { kind: 'liga', legs: 2 }, min: 3, max: 8, valid: (n) => n >= 3 && n <= 8, need: 'Elegí entre 3 y 8 selecciones.' },
    { label: '2 grupos y semifinales', hint: 'Pasan los dos primeros de cada grupo.', stage: { kind: 'grupos', groups: 2, advance: 2 }, min: 6, max: 16, valid: (n) => n >= 6 && n <= 16, need: 'Elegí entre 6 y 16 selecciones.' },
    { label: '4 grupos y cuartos', hint: 'Pasan los dos primeros de cada grupo.', stage: { kind: 'grupos', groups: 4, advance: 2 }, min: 12, max: 24, valid: (n) => n >= 12 && n <= 24, need: 'Elegí entre 12 y 24 selecciones.' },
    { label: '8 grupos y octavos', hint: 'Pasan los dos primeros de cada grupo: 16 al playoff.', stage: { kind: 'grupos', groups: 8, advance: 2 }, min: 24, max: 64, valid: (n) => n >= 24 && n <= 64, need: 'Elegí entre 24 y 64 selecciones.' },
    { label: '8 grupos y dieciseisavos', hint: 'Pasan los cuatro primeros de cada grupo: 32 al playoff.', stage: { kind: 'grupos', groups: 8, advance: 4 }, min: 40, max: 64, valid: (n) => n >= 40 && n <= 64, need: 'Elegí entre 40 y 64 selecciones.' },
    { label: '16 grupos y dieciseisavos', hint: 'Pasan los dos primeros de cada grupo: 32 al playoff.', stage: { kind: 'grupos', groups: 16, advance: 2 }, min: 48, max: 64, valid: (n) => n >= 48 && n <= 64, need: 'Elegí entre 48 y 64 selecciones.' },
    { label: 'Eliminación directa', hint: 'Cuadro de hasta 64. Si no es potencia de dos, los mejores sembrados quedan libres.', stage: { kind: 'ko' }, min: 3, max: 64, valid: (n) => n >= 3 && n <= 64, need: 'Elegí entre 3 y 64 selecciones.' },
];

/* Lo impuro (azar, reloj, contador) vive fuera del componente: solo se llama desde eventos. */
let matchNonce = 0;
function nextNonce() {
    matchNonce += 1;
    return matchNonce;
}

function shuffled<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function makeNewTeam(): SevenTeam {
    const base = PRESET_TEAMS[Math.floor(Math.random() * PRESET_TEAMS.length)];
    return { id: `custom-${Date.now().toString(36)}`, name: '', short: '', kit: { ...base.kit }, players: Array.from({ length: 7 }, () => randomLook()), custom: true };
}

/* ===================== piezas chicas ===================== */

/**
 * Banderita de un club con los colores de su camiseta (código `kit:camiseta:segundo:diseño`).
 * No es el escudo: es un banderín con el diseño de la camiseta (aros, banda o liso). Decorativa.
 */
function Pennant({ code, size }: { code: string; size: number }) {
    const [, main, second, pattern] = code.split(':');
    const w = size;
    const h = Math.round(size * 0.72);
    return (
        <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden="true" className={styles.flag}>
            <rect width="20" height="14" fill={main} />
            {pattern === 'aros' && [2, 7, 12].map((y) => <rect key={y} y={y - 1.2} width="20" height="2.4" fill={second} />)}
            {pattern === 'banda' && <rect y="5" width="20" height="4" fill={second} />}
            {pattern === 'liso' && <rect width="6" height="14" fill={second} />}
            <rect x="0.5" y="0.5" width="19" height="13" fill="none" stroke="#050608" strokeWidth="1" />
        </svg>
    );
}

/** Bandera desde public/flags. Decorativa: el nombre del país siempre va al lado. */
function FlagIcon({ code, size = 18 }: { code?: string; size?: number }) {
    if (!code) return null;
    if (code.startsWith('kit:')) return <Pennant code={code} size={size} />;
    // eslint-disable-next-line @next/next/no-img-element -- SVG local estático
    return <img src={`/flags/${code}.svg`} alt="" aria-hidden="true" width={size} height={Math.round(size * 0.72)} loading="lazy" className={styles.flag} />;
}

/** Nivel de 1 a 5 a partir del ranking: se lee de un vistazo cuánto cuesta el rival. */
function Level({ rating }: { rating?: number }) {
    const lvl = Math.max(1, Math.min(5, Math.round(((rating ?? 70) - 25) / 14)));
    return (
        <span className={styles.level} aria-label={`Nivel ${lvl} de 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <i key={i} className={i <= lvl ? styles.levelOn : undefined} aria-hidden="true" />
            ))}
        </span>
    );
}

/** Selector con flechitas: ◀ valor ▶. Es el control de toda la selección. */
function ArrowSelect({ label, value, sub, onPrev, onNext, big }: { label: string; value: React.ReactNode; sub?: React.ReactNode; onPrev: () => void; onNext: () => void; big?: boolean }) {
    return (
        <div className={`${styles.arrowSel} ${big ? styles.arrowSelBig : ''}`}>
            <span className={styles.arrowLabel}>{label}</span>
            <div className={styles.arrowRow}>
                <button type="button" className={styles.arrowBtn} onClick={onPrev} aria-label={`${label}: anterior`}>◀</button>
                <div className={styles.arrowValue} aria-live="polite">
                    <strong>{value}</strong>
                    {sub && <span>{sub}</span>}
                </div>
                <button type="button" className={styles.arrowBtn} onClick={onNext} aria-label={`${label}: siguiente`}>▶</button>
            </div>
        </div>
    );
}

const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** Código de participante de torneo: ARG para selecciones, el id (club-…) para clubes. */
const codeOfTeam = (t: SevenTeam) => (t.id.startsWith('nat-') ? t.id.slice(4).toUpperCase() : t.id);

/**
 * Elección de equipo en dos niveles: primero la categoría (Mundial, zona,
 * inventados...) y adentro el equipo, los dos con flechitas.
 */
function TeamChooser({ label, teamId, onChange, categories, avoid, active, onActivate }: { label: string; teamId: string | null; onChange: (id: string) => void; categories: Category[]; avoid?: string | null; active?: boolean; onActivate?: () => void }) {
    const cats = categories.filter((c) => c.teams.length > 0);
    // Una selección puede estar en dos categorías (Sudáfrica: África y Mundial 2027): se recuerda en cuál estás parado.
    const [prefCat, setPrefCat] = useState<string | null>(null);
    const holds = (c: Category) => c.teams.some((t) => t.id === teamId);
    const cat = cats.find((c) => c.name === prefCat && holds(c)) ?? cats.find(holds) ?? cats[0];
    const team = cat?.teams.find((t) => t.id === teamId) ?? null;
    const names = team ? playerNames(team) : [];
    // Primer nivel: el tipo (Internacional, Inventados...). Segundo: la categoría adentro del tipo (el continente).
    const groupOf = (c: Category) => c.group ?? c.name;
    const groups = [...new Set(cats.map(groupOf))];
    const group = cat ? groupOf(cat) : groups[0];
    const inGroup = cats.filter((c) => groupOf(c) === group);
    const subIdx = Math.max(0, inGroup.indexOf(cat));

    const pickIn = (c: Category, from: number, step: 1 | -1) => {
        for (let k = 0; k < c.teams.length; k++) {
            const t = c.teams[wrap(from + step * k, c.teams.length)];
            if (t.id !== avoid) return t.id;
        }
        return c.teams[0].id;
    };
    const moveGroup = (step: 1 | -1) => {
        const g = groups[wrap(groups.indexOf(group) + step, groups.length)];
        const first = cats.find((c) => groupOf(c) === g);
        if (!first) return;
        setPrefCat(first.name);
        onChange(pickIn(first, 0, 1));
    };
    const moveCat = (step: 1 | -1) => {
        const next = inGroup[wrap(subIdx + step, inGroup.length)];
        setPrefCat(next.name);
        onChange(pickIn(next, 0, 1));
    };
    const moveTeam = (step: 1 | -1) => {
        if (!cat) return;
        const i = cat.teams.findIndex((t) => t.id === teamId);
        onChange(pickIn(cat, i + step, step));
    };

    return (
        <section className={`${styles.chooser} ${active ? styles.chooserActive : ''}`} aria-label={label} onFocusCapture={onActivate} onClick={onActivate}>
            <header className={styles.slotHead}>{label}</header>
            {groups.length > 1 && (
                <ArrowSelect label="Tipo" value={group} sub={`${new Set(inGroup.flatMap((c) => c.teams.map((t) => t.id))).size} equipos`} onPrev={() => moveGroup(-1)} onNext={() => moveGroup(1)} />
            )}
            {inGroup.length > 1 && (
                <ArrowSelect label={cat?.kind ?? 'Categoría'} value={cat?.name ?? ''} sub={`${cat?.teams.length ?? 0} equipos`} onPrev={() => moveCat(-1)} onNext={() => moveCat(1)} />
            )}
            <div className={styles.slotPitch} aria-hidden="true">
                {team && [0, 1, 2].map((i) => <SpritePreview key={`${team.id}-${i}`} look={team.players[i]} kit={team.kit} scale={4} running />)}
            </div>
            <ArrowSelect
                big
                label="Equipo"
                value={team ? <><FlagIcon code={team.flag} size={22} /> {team.name}</> : 'Elegí un equipo'}
                sub={team ? <><Level rating={team.rating} /> <span className={styles.kitDots} aria-hidden="true"><i style={{ background: team.kit.shirt }} /><i style={{ background: team.kit.shirt2 }} /><i style={{ background: team.kit.shorts }} /></span></> : null}
                onPrev={() => moveTeam(-1)}
                onNext={() => moveTeam(1)}
            />
            {team && (
                <ol className={styles.roster}>
                    {names.map((n, i) => (
                        <li key={i}>
                            <b>{i + 1}</b> {n.first[0]}. {n.last} <small>{POSITIONS[i]}</small>
                        </li>
                    ))}
                </ol>
            )}
            {team && APPROX_KIT.has(team.id) && <p className={styles.note}>Camiseta armada con los colores de la bandera.</p>}
        </section>
    );
}

/** Segundo paso: dificultad y duración, también con flechitas. */
function SettingsStep({ teams, difficulty, setDifficulty, duration, setDuration }: { teams: (SevenTeam | null)[]; difficulty: Difficulty; setDifficulty: (d: Difficulty) => void; duration: Duration; setDuration: (d: Duration) => void }) {
    const di = DIFFICULTIES.findIndex((d) => d.id === difficulty);
    const du = DURATIONS.indexOf(duration);
    return (
        <div className={styles.settingsStep}>
            <div className={styles.settingsVs}>
                {teams.map((t, i) =>
                    t ? (
                        <span key={t.id} className={styles.settingsTeam}>
                            {i > 0 && <span className={styles.vsBadge} aria-hidden="true">VS</span>}
                            <span className={styles.nextTeam}>
                                <SpritePreview look={t.players[0]} kit={t.kit} scale={4} running />
                                <b><FlagIcon code={t.flag} /> {t.name}</b>
                                {i > 0 && <Level rating={t.rating} />}
                            </span>
                        </span>
                    ) : null,
                )}
            </div>
            <ArrowSelect
                big
                label="Dificultad"
                value={DIFFICULTIES[di].label}
                sub={DIFFICULTIES[di].hint}
                onPrev={() => setDifficulty(DIFFICULTIES[wrap(di - 1, DIFFICULTIES.length)].id)}
                onNext={() => setDifficulty(DIFFICULTIES[wrap(di + 1, DIFFICULTIES.length)].id)}
            />
            <ArrowSelect
                big
                label="Duración"
                value={`${duration} minutos`}
                sub={`Dos tiempos de ${duration === 3 ? '1:30' : duration === 5 ? '2:30' : '3:30'}`}
                onPrev={() => setDuration(DURATIONS[wrap(du - 1, DURATIONS.length)])}
                onNext={() => setDuration(DURATIONS[wrap(du + 1, DURATIONS.length)])}
            />
            {teams[0] && teams[1] && (() => {
                const o = matchupOdds(difficulty, teams[1].rating ?? 70, teams[0].rating ?? 70);
                return (
                    <p className={styles.note}>
                        Contra {teams[1].name}: tus tackles entran {o.tackle} de cada 10 y romper la línea sale {o.breakLine} de cada 10. Contra las potencias del ranking se te escapan más.
                    </p>
                );
            })()}
        </div>
    );
}

/** Tabla de posiciones de un grupo. Las filas que clasifican van marcadas. */
function GroupTable({ title, rows, me, advance, nameOf, flagOf }: { title: string; rows: { team: string; pj: number; g: number; e: number; p: number; pf: number; pc: number; pts: number }[]; me: string; advance: number; nameOf: (id: string) => string; flagOf: (id: string) => string | undefined }) {
    return (
        <div className={styles.groupCard}>
            <h3 className={styles.groupTitle}>{title}</h3>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">Equipo</th>
                        <th scope="col">PJ</th>
                        <th scope="col">G</th>
                        <th scope="col">P</th>
                        <th scope="col">Dif</th>
                        <th scope="col">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r.team} className={`${r.team === me ? styles.rowMine : ''} ${i < advance ? styles.rowQual : ''}`}>
                            <td>{i + 1}</td>
                            <td className={styles.tableTeam}>
                                <FlagIcon code={flagOf(r.team)} size={14} /> {nameOf(r.team)}
                            </td>
                            <td>{r.pj}</td>
                            <td>{r.g}</td>
                            <td>{r.p}</td>
                            <td>{r.pf - r.pc > 0 ? `+${r.pf - r.pc}` : r.pf - r.pc}</td>
                            <td><strong>{r.pts}</strong></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** Cuadro de playoffs: una columna por ronda, con lo jugado, lo que toca y lo que falta. */
function Bracket({ s, def, nameOf, flagOf }: { s: TourState; def: TourDef; nameOf: (id: string) => string; flagOf: (id: string) => string | undefined }) {
    let size = s.koStart;
    let entrants = s.koStart;
    if (!size && def.stage.kind === 'grupos') {
        const groupsN = Array.isArray(def.stage.groups) ? def.stage.groups.length : def.stage.groups;
        entrants = groupsN * def.stage.advance + (def.stage.bestThirds ?? 0);
        size = entrants;
    }
    // Con 6 clasificados el cuadro es de 8: los dos mejores quedan libres y la primera ronda tiene 2 partidos.
    let full = 2;
    while (full < size) full *= 2;
    size = full;
    const firstRoundMatches = entrants ? Math.min(size / 2, entrants - size / 2) : size / 2;
    const cols: { label: string; matches: { a?: string; b?: string; sa?: number; sb?: number }[] }[] = [];
    for (let n = size; n >= 2; n /= 2) {
        const label = koLabel(n);
        const played = s.koHistory.find((h) => h.label === label);
        if (played) cols.push({ label, matches: played.results });
        else if (s.stage === 'ko' && s.alive.length === n) {
            const m = [];
            for (let i = 0; i + 1 < s.alive.length; i += 2) if (s.alive[i] !== '__bye__' && s.alive[i + 1] !== '__bye__') m.push({ a: s.alive[i], b: s.alive[i + 1] });
            cols.push({ label, matches: m });
        } else cols.push({ label, matches: Array.from({ length: n === size ? firstRoundMatches : n / 2 }, () => ({})) });
    }
    return (
        <div className={styles.bracket}>
            {!s.koStart && <p className={styles.note}>El cuadro se arma cuando termina la fase de grupos.</p>}
            <div className={styles.bracketCols}>
                {cols.map((c) => (
                    <div key={c.label} className={styles.bracketCol}>
                        <h3 className={styles.groupTitle}>{c.label}</h3>
                        <div className={styles.bracketMatches}>
                            {c.matches.map((m, i) => (
                                <div key={i} className={`${styles.bMatch} ${m.a === s.me || m.b === s.me ? styles.bMine : ''}`}>
                                    {[m.a, m.b].map((id, k) => {
                                        const sc = k === 0 ? m.sa : m.sb;
                                        const other = k === 0 ? m.sb : m.sa;
                                        const won = sc !== undefined && other !== undefined && sc > other;
                                        return (
                                            <div key={k} className={`${styles.bTeam} ${won ? styles.bWon : ''}`}>
                                                {id ? (
                                                    <>
                                                        <FlagIcon code={flagOf(id)} size={14} /> <span>{nameOf(id)}</span>
                                                    </>
                                                ) : (
                                                    <span className={styles.tbd}>Por definir</span>
                                                )}
                                                <b>{sc ?? ''}</b>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                <div className={styles.bracketCol}>
                    <h3 className={styles.groupTitle}>Campeón</h3>
                    <div className={styles.bracketMatches}>
                        <div className={`${styles.bMatch} ${styles.bChamp}`}>
                            <div className={styles.bTeam}>
                                {s.champion ? (
                                    <>
                                        <FlagIcon code={flagOf(s.champion)} size={14} /> <span>{nameOf(s.champion)}</span>
                                    </>
                                ) : (
                                    <span className={styles.tbd}>Por definir</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ===================== el juego ===================== */

/** Trofeo genérico en pixel art (no es ninguna copa real). */
function Trophy({ size = 96 }: { size?: number }) {
    return (
        <svg viewBox="0 0 16 18" width={size} height={(size * 18) / 16} shapeRendering="crispEdges" aria-hidden="true" className={styles.trophy}>
            <rect x="3" y="1" width="10" height="1" fill="#fff3b0" />
            <rect x="2" y="2" width="12" height="5" fill="#f2c230" />
            <rect x="3" y="7" width="10" height="2" fill="#e0a91c" />
            <rect x="4" y="9" width="8" height="1" fill="#c98e10" />
            <rect x="0" y="2" width="2" height="1" fill="#e0a91c" />
            <rect x="0" y="3" width="1" height="3" fill="#e0a91c" />
            <rect x="1" y="6" width="2" height="1" fill="#e0a91c" />
            <rect x="14" y="2" width="2" height="1" fill="#e0a91c" />
            <rect x="15" y="3" width="1" height="3" fill="#e0a91c" />
            <rect x="13" y="6" width="2" height="1" fill="#e0a91c" />
            <rect x="4" y="3" width="2" height="3" fill="#fff3b0" />
            <rect x="7" y="10" width="2" height="3" fill="#c98e10" />
            <rect x="5" y="13" width="6" height="1" fill="#e0a91c" />
            <rect x="4" y="14" width="8" height="3" fill="#5b3a1e" />
            <rect x="5" y="15" width="6" height="1" fill="#f2c230" />
        </svg>
    );
}

/** Festejo de campeón: el plantel salta alrededor del trofeo, con papelitos. */
function ChampionCelebration({ team, titles, coach, onClose }: { team: SevenTeam; titles: string[]; coach?: string; onClose: () => void }) {
    const players = team.players.slice(0, 6);
    return (
        <div className={styles.celebrate} role="dialog" aria-label={`${team.name} campeón`}>
            <div className={styles.confetti} aria-hidden="true">
                {Array.from({ length: 28 }, (_, i) => (
                    <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.35}s`, background: [team.kit.shirt, team.kit.shirt2, '#f2c230', '#ffffff'][i % 4] }} />
                ))}
            </div>
            <strong className={styles.celebrateTitle}>CAMPEONES</strong>
            <span className={styles.celebrateClub}>{team.name}</span>
            <div className={styles.celebrateStage}>
                {players.slice(0, 3).map((look, i) => (
                    <span key={`a${i}`} className={styles.celebrateJump} style={{ animationDelay: `${i * 0.18}s` }}>
                        <SpritePreview look={look} kit={team.kit} scale={4} celebrating />
                    </span>
                ))}
                <span className={styles.celebrateCup}>
                    <Trophy size={88} />
                </span>
                {players.slice(3, 6).map((look, i) => (
                    <span key={`b${i}`} className={styles.celebrateJump} style={{ animationDelay: `${(i + 3) * 0.18}s` }}>
                        <SpritePreview look={look} kit={team.kit} scale={4} celebrating />
                    </span>
                ))}
            </div>
            <span className={styles.celebrateTitles}>{titles.join(' · ')}</span>
            {coach && <span className={styles.celebrateCoach}>Entrenador: {coach}</span>}
            <button type="button" className={styles.btnPrimary} onClick={onClose}>
                Seguir ▶
            </button>
        </div>
    );
}

export default function SevenGame({ musicSrc = null, menuMusicSrc = null }: { musicSrc?: string | null; menuMusicSrc?: string | null }) {
    const [screen, setScreen] = useState<Screen>({ k: 'menu' });
    const [customTeams, setCustomTeams] = useState<SevenTeam[]>([]);
    const [cup, setCup] = useState<CupProgress | null>(null);
    /** Las partidas de torneo guardadas; `slot` es la que está abierta. */
    const [tours, setTours] = useState<(TourState | null)[]>(() => Array(TOUR_SLOTS).fill(null));
    const [slot, setSlot] = useState(0);
    const tour = tours[slot] ?? null;
    /** Borrar pide confirmar: guarda qué partida está esperando el sí. */
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
    const [mine, setMine] = useState<string | null>('nat-arg');
    const [rival, setRival] = useState<string | null>('nat-nzl');
    const [activeSlot, setActiveSlot] = useState<'mine' | 'rival'>('mine');
    /** Categoría abierta en la elección de torneo (null = las tarjetas de categoría). */
    const [tourCat, setTourCat] = useState<string | null>(null);
    const [difficulty, setDifficulty] = useState<Difficulty>('normal');
    const [duration, setDuration] = useState<Duration>(3);
    const [otherKey, setOtherKey] = useState<string | null>(null);
    const [nacPick, setNacPick] = useState<NacFormat | null>(null);
    const [coachName, setCoachName] = useState('');
    const [celebratedKey, setCelebratedKey] = useState<string | null>(null);
    const [palmaresKey, setPalmaresKey] = useState<string | null>(null);
    const [hubTab, setHubTab] = useState<'tabla' | 'calendario' | 'cuadro' | 'resultados' | 'goleadores' | 'otros' | 'plantel' | 'palmares' | 'camino' | 'carrera'>('tabla');
    /** Torneo que se está armando (de fábrica, con reemplazos o personalizado). */
    const [setupDef, setSetupDef] = useState<TourDef | null>(null);
    const [customFormat, setCustomFormat] = useState(0);
    const [customField, setCustomField] = useState<string[]>(['ARG', 'URU', 'CHI', 'BRA']);
    const [customZone, setCustomZone] = useState(0);
    const [showField, setShowField] = useState(false);

    // Guardado en la cuenta: copia lo del navegador para seguir en otro dispositivo.
    const { user } = useAuth();
    const syncRef = useRef<CloudSync | null>(null);
    const [cloud, setCloud] = useState<CloudStatus>('off');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const saved = loadSaved();
        const list = saved.tours.map((t) => (t ? settleCareer(t) : null));
        setCustomTeams(saved.customTeams);
        setCup(saved.cup);
        setTours(list);
        const sync = new CloudSync(setCloud);
        sync.seed({ customTeams: saved.customTeams, cup: saved.cup, tours: list });
        syncRef.current = sync;
        setLoaded(true);
        // Al cerrar o esconder la pestaña sale lo que haya quedado pendiente.
        const out = () => void sync.flush(true);
        const onHide = () => {
            if (document.visibilityState === 'hidden') out();
        };
        window.addEventListener('pagehide', out);
        document.addEventListener('visibilitychange', onHide);
        return () => {
            window.removeEventListener('pagehide', out);
            document.removeEventListener('visibilitychange', onHide);
            out();
        };
    }, []);

    // Con sesión: se junta lo de la cuenta con lo del navegador (gana lo más nuevo de cada partida).
    const userId = user?.id ?? null;
    useEffect(() => {
        const sync = syncRef.current;
        if (!loaded || !userId || !sync) return;
        let alive = true;
        const local = loadSaved();
        void sync.connect({ customTeams: local.customTeams, cup: local.cup, tours: local.tours }).then((remote) => {
            if (!alive || !remote) return;
            const list = remote.tours.map((t) => (t ? settleCareer(t) : null));
            setCustomTeams(remote.customTeams);
            setCup(remote.cup);
            setTours(list);
            saveSaved({ customTeams: remote.customTeams, cup: remote.cup, tours: list });
        });
        return () => {
            alive = false;
        };
    }, [loaded, userId]);

    // Música de los menús: suena en todo lo que no es el partido (el partido tiene la suya).
    // Los navegadores no dejan arrancar audio solo: empieza con el primer toque o tecla.
    const menuAudio = useRef<HTMLAudioElement>(null);
    const [menuMuted, setMenuMuted] = useState(false);
    useEffect(() => {
        try {
            setMenuMuted(localStorage.getItem('g22-rugby-seven-menu-muted') === '1');
        } catch {
            // Sin localStorage: arranca con música.
        }
    }, []);
    const toggleMenuMusic = () => {
        setMenuMuted((m) => {
            try {
                localStorage.setItem('g22-rugby-seven-menu-muted', m ? '0' : '1');
            } catch {
                // Sin localStorage: vale para esta visita.
            }
            return !m;
        });
    };
    const matchOn = screen.k === 'match';
    useEffect(() => {
        const a = menuAudio.current;
        if (!a) return;
        if (matchOn || menuMuted) {
            a.pause();
            return;
        }
        a.volume = 0.45;
        const start = () => void a.play().catch(() => {});
        start();
        window.addEventListener('pointerdown', start, { once: true });
        window.addEventListener('keydown', start, { once: true });
        return () => {
            window.removeEventListener('pointerdown', start);
            window.removeEventListener('keydown', start);
        };
    }, [matchOn, menuMuted]);

    // Cada vez que el juego guarda, se anota qué partida cambió (y se sube unos segundos después).
    useEffect(() => {
        if (loaded) syncRef.current?.changed({ customTeams, cup, tours });
    }, [loaded, customTeams, cup, tours]);

    // El juego es la pantalla: mientras está abierto, la página de atrás no scrollea.
    useEffect(() => {
        const html = document.documentElement;
        const prev = [html.style.overflow, document.body.style.overflow];
        html.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        return () => {
            html.style.overflow = prev[0];
            document.body.style.overflow = prev[1];
        };
    }, []);

    /** Categorías del primer nivel: el Mundial, las zonas, los inventados y los propios. */
    const categories = useMemo<Category[]>(() => {
        const wc = TOURS[0].teams.map((c) => NATION_BY_CODE[c]).filter(Boolean).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        // Internacional → continente → selección. Cuando entren los clubes, son otro tipo más.
        const byRating = (a: SevenTeam, b: SevenTeam) => (b.rating ?? 0) - (a.rating ?? 0);
        return [
            ...ZONES.map((z) => ({ name: z, group: 'Internacional', kind: 'Continente', teams: NATIONS.filter((t) => NATION_ZONE[t.id] === z).sort(byRating) })),
            { name: 'Mundial 2027', group: 'Internacional', kind: 'Continente', teams: wc },
            ...CLUB_LEAGUES.map((l) => ({ name: l.name, group: 'Clubes', kind: 'Liga', teams: l.teams })),
            ...AR_DIVISIONS_PLAYABLE.map((d) => ({ name: d.label, group: 'Argentina', kind: 'División', teams: d.clubs.map((id) => teamOfCode(id)).filter((t): t is SevenTeam => !!t) })),
            { name: 'Inventados', teams: PRESET_TEAMS },
            { name: 'Mis equipos', teams: customTeams },
        ];
    }, [customTeams]);

    const allTeams = useMemo(() => [...customTeams, ...NATIONS, ...CLUBS, ...AR_CLUBS, ...PRESET_TEAMS], [customTeams]);
    // Nivel de los equipos propios y, en una carrera, lo que cada club ganó o perdió con las temporadas.
    setRatingContext(Object.fromEntries(customTeams.map((t) => [t.id, t.rating ?? 70])), tour?.career ? careerBoosts(tour.career) : undefined);
    const byId = (id: string | null) => {
        const t = allTeams.find((x) => x.id === id) ?? null;
        if (!t) return t;
        // En una carrera: el plantel de este año (retiros, cantera, nombres editados) y el nivel que ganó o perdió.
        const names = tour?.career ? careerNames(tour.career, t) : null;
        const boosted = ratingBoost(t.id) ? Math.round(ratingOf(t.id)) : null;
        if (!names && boosted === null) return t;
        return { ...t, ...(boosted !== null ? { rating: boosted } : {}), ...(names ? { names } : {}) };
    };
    /** Nombre completo de un jugador de un equipo, para las tablas de goleadores. */
    const playerName = (team: string, slot: number) => {
        const t = byId(team);
        if (!t) return '—';
        const n = playerNames(t)[slot];
        return n ? `${n.first} ${n.last}`.trim() : '—';
    };
    const nameOf = (id: string) => byId(id)?.name ?? 'Equipo borrado';
    const flagOf = (id: string) => byId(id)?.flag;
    const cupLive = !!cup && !cup.eliminated && cup.round < 3;
    const tourLive = !!tour && !tour.done && !tour.eliminated;
    const tourDef = tour ? defOf(tour) : null;
    const savedCount = tours.filter(Boolean).length;

    const persist = (next: { teams?: SevenTeam[]; cup?: CupProgress | null; tour?: TourState | null }) => {
        const teams = next.teams ?? customTeams;
        const c = next.cup !== undefined ? next.cup : cup;
        const list = [...tours];
        // Una etapa de la carrera que terminó se asienta una vez: el cartel y el avance leen lo mismo.
        if (next.tour !== undefined) list[slot] = next.tour ? settleCareer(next.tour) : null;
        setCustomTeams(teams);
        setCup(c);
        setTours(list);
        saveSaved({ customTeams: teams, cup: c, tours: list });
    };

    const play = (cfg: MatchConfig, mode: Mode) => {
        setScreen({ k: 'match', cfg, mode, nonce: nextNonce() });
    };

    const startQuick = () => {
        const home = byId(mine);
        const away = byId(rival);
        if (!home || !away) return;
        play({ home, away, difficulty, minutes: duration, suddenDeath: false }, 'quick');
    };

    const startCup = () => {
        const me = byId(mine);
        if (!me) return;
        const pool = shuffled(allTeams.filter((t) => t.id !== me.id).map((t) => t.id));
        persist({ cup: { teamId: me.id, opponents: pool.slice(0, 3), round: 0, eliminated: false, results: [], difficulty, duration } });
        setScreen({ k: 'cup' });
    };

    const playCupMatch = () => {
        if (!cup) return;
        const home = byId(cup.teamId);
        const away = byId(cup.opponents[cup.round]);
        if (!home || !away) return;
        play({ home, away, difficulty: cup.difficulty, minutes: cup.duration, suddenDeath: true }, 'cup');
    };

    const startTour = (def: TourDef) => {
        if (!mine) return;
        persist({ tour: createTour(def, mine, difficulty, duration) });
        setHubTab('tabla');
        setScreen({ k: 'tour' });
    };

    const playTourMatch = () => {
        if (!tour) return;
        const opp = nextOpponent(tour);
        if (!opp) {
            persist({ tour: closeRound(tour, null) });
            return;
        }
        const home = byId(tour.me);
        const away = byId(opp);
        if (!home || !away) return;
        play({ home, away, difficulty: tour.difficulty, minutes: tour.duration, suddenDeath: tour.stage === 'ko' }, 'tour');
    };

    /** Simula el partido del usuario (o todos los que le quedan en la etapa) con el nivel de cada equipo. */
    const simTourMatch = (all: boolean) => {
        if (!tour) return;
        let s = tour;
        for (let guard = 0; guard < 200 && !s.done && !s.eliminated; guard++) {
            const o = nextOpponent(s);
            s = closeRound(s, o ? simulate(s.me, o, s.stage === 'ko') : null);
            if (!all && o) break;
        }
        persist({ tour: s });
    };

    const startRoad = () => {
        if (!mine) return;
        persist({ tour: createRoad(mine, difficulty, duration) });
        setHubTab('tabla');
        setScreen({ k: 'tour' });
    };

    const startCareer = () => {
        if (!mine) return;
        persist({ tour: createCareer(mine, difficulty, duration, coachName) });
        setHubTab('tabla');
        setScreen({ k: 'tour' });
    };

    const nextCareerStage = (format?: NacFormat) => {
        if (!tour) return;
        persist({ tour: advanceCareer(tour, format) });
        setNacPick(null);
        setHubTab('tabla');
    };

    const nextRoadStage = () => {
        if (!tour) return;
        persist({ tour: advanceRoad(tour) });
        setHubTab('tabla');
    };

    /** Dificultad y duración se pueden cambiar con el torneo empezado: valen desde el próximo partido. */
    const setTourOptions = (patch: { difficulty?: Difficulty; duration?: Duration }) => {
        if (tour) persist({ tour: { ...tour, ...patch } });
    };

    const onFinish = (cfg: MatchConfig, mode: Mode, score: [number, number], log: MatchEvent[] = []) => {
        if (mode === 'cup' && cup) {
            const won = score[0] > score[1];
            persist({
                cup: {
                    ...cup,
                    results: [...cup.results, { opp: cfg.away.id, us: score[0], them: score[1] }],
                    round: won ? cup.round + 1 : cup.round,
                    eliminated: !won,
                },
            });
        }
        if (mode === 'tour' && tour) {
            // Los tantos del partido jugado, con su autor: el local (lado 0) es siempre el club del usuario.
            const events: ScoreEvent[] = log.filter((e) => e.stat).map((e) => ({ team: e.side === 0 ? cfg.home.id : cfg.away.id, slot: e.stat!.slot, kind: e.stat!.kind }));
            persist({ tour: closeRound(tour, score, events) });
        }
        setScreen({ k: 'result', cfg, mode, score });
    };

    const newTeam = makeNewTeam;

    const saveTeam = (t: SevenTeam) => {
        const exists = customTeams.some((c) => c.id === t.id);
        persist({ teams: exists ? customTeams.map((c) => (c.id === t.id ? t : c)) : [t, ...customTeams] });
        setScreen({ k: 'teams' });
    };

    const deleteTeam = (id: string) => {
        const cupUsesIt = !!cup && (cup.teamId === id || cup.opponents.includes(id));
        // Las partidas que jugaban con ese equipo se borran con él.
        const list = tours.map((t) => (t && t.me === id ? null : t));
        const teams = customTeams.filter((c) => c.id !== id);
        const c = cupUsesIt ? null : cup;
        setCustomTeams(teams);
        setCup(c);
        setTours(list);
        saveSaved({ customTeams: teams, cup: c, tours: list });
        if (mine === id) setMine('nat-arg');
        if (rival === id) setRival('nat-nzl');
    };

    /* ---- teclado en los menús: flechas para mover, Enter para entrar ---- */
    const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[wrap(i + (e.key === 'ArrowDown' ? 1 : -1), btns.length)]?.focus();
        e.preventDefault();
    };

    const inMatch = screen.k === 'match';
    const quickMissing = !mine || !rival || mine === rival;
    const btn = (label: string, onClick: () => void, primary = false, disabled = false) => (
        <button type="button" className={primary ? styles.btnPrimary : styles.backBtn} onClick={onClick} disabled={disabled}>
            {label}
        </button>
    );

    const titles: Partial<Record<Screen['k'], string>> = {
        quick: 'Partido rápido',
        slots: 'Partidas guardadas',
        tourPick: `Torneos · partida ${slot + 1}`,
        tourSetup: setupDef?.name ?? 'Torneo',
        customSetup: 'Torneo personalizado',
        roadSetup: 'Road to Rugby World Cup',
        careerSetup: 'Modo carrera',
        tour: tourDef?.name ?? 'Torneo',
        cupSetup: 'Copa Seven',
        cup: 'Copa Seven',
        teams: 'Mis equipos',
        edit: 'Editor de equipo',
        result: 'Final del partido',
    };
    const stepOf = 'step' in screen ? screen.step : null;

    return (
        <div className={`${styles.page} ${pixel.className}`}>
            <div className={inMatch ? `${styles.shell} ${styles.shellMatch}` : styles.shell}>
                {/* En el partido la cancha se queda con toda la pantalla: el título queda para lectores de pantalla y salir está en la pausa. */}
                {inMatch && <h1 className={styles.srOnly}>Rugby Seven</h1>}
                {!inMatch && (
                <header className={styles.bar}>
                    <h1 className={screen.k === 'menu' ? styles.srOnly : styles.titleSmall}>Rugby Seven</h1>
                    {screen.k !== 'menu' && !inMatch && (
                        <span className={styles.barTitle}>
                            {titles[screen.k]}
                            {stepOf && <small> · paso {stepOf} de 2</small>}
                        </span>
                    )}
                    {menuMusicSrc && (
                        <button
                            type="button"
                            className={`${styles.exitBtn} ${styles.musicBtn}`}
                            onClick={toggleMenuMusic}
                            aria-label={menuMuted ? 'Prender la música' : 'Silenciar la música'}
                            aria-pressed={!menuMuted}
                        >
                            {menuMuted ? '×♪' : '♪'}
                        </button>
                    )}
                    <Link href="/juegos/minijuegos" className={styles.exitBtn}>
                        ✕ Salir
                    </Link>
                </header>
                )}
                {menuMusicSrc && <audio ref={menuAudio} src={menuMusicSrc} loop preload="auto" />}

                {screen.k === 'menu' && (
                    <div className={styles.menuScreen}>
                        <div className={styles.logo}>
                            <p className={styles.title} aria-hidden="true">Rugby Seven</p>
                            <p className={styles.subtitle}>Siete contra siete · pelota en mano · siempre para adelante</p>
                        </div>
                        <div className={styles.runway} aria-hidden="true">
                            <div className={styles.runners}>
                                {(['ARG', 'NZL', 'FRA', 'FIJ', 'RSA', 'JPN'] as const).map((c, i) => {
                                    const t = teamOfCode(c);
                                    return <SpritePreview key={c} look={t.players[i % 7]} kit={t.kit} scale={4} running />;
                                })}
                            </div>
                        </div>
                        <div className={styles.menu} onKeyDown={onMenuKey} role="menu" aria-label="Menú principal">
                            <button type="button" role="menuitem" className={styles.menuBtn} onClick={() => setScreen({ k: 'quick', step: 1 })}>
                                <span className={styles.menuIcon} aria-hidden="true">▶</span>
                                <strong>Partido rápido</strong>
                                <span>Elegís los dos equipos y a la cancha.</span>
                            </button>
                            <button type="button" role="menuitem" className={styles.menuBtn} onClick={() => setScreen({ k: 'slots' })}>
                                <span className={styles.menuIcon} aria-hidden="true">★</span>
                                <strong>Torneos</strong>
                                <span>{savedCount ? `${savedCount} de ${TOUR_SLOTS} partidas guardadas.` : 'Selecciones, clubes de Europa y del sur, y el rugby argentino.'}</span>
                            </button>
                            {(() => {
                                // Si ya hay una carrera guardada, este botón la retoma; si no, arranca una en la primera partida libre.
                                const careerSlot = tours.findIndex((t) => !!t?.career);
                                const live = careerSlot >= 0 ? tours[careerSlot]?.career : null;
                                return (
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={styles.menuBtn}
                                        onClick={() => {
                                            if (live) {
                                                setSlot(careerSlot);
                                                setHubTab('tabla');
                                                setScreen({ k: 'tour' });
                                                return;
                                            }
                                            const free = tours.findIndex((t) => !t);
                                            if (free < 0) {
                                                setScreen({ k: 'slots' });
                                                return;
                                            }
                                            setSlot(free);
                                            setScreen({ k: 'careerSetup', step: 1 });
                                        }}
                                    >
                                        <span className={styles.menuIcon} aria-hidden="true">◆</span>
                                        <strong>{live ? 'Seguir la carrera' : 'Modo carrera'}</strong>
                                        <span>
                                            {live
                                                ? `${nameOf(live.me)} · temporada ${live.season} · ${divisionLabel(divisionOf(live, live.me) ?? '')}.`
                                                : tours.some((t) => !t)
                                                  ? 'Un club argentino, varias temporadas: ascensos, promociones, TDI y Nacional.'
                                                  : 'Las tres partidas están ocupadas: borrá una para empezar.'}
                                        </span>
                                    </button>
                                );
                            })()}
                            <button
                                type="button"
                                role="menuitem"
                                className={styles.menuBtn}
                                onClick={() => {
                                    // Arranca en la primera partida libre; si están las tres ocupadas, a elegir cuál borrar.
                                    const free = tours.findIndex((t) => !t);
                                    if (free < 0) {
                                        setScreen({ k: 'slots' });
                                        return;
                                    }
                                    setSlot(free);
                                    setScreen({ k: 'roadSetup', step: 1 });
                                }}
                            >
                                <span className={styles.menuIcon} aria-hidden="true">⚑</span>
                                <strong>Road to Rugby World Cup</strong>
                                <span>{tours.some((t) => !t) ? 'Llevá una selección del clasificatorio al Mundial.' : 'Las tres partidas están ocupadas: borrá una para empezar.'}</span>
                            </button>
                            <button type="button" role="menuitem" className={styles.menuBtn} onClick={() => setScreen(cupLive ? { k: 'cup' } : { k: 'cupSetup', step: 1 })}>
                                <span className={styles.menuIcon} aria-hidden="true">♛</span>
                                <strong>{cupLive ? 'Seguir la Copa Seven' : 'Copa Seven'}</strong>
                                <span>{cupLive && cup ? `Te toca: ${CUP_ROUNDS[cup.round].toLowerCase()}.` : 'Cuartos, semi y final contra rivales al azar.'}</span>
                            </button>
                            <button type="button" role="menuitem" className={styles.menuBtn} onClick={() => setScreen({ k: 'teams' })}>
                                <span className={styles.menuIcon} aria-hidden="true">✎</span>
                                <strong>Mis equipos</strong>
                                <span>Armá tu camiseta y tu plantel de siete.</span>
                            </button>
                        </div>
                    </div>
                )}

                {screen.k === 'quick' && screen.step === 1 && (
                    <div className={styles.body}>
                        <div className={styles.versus}>
                            <TeamChooser label="Tu equipo" teamId={mine} onChange={setMine} categories={categories} avoid={rival} active={activeSlot === 'mine'} onActivate={() => setActiveSlot('mine')} />
                            <div className={styles.vsBadge} aria-hidden="true">VS</div>
                            <TeamChooser label="Rival" teamId={rival} onChange={setRival} categories={categories} avoid={mine} active={activeSlot === 'rival'} onActivate={() => setActiveSlot('rival')} />
                        </div>
                        <div className={styles.footerBtns}>
                            {btn('◀ Menú', () => setScreen({ k: 'menu' }))}
                            {quickMissing && <span className={styles.missing}>Elegí un rival distinto de tu equipo.</span>}
                            {btn('Siguiente ▶', () => setScreen({ k: 'quick', step: 2 }), true, quickMissing)}
                        </div>
                    </div>
                )}

                {screen.k === 'quick' && screen.step === 2 && (
                    <div className={styles.body}>
                        <SettingsStep teams={[byId(mine), byId(rival)]} difficulty={difficulty} setDifficulty={setDifficulty} duration={duration} setDuration={setDuration} />
                        <div className={styles.footerBtns}>
                            {btn('◀ Equipos', () => setScreen({ k: 'quick', step: 1 }))}
                            {btn('Jugar ▶', startQuick, true)}
                        </div>
                    </div>
                )}

                {screen.k === 'slots' && (
                    <div className={styles.body}>
                        <div className={styles.slotList}>
                            {tours.map((t, i) => {
                                const d = t ? defOf(t) : null;
                                const me = t ? byId(t.me) : null;
                                const finished = !!t && !t.career && (t.road ? t.road.out || (t.road.phase === 'wc' && t.done) : t.done || t.eliminated);
                                return (
                                    <section key={i} className={`${styles.saveSlot} ${i === slot && t ? styles.saveSlotOn : ''}`} aria-label={`Partida ${i + 1}`}>
                                        <header className={styles.slotHead}>Partida {i + 1}</header>
                                        {t && d ? (
                                            <>
                                                <strong className={styles.saveTitle}>{t.road ? 'Road to Rugby World Cup' : t.career ? `Carrera · temporada ${t.career.season}` : d.name}</strong>
                                                <span className={styles.saveTeam}>
                                                    <FlagIcon code={me?.flag} size={20} /> {me?.name ?? 'Equipo borrado'}
                                                </span>
                                                <span className={styles.saveMeta}>{t.road ? `${PHASE_LABEL[t.road.phase]} · ${d.name}` : t.career ? `${CAREER_PHASE_LABEL[t.career.phase]} · ${d.name}` : d.formatLabel}</span>
                                                <span className={styles.saveMeta}>
                                                    {finished ? (t.champion === t.me ? 'Terminada · campeón' : 'Terminada') : roundLabel(t)} · {DIFFICULTIES.find((x) => x.id === t.difficulty)?.label} · {t.duration} min
                                                </span>
                                                <div className={styles.saveBtns}>
                                                    {confirmDelete === i ? (
                                                        <>
                                                            <button type="button" className={styles.backBtn} onClick={() => setConfirmDelete(null)}>
                                                                No
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={styles.dangerBtn}
                                                                onClick={() => {
                                                                    const list = [...tours];
                                                                    list[i] = null;
                                                                    setTours(list);
                                                                    saveSaved({ customTeams, cup, tours: list });
                                                                    setConfirmDelete(null);
                                                                }}
                                                            >
                                                                Sí, borrar
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button type="button" className={styles.backBtn} onClick={() => setConfirmDelete(i)}>
                                                                Borrar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={styles.btnPrimary}
                                                                onClick={() => {
                                                                    setSlot(i);
                                                                    setHubTab('tabla');
                                                                    setScreen({ k: 'tour' });
                                                                }}
                                                            >
                                                                {finished ? 'Ver' : 'Seguir ▶'}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                                {confirmDelete === i && <small className={styles.saveMeta}>Se pierde la partida. No se puede deshacer.</small>}
                                            </>
                                        ) : (
                                            <>
                                                <span className={styles.saveMeta}>Vacía</span>
                                                <div className={styles.saveBtns}>
                                                    <button
                                                        type="button"
                                                        className={styles.backBtn}
                                                        onClick={() => {
                                                            setSlot(i);
                                                            setScreen({ k: 'roadSetup', step: 1 });
                                                        }}
                                                    >
                                                        Camino al Mundial
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.btnPrimary}
                                                        onClick={() => {
                                                            setSlot(i);
                                                            setTourCat(null);
                                                            setScreen({ k: 'tourPick' });
                                                        }}
                                                    >
                                                        Nuevo torneo ▶
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </section>
                                );
                            })}
                        </div>
                        <div className={styles.footerBtns}>
                            {btn('◀ Menú', () => setScreen({ k: 'menu' }))}
                            <span className={styles.missing}>
                                Salir de un torneo lo deja guardado: lo retomás desde acá.{' '}
                                {!user
                                    ? 'Iniciá sesión para guardarlas también en tu cuenta y seguir en otro dispositivo.'
                                    : cloud === 'syncing'
                                      ? 'Guardando en tu cuenta…'
                                      : cloud === 'error'
                                        ? 'No se pudo guardar en tu cuenta: queda en este dispositivo y se reintenta solo.'
                                        : cloud === 'saved'
                                          ? 'Guardadas también en tu cuenta.'
                                          : ''}
                            </span>
                        </div>
                    </div>
                )}

                {screen.k === 'tourPick' && (() => {
                    // Primero la categoría (tarjetas); adentro, sus torneos (tarjetas también).
                    const pickTour = (d: TourDef) => {
                        const field = d.teams.map((c) => teamOfCode(c)?.id);
                        if (!mine || !field.includes(mine)) setMine(field[0] ?? null);
                        setSetupDef(d);
                        setShowField(false);
                        setScreen({ k: 'tourSetup', step: 1 });
                    };
                    if (!tourCat) {
                        return (
                            <div className={styles.body}>
                                <div className={styles.cardGrid}>
                                    {TOUR_CATS.map((c) => {
                                        const n = TOURS.filter((t) => catOf(t) === c.id).length;
                                        return (
                                            <button key={c.id} type="button" className={styles.pickCard} onClick={() => setTourCat(c.id)}>
                                                <strong>{c.id}</strong>
                                                <span>{c.sub}</span>
                                                <small>{n} {n === 1 ? 'torneo' : 'torneos'}</small>
                                            </button>
                                        );
                                    })}
                                    <button type="button" className={`${styles.pickCard} ${styles.pickCardAlt}`} onClick={() => setScreen({ k: 'customSetup' })}>
                                        <strong>Personalizado</strong>
                                        <span>Elegís el formato y los equipos: selecciones o clubes.</span>
                                        <small>Armalo vos</small>
                                    </button>
                                </div>
                                <div className={styles.footerBtns}>
                                    {btn('◀ Partidas', () => setScreen({ k: 'slots' }))}
                                </div>
                            </div>
                        );
                    }
                    const list = TOURS.filter((t) => catOf(t) === tourCat);
                    return (
                        <div className={styles.body}>
                            <h2 className={styles.pickTitle}>{tourCat}</h2>
                            <div className={styles.cardGrid}>
                                {tourCat === 'Argentina' && (
                                    <button type="button" className={`${styles.pickCard} ${styles.pickCardAlt}`} onClick={() => setScreen({ k: 'careerSetup', step: 1 })}>
                                        <strong>Modo carrera</strong>
                                        <span>Un club, varias temporadas: ascensos, descensos, plazas del Torneo del Interior y el Nacional.</span>
                                        <small>Elegí tu club</small>
                                    </button>
                                )}
                                {list.map((d) => (
                                    <button key={d.id} type="button" className={styles.pickCard} onClick={() => pickTour(d)}>
                                        <strong>{d.name}</strong>
                                        <span>{d.sub}</span>
                                        <small>{d.formatLabel}</small>
                                        <span className={styles.cardFlags} aria-hidden="true">
                                            {d.teams.slice(0, 8).map((c) => (
                                                <i key={c} style={{ background: teamOfCode(c)?.kit.shirt }} />
                                            ))}
                                            {d.teams.length > 8 && <em>+{d.teams.length - 8}</em>}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <div className={styles.footerBtns}>
                                {btn('◀ Categorías', () => setTourCat(null))}
                            </div>
                        </div>
                    );
                })()}

                {screen.k === 'careerSetup' && (() => {
                    // Cualquier club argentino, de cualquier división: la carrera arranca donde juega en 2026.
                    const arCats: Category[] = AR_DIVISIONS_PLAYABLE.map((d) => ({ name: d.label, group: 'Argentina', kind: 'División', teams: d.clubs.map((id) => teamOfCode(id)).filter((t): t is SevenTeam => !!t) }));
                    const valid = !!mine && mine.startsWith('ar-');
                    return screen.step === 1 ? (
                        <div className={styles.body}>
                            <div className={styles.single}>
                                <TeamChooser label="Tu club" teamId={valid ? mine : null} onChange={setMine} categories={arCats} />
                                <p className={styles.note}>
                                    Jugás la división de tu club temporada tras temporada: ascensos y descensos, el Torneo del Interior con las plazas de tu región, y el Nacional de Clubes si salís campeón del Top 14 o del TDI A.
                                </p>
                            </div>
                            <div className={styles.footerBtns}>
                                {btn('◀ Argentina', () => setScreen({ k: 'tourPick' }))}
                                {!valid && <span className={styles.missing}>Elegí un club argentino.</span>}
                                {btn('Siguiente ▶', () => setScreen({ k: 'careerSetup', step: 2 }), true, !valid)}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.body}>
                            <label className={styles.coachField}>
                                <span>Nombre del entrenador</span>
                                <input
                                    value={coachName}
                                    onChange={(e) => setCoachName(e.target.value.slice(0, 40))}
                                    placeholder="Tu nombre (va al palmarés)"
                                    maxLength={40}
                                    autoComplete="off"
                                />
                            </label>
                            <SettingsStep teams={[byId(mine)]} difficulty={difficulty} setDifficulty={setDifficulty} duration={duration} setDuration={setDuration} />
                            <p className={styles.note}>Se guarda en la partida {slot + 1}{tour ? ', en lugar de la que había' : ''}.</p>
                            <div className={styles.footerBtns}>
                                {btn('◀ Club', () => setScreen({ k: 'careerSetup', step: 1 }))}
                                {btn('Empezar la carrera ▶', startCareer, true, !valid)}
                            </div>
                        </div>
                    );
                })()}

                {screen.k === 'customSetup' && (() => {
                    const fmt = CUSTOM_FORMATS[customFormat];
                    const pools = [...ZONES.map((z) => ({ name: z as string, teams: NATIONS.filter((t) => NATION_ZONE[t.id] === z).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)) })), ...CLUB_LEAGUES.map((l) => ({ name: l.name, teams: l.teams })), ...AR_DIVISIONS_PLAYABLE.map((d) => ({ name: d.label, teams: d.clubs.map((id) => teamOfCode(id)).filter((t): t is SevenTeam => !!t) }))];
                    const pool = pools[wrap(customZone, pools.length)];
                    const zone = pool.name;
                    const zoneTeams = pool.teams;
                    const ok = fmt.valid(customField.length);
                    const toggle = (c: string) => setCustomField((f) => (f.includes(c) ? f.filter((x) => x !== c) : f.length >= 64 ? f : [...f, c]));
                    return (
                        <div className={styles.body}>
                            <div className={styles.customGrid}>
                                <div className={styles.customCol}>
                                    <ArrowSelect
                                        big
                                        label="Formato"
                                        value={fmt.label}
                                        sub={fmt.hint}
                                        onPrev={() => setCustomFormat(wrap(customFormat - 1, CUSTOM_FORMATS.length))}
                                        onNext={() => setCustomFormat(wrap(customFormat + 1, CUSTOM_FORMATS.length))}
                                    />
                                    <div className={styles.customPicked}>
                                        <strong>{customField.length} elegidas</strong>
                                        <span className={styles.tourFlags}>
                                            {customField.map((c) => (
                                                <button key={c} type="button" className={styles.chipBtn} onClick={() => toggle(c)} aria-label={`Sacar a ${teamOfCode(c)?.name ?? c}`}>
                                                    <FlagIcon code={teamOfCode(c)?.flag} size={16} /> {teamOfCode(c)?.short ?? c} ✕
                                                </button>
                                            ))}
                                        </span>
                                    </div>
                                </div>
                                <div className={styles.customCol}>
                                    <ArrowSelect label="Continente o liga" value={zone} sub={`${zoneTeams.length} equipos`} onPrev={() => setCustomZone(wrap(customZone - 1, pools.length))} onNext={() => setCustomZone(wrap(customZone + 1, pools.length))} />
                                    <ul className={styles.pickList} aria-label={`Selecciones de ${zone}`}>
                                        {zoneTeams.map((t) => {
                                            const c = codeOfTeam(t);
                                            const on = customField.includes(c);
                                            return (
                                                <li key={t.id}>
                                                    <label className={on ? styles.pickOn : undefined}>
                                                        <input type="checkbox" checked={on} onChange={() => toggle(c)} />
                                                        <FlagIcon code={t.flag} size={16} /> {t.name}
                                                        <Level rating={t.rating} />
                                                    </label>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                            <div className={styles.footerBtns}>
                                {btn('◀ Torneos', () => setScreen({ k: 'tourPick' }))}
                                {!ok && <span className={styles.missing}>{fmt.need}</span>}
                                {btn('Elegir selección ▶', () => {
                                    const def: TourDef = {
                                        id: `custom-${customField.join('-')}`,
                                        name: 'Torneo personalizado',
                                        sub: `${customField.length} selecciones.`,
                                        formatLabel: fmt.label,
                                        teams: [...customField],
                                        source: 'custom',
                                        stage: fmt.stage,
                                    };
                                    const field = def.teams.map((c) => teamOfCode(c)?.id);
                                    if (!mine || !field.includes(mine)) setMine(field[0] ?? null);
                                    setSetupDef(def);
                                    setShowField(false);
                                    setScreen({ k: 'tourSetup', step: 1 });
                                }, true, !ok)}
                            </div>
                        </div>
                    );
                })()}

                {screen.k === 'roadSetup' && (() => {
                    const eligibleCats: Category[] = ZONES.map((z) => ({
                        name: z,
                        group: 'Internacional',
                        kind: 'Continente',
                        teams: NATIONS.filter((t) => NATION_ZONE[t.id] === z && roadEligible(t.id.replace(/^nat-/, '').toUpperCase())).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
                    }));
                    const meCode = mine ? mine.replace(/^nat-/, '').toUpperCase() : '';
                    const valid = !!mine && roadEligible(meCode);
                    const region = valid ? regionFor(meCode) : null;
                    const first = region ? regionalDef(region, meCode) : null;
                    return screen.step === 1 ? (
                        <div className={styles.body}>
                            <div className={styles.single}>
                                <TeamChooser label="Tu selección" teamId={valid ? mine : null} onChange={setMine} categories={eligibleCats} />
                                {first && region && (
                                    <p className={styles.note}>
                                        {regionName(region)}: arrancás en el {first.name}. {first.formatLabel}.
                                    </p>
                                )}
                            </div>
                            <div className={styles.footerBtns}>
                                {btn('◀ Partidas', () => setScreen({ k: 'slots' }))}
                                {!valid && <span className={styles.missing}>Elegí una selección que todavía no esté clasificada.</span>}
                                {btn('Siguiente ▶', () => setScreen({ k: 'roadSetup', step: 2 }), true, !valid)}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.body}>
                            <SettingsStep teams={[byId(mine)]} difficulty={difficulty} setDifficulty={setDifficulty} duration={duration} setDuration={setDuration} />
                            <div className={styles.roadInfo}>
                                <strong>Cómo se clasifica al Mundial 2027</strong>
                                <span>Ya están adentro las 12 del Mundial 2023: {AUTO_QUALIFIED.map((c) => NATION_BY_CODE[c]?.name ?? c).join(', ')}.</span>
                                <span>Los otros 12 lugares: 4 de Europa, 3 del Pacífico y Norteamérica, 1 de Sudamérica, 1 de África, 1 de Asia, 1 del repechaje Pacífico-Sudamérica y 1 del clasificatorio final.</span>
                            </div>
                            <p className={styles.note}>Se guarda en la partida {slot + 1}{tour ? ', en lugar de la que había' : ''}.</p>
                            <div className={styles.footerBtns}>
                                {btn('◀ Selección', () => setScreen({ k: 'roadSetup', step: 1 }))}
                                {btn('Empezar el camino ▶', startRoad, true, !valid)}
                            </div>
                        </div>
                    );
                })()}

                {screen.k === 'tourSetup' && setupDef && (() => {
                    const def = setupDef;
                    const field = def.teams.map((c) => teamOfCode(c)).filter((t): t is SevenTeam => !!t).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
                    const valid = !!mine && field.some((t) => t.id === mine);
                    const outside = (def.teams.some((c) => c.startsWith('ar-')) ? AR_CLUBS : def.teams.some((c) => c.startsWith('club-')) ? CLUBS : NATIONS).filter((t) => !def.teams.includes(codeOfTeam(t))).sort((a, b) => a.name.localeCompare(b.name));
                    return screen.step === 1 ? (
                        <div className={styles.body}>
                            <div className={styles.single}>
                                <TeamChooser label={`${def.name}: ${def.clubs ? "tu club" : "tu selección"}`} teamId={valid ? mine : null} onChange={setMine} categories={[{ name: def.name, teams: field }]} />
                                <button type="button" className={styles.btnGhost} onClick={() => setShowField((v) => !v)} aria-expanded={showField}>
                                    {showField ? 'Listo con los participantes' : `Reemplazar equipos (${def.teams.length})`}
                                </button>
                                {showField && (
                                    <ul className={styles.fieldList} aria-label="Participantes">
                                        {def.teams.map((c) => {
                                            const t = teamOfCode(c);
                                            return (
                                                <li key={c}>
                                                    <span><FlagIcon code={t?.flag} size={16} /> {t?.name ?? c}</span>
                                                    <select
                                                        aria-label={`Reemplazar a ${t?.name ?? c}`}
                                                        value=""
                                                        onChange={(e) => {
                                                            const inn = e.target.value;
                                                            if (!inn) return;
                                                            // Con un equipo cambiado deja de ser el de fábrica: se congela su definición.
                                                            setSetupDef({ ...replaceInDef(def, c, inn), id: def.source === 'custom' ? def.id : `${def.id}-mod` });
                                                            if (mine === t?.id) setMine(teamOfCode(inn)?.id ?? null);
                                                        }}
                                                    >
                                                        <option value="">Cambiar por…</option>
                                                        {outside.map((o) => (
                                                            <option key={o.id} value={codeOfTeam(o)}>{o.name}</option>
                                                        ))}
                                                    </select>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                            <div className={styles.footerBtns}>
                                {btn('◀ Torneos', () => setScreen({ k: 'tourPick' }))}
                                {!valid && <span className={styles.missing}>Elegí tu selección entre las que juegan.</span>}
                                {btn('Siguiente ▶', () => setScreen({ ...screen, step: 2 }), true, !valid)}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.body}>
                            <SettingsStep teams={[byId(mine)]} difficulty={difficulty} setDifficulty={setDifficulty} duration={duration} setDuration={setDuration} />
                            <p className={styles.note}>Se guarda en la partida {slot + 1}{tour ? ', en lugar de la que había' : ''}.</p>
                            <div className={styles.footerBtns}>
                                {btn('◀ Selección', () => setScreen({ ...screen, step: 1 }))}
                                {btn('Empezar el torneo ▶', () => startTour(def), true, !valid)}
                            </div>
                        </div>
                    );
                })()}

                {screen.k === 'tour' && tour && tourDef && (() => {
                    const opp = nextOpponent(tour);
                    const meTeam = byId(tour.me);
                    const oppTeam = opp ? byId(opp) : null;
                    const advance = tourDef.stage.kind === 'grupos' ? tourDef.stage.advance : 0;
                    const history = [...tour.koHistory].reverse().concat([...tour.groupHistory].reverse());
                    const onlyKo = tourDef.stage.kind === 'ko';
                    const road = tour.road ?? null;
                    const career = tour.career ?? null;
                    const verdict = road ? roadVerdict(tour) : career ? careerVerdict(tour) : null;
                    const tabs: ['tabla' | 'calendario' | 'cuadro' | 'resultados' | 'goleadores' | 'otros' | 'plantel' | 'palmares' | 'camino' | 'carrera', string][] = [
                        ...(onlyKo ? [] : [['tabla', tour.groups.length > 1 ? (tour.cross ? 'Conferencias' : 'Grupos') : 'Tabla'] as ['tabla', string]]),
                        ['calendario', 'Calendario'],
                        ...(tour.hasKo ? [['cuadro', 'Cuadro'] as ['cuadro', string]] : []),
                        ['resultados', 'Resultados'],
                        ...(road ? [['camino', 'Camino al Mundial'] as ['camino', string]] : []),
                        ...(tour.stats ? [['goleadores', 'Goleadores'] as ['goleadores', string]] : []),
                        ...(career?.others ? [['otros', 'Otros torneos'] as ['otros', string]] : []),
                        ...(career?.rosters ? [['plantel', 'Plantel'] as ['plantel', string]] : []),
                        ...(career ? [['palmares', 'Palmarés'] as ['palmares', string]] : []),
                        ...(career ? [['carrera', 'Carrera'] as ['carrera', string]] : []),
                    ];
                    const tab = tabs.some(([k]) => k === hubTab) ? hubTab : tabs[0][0];
                    const di = DIFFICULTIES.findIndex((d) => d.id === tour.difficulty);
                    const du = DURATIONS.indexOf(tour.duration);
                    const careerWins = career && tour.done ? pendingCelebration(career) : [];
                    const soloKey = !career && !road && tour.done && tour.champion === tour.me ? `${tour.tourId}:${tour.groupHistory.length}:${tour.koHistory.length}` : null;
                    const celebrateTeam = careerWins.length || (soloKey && soloKey !== celebratedKey) ? byId(tour.me) : null;
                    return (
                        <div className={styles.body}>
                            {celebrateTeam && (
                                <ChampionCelebration
                                    team={celebrateTeam}
                                    titles={careerWins.length ? careerWins.map((w) => `${w} ${career?.season ?? ''}`) : [tourDef.name]}
                                    coach={career?.coach}
                                    onClose={() => (careerWins.length ? persist({ tour: markCelebrated(tour) }) : setCelebratedKey(soloKey))}
                                />
                            )}
                            <div className={styles.hub}>
                                <div className={styles.nextCard}>
                                    {road && <span className={styles.roadChip}>⚑ {nameOf(road.me)} · {PHASE_LABEL[road.phase]}</span>}
                                    {career && <span className={styles.roadChip}>⚑ {nameOf(career.me)} · Temporada {career.season} · {CAREER_PHASE_LABEL[career.phase]}</span>}
                                    {career?.parallel && !career.parallel.done && (
                                        <span className={styles.parallelNote}>
                                            En paralelo: {(defOf(career.parallel)?.name ?? '').replace(/ \d{4}$/, '')} · {roundLabel(career.parallel).toLowerCase()}
                                        </span>
                                    )}
                                    {(road || career) && tour.done && verdict ? (
                                        <>
                                            <div className={styles.champBox}>
                                                <span>{verdict.title}</span>
                                                <small>{verdict.text}</small>
                                            </div>
                                            {career && closesSeason(tour) && (
                                                <div className={styles.nacAsk} role="radiogroup" aria-label={`Formato del Nacional de Clubes ${career.season + 2}`}>
                                                    <span className={styles.nacAskQ}>¿Cómo creés que se va a jugar el Nacional de Clubes {career.season + 2}?</span>
                                                    {NAC_FORMATS.map((f) => {
                                                        const on = (nacPick ?? formatOf(career, career.season + 1)) === f.id;
                                                        return (
                                                            <button key={f.id} type="button" role="radio" aria-checked={on} className={`${styles.nacOpt} ${on ? styles.nacOptOn : ''}`} onClick={() => setNacPick(f.id)}>
                                                                <strong>{f.label}</strong>
                                                                <small>{f.hint}</small>
                                                            </button>
                                                        );
                                                    })}
                                                    <small className={styles.nacAskNote}>El {career.season + 1} ya está definido: {NAC_FORMATS.find((f) => f.id === formatOf(career, career.season + 1))?.label.toLowerCase()}.</small>
                                                </div>
                                            )}
                                        </>
                                    ) : tour.done ? (
                                        <div className={styles.champBox}>
                                            <span>{tour.champion === tour.me ? 'Campeón' : 'Terminó el torneo'}</span>
                                            <strong>
                                                <FlagIcon code={flagOf(tour.champion ?? '')} size={26} /> {nameOf(tour.champion ?? '')}
                                            </strong>
                                            {tour.champion !== tour.me && <small>{tour.eliminated ? 'Vos quedaste afuera antes.' : `${meTeam?.name} terminó sin el título.`}</small>}
                                        </div>
                                    ) : (
                                        <>
                                            <span className={styles.nextLabel}>{roundLabel(tour)}</span>
                                            {oppTeam && meTeam ? (
                                                <div className={styles.nextVs}>
                                                    <span className={styles.nextTeam}>
                                                        <SpritePreview look={meTeam.players[0]} kit={meTeam.kit} scale={3} running />
                                                        <b><FlagIcon code={meTeam.flag} /> {meTeam.name}</b>
                                                    </span>
                                                    <span className={styles.vsBadgeSmall}>VS</span>
                                                    <span className={styles.nextTeam}>
                                                        <SpritePreview look={oppTeam.players[0]} kit={oppTeam.kit} scale={3} running />
                                                        <b><FlagIcon code={oppTeam.flag} /> {oppTeam.name}</b>
                                                        <Level rating={oppTeam.rating} />
                                                    </span>
                                                </div>
                                            ) : (
                                                <p className={styles.note}>Fecha libre: esta fecha la juegan los demás.</p>
                                            )}
                                        </>
                                    )}
                                    {tourLive && (
                                        <div className={styles.hubOptions}>
                                            <ArrowSelect
                                                label="Dificultad"
                                                value={DIFFICULTIES[di].label}
                                                onPrev={() => setTourOptions({ difficulty: DIFFICULTIES[wrap(di - 1, DIFFICULTIES.length)].id })}
                                                onNext={() => setTourOptions({ difficulty: DIFFICULTIES[wrap(di + 1, DIFFICULTIES.length)].id })}
                                            />
                                            <ArrowSelect
                                                label="Duración"
                                                value={`${tour.duration} min`}
                                                onPrev={() => setTourOptions({ duration: DURATIONS[wrap(du - 1, DURATIONS.length)] })}
                                                onNext={() => setTourOptions({ duration: DURATIONS[wrap(du + 1, DURATIONS.length)] })}
                                            />
                                        </div>
                                    )}
                                    {(() => {
                                        const nextStep = tourLive
                                            ? { label: opp ? 'Jugar ▶' : 'Simular la fecha ▶', run: playTourMatch }
                                            : career && verdict?.next
                                              ? { label: `${verdict.next} ▶`, run: () => nextCareerStage(closesSeason(tour) ? nacPick ?? formatOf(career, career.season + 1) : undefined) }
                                              : road && verdict?.next
                                                ? { label: `${verdict.next} ▶`, run: nextRoadStage }
                                                : null;
                                        return (
                                            <div className={styles.hubActions}>
                                                <button type="button" className={`${styles.btnPrimary} ${styles.hubMainBtn}`} onClick={nextStep?.run ?? (() => setScreen({ k: 'slots' }))}>
                                                    {nextStep?.label ?? 'Partidas ▶'}
                                                </button>
                                                {tourLive && (
                                                    <div className={styles.simRow}>
                                                        <button type="button" className={styles.simBtn} onClick={() => simTourMatch(false)} disabled={!opp}>
                                                            Simular partido
                                                        </button>
                                                        <button type="button" className={styles.simBtn} onClick={() => simTourMatch(true)}>
                                                            Simular todo
                                                        </button>
                                                    </div>
                                                )}
                                                {nextStep && (
                                                    <button type="button" className={styles.textBtn} onClick={() => setScreen({ k: 'slots' })}>
                                                        ◀ Volver a partidas
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div className={styles.hubMain}>
                                    <div className={styles.tabs} role="tablist" aria-label="Vista del torneo">
                                        {tabs.map(([k, l]) => (
                                            <button key={k} type="button" role="tab" aria-selected={tab === k} className={styles.tab} onClick={() => setHubTab(k)}>
                                                {l}
                                            </button>
                                        ))}
                                    </div>
                                    <div className={styles.hubPanel}>
                                        {tab === 'tabla' && (
                                            <div className={styles.groupGrid}>
                                                {tour.groups.map((_, gi) => (
                                                    <GroupTable
                                                        key={gi}
                                                        title={tour.groups.length === 1 ? 'Tabla de posiciones' : tour.cross ? (gi === 0 ? 'Conferencia Norte' : 'Conferencia Sur') : `Grupo ${GROUP_LETTERS[gi]}`}
                                                        rows={groupStandings(tour, gi)}
                                                        me={tour.me}
                                                        advance={tour.hasKo || tourDef.stage.kind === 'grupos' ? advance : 1}
                                                        nameOf={nameOf}
                                                        flagOf={flagOf}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {tab === 'cuadro' && tour.hasKo && <Bracket s={tour} def={tourDef} nameOf={nameOf} flagOf={flagOf} />}
                                        {tab === 'resultados' && (
                                            <div className={styles.results}>
                                                {history.length === 0 && <p className={styles.empty}>Todavía no se jugó ninguna fecha.</p>}
                                                {history.map((h, hi) => (
                                                    <div key={`${h.label}-${hi}`} className={styles.histRound}>
                                                        <h3 className={styles.groupTitle}>{h.label}</h3>
                                                        <ul className={styles.histList}>
                                                            {h.results.map((r) => (
                                                                <li key={`${r.a}-${r.b}`} className={r.a === tour.me || r.b === tour.me ? styles.rowMine : undefined}>
                                                                    <span><FlagIcon code={flagOf(r.a)} size={14} /> {nameOf(r.a)}</span>
                                                                    <strong>{r.sa} - {r.sb}</strong>
                                                                    <span>{nameOf(r.b)} <FlagIcon code={flagOf(r.b)} size={14} /></span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {tab === 'calendario' && (
                                            <div className={styles.calendar}>
                                                {career && (
                                                    <section>
                                                        <h3 className={styles.groupTitle}>Temporada {career.season} · {nameOf(career.me)}</h3>
                                                        <ul className={styles.seasonList}>
                                                            {seasonPlan(tour).map((it) => (
                                                                <li key={it.name} className={styles[`season_${it.state}`]}>
                                                                    <span className={styles.seasonDot} aria-hidden="true" />
                                                                    <strong>{it.name}</strong>
                                                                    <small>{it.detail}</small>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </section>
                                                )}
                                                <section>
                                                    <h3 className={styles.groupTitle}>{career?.parallel ? 'Partidos de la temporada · los dos torneos intercalados' : `Partidos · ${tourDef.name}`}</h3>
                                                    <ul className={styles.fixList}>
                                                        {(career ? seasonFixture(tour) : myFixture(tour)).map((f, i) => (
                                                            <li key={i} className={`${styles.fixRow} ${f.state === 'next' ? styles.fixNext : ''} ${f.state === 'maybe' ? styles.fixMaybe : ''}`}>
                                                                <span className={styles.fixLabel}>{career?.parallel && (f as { comp?: string }).comp ? <><b className={styles.fixComp}>{(f as { comp?: string }).comp}</b> · </> : null}{f.label}</span>
                                                                <span className={styles.fixOpp}>
                                                                    {f.opp ? (
                                                                        <>
                                                                            <small>{f.home ? 'vs' : 'en cancha de'}</small> <FlagIcon code={flagOf(f.opp)} size={14} /> {nameOf(f.opp)}
                                                                        </>
                                                                    ) : (
                                                                        <small>{f.note ?? 'Rival a definir'}</small>
                                                                    )}
                                                                </span>
                                                                <span className={styles.fixRes}>
                                                                    {f.result ? (
                                                                        <b className={f.result[0] > f.result[1] ? styles.fixWin : f.result[0] < f.result[1] ? styles.fixLoss : undefined}>
                                                                            {f.result[0] > f.result[1] ? 'G' : f.result[0] < f.result[1] ? 'P' : 'E'} {f.result[0]}-{f.result[1]}
                                                                        </b>
                                                                    ) : f.state === 'next' ? (
                                                                        <b className={styles.fixNextTag}>Próximo</b>
                                                                    ) : null}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </section>
                                            </div>
                                        )}
                                        {tab === 'otros' && career && (() => {
                                            const par = parallelView(tour);
                                            const list = [
                                                ...(par ? [{ key: 'mio', name: `${(defOf(par)?.name ?? '').replace(/ \d{4}$/, '')} (tu club)`, state: par }] : []),
                                                ...otherTours(tour),
                                            ];
                                            if (list.length === 0) return <p className={styles.empty}>No hay otros torneos en juego.</p>;
                                            const cur = list.find((x) => x.key === otherKey) ?? list[0];
                                            const t = cur.state;
                                            const d = defOf(t);
                                            const lastRounds = [...t.koHistory].reverse().concat([...t.groupHistory].reverse()).slice(0, 2);
                                            return (
                                                <div className={styles.othersPanel}>
                                                    <label className={styles.othersPick}>
                                                        <span>Torneo</span>
                                                        <select value={cur.key} onChange={(e) => setOtherKey(e.target.value)}>
                                                            {list.map((x) => (
                                                                <option key={x.key} value={x.key}>
                                                                    {x.name} · {x.state.done ? 'terminado' : roundLabel(x.state).toLowerCase()}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <p className={styles.note}>
                                                        {t.done
                                                            ? `Terminado · campeón: ${nameOf(t.champion ?? finalRanking(t)[0] ?? '')}.`
                                                            : `Va por: ${roundLabel(t).toLowerCase()}. Se juega a la par de tu temporada: avanza cada vez que jugás o simulás una fecha.`}
                                                    </p>
                                                    {(t.stage === 'grupos' || !t.hasKo) && (
                                                        <div className={styles.groupGrid}>
                                                            {t.groups.map((_, gi) => (
                                                                <GroupTable
                                                                    key={gi}
                                                                    title={t.groups.length === 1 ? 'Tabla de posiciones' : `Zona ${GROUP_LETTERS[gi]}`}
                                                                    rows={groupStandings(t, gi)}
                                                                    me={tour.me}
                                                                    advance={d?.stage.kind === 'grupos' ? d.stage.advance : 1}
                                                                    nameOf={nameOf}
                                                                    flagOf={flagOf}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                    {t.hasKo && t.stage === 'ko' && d && <Bracket s={t} def={d} nameOf={nameOf} flagOf={flagOf} />}
                                                    {lastRounds.length > 0 && (
                                                        <div className={styles.results}>
                                                            {lastRounds.map((h, hi) => (
                                                                <div key={`${h.label}-${hi}`} className={styles.histRound}>
                                                                    <h3 className={styles.groupTitle}>{hi === 0 ? 'Última fecha' : 'Fecha anterior'} · {h.label}</h3>
                                                                    <ul className={styles.histList}>
                                                                        {h.results.map((x) => (
                                                                            <li key={`${x.a}-${x.b}`} className={x.a === tour.me || x.b === tour.me ? styles.rowMine : undefined}>
                                                                                <span><FlagIcon code={flagOf(x.a)} size={14} /> {nameOf(x.a)}</span>
                                                                                <strong>{x.sa} - {x.sb}</strong>
                                                                                <span>{nameOf(x.b)} <FlagIcon code={flagOf(x.b)} size={14} /></span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {tab === 'goleadores' && (
                                            <div className={styles.scorers}>
                                                {[tour, ...(career?.parallel ? [career.parallel] : [])].map((t) => (
                                                    <section key={t.tourId}>
                                                        <h3 className={styles.groupTitle}>{(defOf(t)?.name ?? '').replace(/ \d{4}$/, '')}</h3>
                                                        <div className={styles.scorerCols}>
                                                            {(['tries', 'points'] as const).map((by) => {
                                                                const rows = liveScorers(t, by, playerName, 10);
                                                                return (
                                                                    <div key={by} className={styles.groupCard}>
                                                                        <h4 className={styles.scorerTitle}>{by === 'tries' ? 'Tryman' : 'Goleadores'}</h4>
                                                                        {rows.length === 0 ? (
                                                                            <p className={styles.empty}>Todavía no hay tantos.</p>
                                                                        ) : (
                                                                            <ol className={styles.scorerList}>
                                                                                {rows.map((x) => (
                                                                                    <li key={`${x.team}-${x.slot}`} className={x.team === tour.me ? styles.rowMine : undefined}>
                                                                                        <span>{x.name}</span>
                                                                                        <small><FlagIcon code={flagOf(x.team)} size={12} /> {nameOf(x.team)}</small>
                                                                                        <b>{by === 'tries' ? `${x.tries} tries` : `${x.points} pts`}</b>
                                                                                    </li>
                                                                                ))}
                                                                            </ol>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </section>
                                                ))}
                                            </div>
                                        )}
                                        {tab === 'plantel' && career && (
                                            <div className={styles.rosterPanel}>
                                                <h3 className={styles.groupTitle}>Plantel de {nameOf(career.me)} · temporada {career.season}</h3>
                                                <p className={styles.note}>
                                                    Cada año los jugadores cumplen uno: los jóvenes mejoran, los veteranos bajan y se retiran, y llega uno nuevo de la cantera. El plantel pesa en el nivel del club. Tocá un nombre para cambiarlo.
                                                </p>
                                                <ul className={styles.rosterList}>
                                                    {myRoster(career).map((p) => (
                                                        <li key={`${p.slot}-${p.name.first}-${p.name.last}`}>
                                                            <span className={styles.rosterPos}>{p.slot + 1} · {p.pos}</span>
                                                            <input
                                                                className={styles.rosterName}
                                                                defaultValue={`${p.name.first} ${p.name.last}`.trim()}
                                                                aria-label={`Nombre del ${p.pos.toLowerCase()} (${p.slot + 1})`}
                                                                maxLength={40}
                                                                onBlur={(e) => {
                                                                    const v = e.currentTarget.value;
                                                                    if (v.trim() !== `${p.name.first} ${p.name.last}`.trim()) persist({ tour: renamePlayer(tour, p.slot, v) });
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') e.currentTarget.blur();
                                                                }}
                                                            />
                                                            <span className={styles.rosterAge}>{p.age} años</span>
                                                            <span className={p.q >= 0 ? styles.fixWin : styles.fixLoss}>{p.q >= 0 ? '+' : ''}{p.q.toFixed(1)}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {tab === 'palmares' && career && (() => {
                                            const keys = palmaresKeys(career);
                                            const key = palmaresKey && keys.includes(palmaresKey) ? palmaresKey : keys[0];
                                            const rows = key ? palmaresFor(career, key) : [];
                                            const count = new Map<string, number>();
                                            for (const r of rows) count.set(r.name, (count.get(r.name) ?? 0) + 1);
                                            const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
                                            return (
                                                <div className={styles.othersPanel}>
                                                    <label className={styles.othersPick}>
                                                        <span>Competición</span>
                                                        <select value={key} onChange={(e) => setPalmaresKey(e.target.value)}>
                                                            {keys.map((k) => (
                                                                <option key={k} value={k}>
                                                                    {palmaresLabel(k)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <p className={styles.note}>Hasta 2025, los campeones reales del archivo de G22 Scores. Desde 2026, los de esta carrera, que se van sumando temporada a temporada.</p>
                                                    {top.length > 0 && (
                                                        <div className={styles.palmaresTop}>
                                                            {top.map(([name, n]) => (
                                                                <span key={name} className={name === nameOf(career.me) ? styles.palmaresMine : undefined}>
                                                                    <b>{n}</b> {name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <ol className={styles.palmaresList}>
                                                        {rows.map((r) => (
                                                            <li key={`${r.season}-${r.name}`} className={`${r.game ? styles.palmaresGame : ''} ${r.club === career.me ? styles.palmaresMine : ''}`}>
                                                                <span>{r.season}</span>
                                                                <span>{r.club ? <FlagIcon code={flagOf(r.club)} size={14} /> : null} {r.name}</span>
                                                                {r.game && <small>en esta carrera</small>}
                                                            </li>
                                                        ))}
                                                    </ol>
                                                </div>
                                            );
                                        })()}
                                        {tab === 'carrera' && career && (
                                            <div className={styles.roadPanel}>
                                                <h3 className={styles.groupTitle}>
                                                    {nameOf(career.me)} · {divisionLabel(divisionOf(career, career.me) ?? '')} · nivel {careerRating(career, career.me)}
                                                </h3>
                                                {career.coach && (
                                                    <div className={styles.coachCard}>
                                                        <span>Entrenador: <b>{career.coach}</b></span>
                                                        <div className={styles.badges}>
                                                            {myTitles(career).length === 0 && <small>Todavía sin títulos.</small>}
                                                            {myTitles(career).map((t) => (
                                                                <span key={`${t.key}-${t.season}`} className={styles.badge2}>
                                                                    <Trophy size={14} /> Campeón {t.label} {t.season}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                <p className={styles.note}>
                                                    El nivel de cada club cambia al cerrar la temporada: sube si terminás más arriba de lo esperado y con los títulos, y baja si no.
                                                    {career.branch === 'interior' && ' Sin ascenso directo: el campeón de cada división juega la promoción contra el último de la de arriba.'}
                                                </p>
                                                {career.history.length === 0 && <p className={styles.empty}>Primera temporada en juego.</p>}
                                                <ul className={styles.roadSlots}>
                                                    {[...career.history].reverse().map((h) => (
                                                        <li key={`${h.season}-${h.division}`}>
                                                            <span>{h.season} · {divisionLabel(h.division)} · {h.place}.º{h.rating ? ` · nivel ${h.rating}` : ''}</span>
                                                            <small>{h.note}</small>
                                                        </li>
                                                    ))}
                                                </ul>
                                                <div className={styles.roadPending}>
                                                    <span>Formato del Nacional de Clubes:</span>
                                                    {[0, 1, 2].map((k) => (
                                                        <span key={k}>
                                                            {career.season + k}: {NAC_FORMATS.find((f) => f.id === formatOf(career, career.season + k))?.label}
                                                            {k === 2 && !career.nacFormat?.[String(career.season + 2)] ? ' (se elige al cerrar esta temporada)' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                                {formatOf(career, career.season) === 'ab' && career.cuposAB ? (
                                                    <div className={styles.roadPending}>
                                                        <span>Plazas por región (Nacional A / Nacional B / TDI A / TDI B):</span>
                                                        {career.cuposAB.map((c) => (
                                                            <span key={c.region}>{c.region}: {c.n.join(' / ')}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className={styles.roadPending}>
                                                        <span>Plazas del Torneo del Interior (A / B) por región:</span>
                                                        {career.cupos.map((c) => (
                                                            <span key={c.region}>{c.region}: {c.tdiA} / {c.tdiB}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                {(career.awards ?? []).length > 0 && (
                                                    <div className={styles.roadPending}>
                                                        <span>Goleadores y tryman de cada temporada:</span>
                                                        {[...(career.awards ?? [])].reverse().slice(0, 12).map((a, i) => (
                                                            <span key={i}>
                                                                {a.season} · {a.comp}: tryman {a.tries[0] ? `${a.tries[0].name} (${nameOf(a.tries[0].club)}, ${a.tries[0].n})` : '—'} · goleador {a.points[0] ? `${a.points[0].name} (${nameOf(a.points[0].club)}, ${a.points[0].n} pts)` : '—'}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {career.log.length > 0 && (
                                                    <ul className={styles.roadLog}>
                                                        {[...career.log].reverse().slice(0, 12).map((l, i) => (
                                                            <li key={i}>{l}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                        {tab === 'camino' && road && (
                                            <div className={styles.roadPanel}>
                                                <h3 className={styles.groupTitle}>Clasificados al Mundial · {road.slots.length} de 24</h3>
                                                <ul className={styles.roadSlots}>
                                                    {road.slots.map((x) => (
                                                        <li key={x.team} className={x.team === road.me ? styles.rowMine : undefined}>
                                                            <span><FlagIcon code={flagOf(x.team)} size={14} /> {nameOf(x.team)}</span>
                                                            <small>{x.via}</small>
                                                        </li>
                                                    ))}
                                                </ul>
                                                {(road.repAA.length > 0 || road.repPS.length > 0 || road.fqt.length > 0) && (
                                                    <div className={styles.roadPending}>
                                                        {road.repAA.length > 0 && <span>Repechaje Asia-África: {road.repAA.map(nameOf).join(' vs ')}{road.done.repAA ? ' (jugado)' : ''}</span>}
                                                        {road.repPS.length > 0 && <span>Repechaje Pacífico-Sudamérica: {road.repPS.map(nameOf).join(' vs ')}{road.done.repPS ? ' (jugado)' : ''}</span>}
                                                        {road.fqt.length > 0 && <span>Clasificatorio final: {road.fqt.map(nameOf).join(', ')}{road.done.fqt ? ' (jugado)' : ''}</span>}
                                                    </div>
                                                )}
                                                {road.log.length > 0 && (
                                                    <ul className={styles.roadLog}>
                                                        {road.log.map((l, i) => (
                                                            <li key={i}>{l}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {screen.k === 'cupSetup' && screen.step === 1 && (
                    <div className={styles.body}>
                        <div className={styles.single}>
                            <TeamChooser label="Tu equipo para la Copa" teamId={mine} onChange={setMine} categories={categories} />
                        </div>
                        <div className={styles.footerBtns}>
                            {btn('◀ Menú', () => setScreen({ k: 'menu' }))}
                            {btn('Siguiente ▶', () => setScreen({ k: 'cupSetup', step: 2 }), true, !mine)}
                        </div>
                    </div>
                )}

                {screen.k === 'cupSetup' && screen.step === 2 && (
                    <div className={styles.body}>
                        <SettingsStep teams={[byId(mine)]} difficulty={difficulty} setDifficulty={setDifficulty} duration={duration} setDuration={setDuration} />
                        <div className={styles.footerBtns}>
                            {btn('◀ Equipo', () => setScreen({ k: 'cupSetup', step: 1 }))}
                            {btn('Armar el cuadro ▶', startCup, true)}
                        </div>
                    </div>
                )}

                {screen.k === 'cup' && cup && (
                    <div className={styles.body}>
                        <div className={styles.tourIntro}>
                            <strong>Copa Seven · {nameOf(cup.teamId)}</strong>
                            <span>Eliminación directa · si empatan, muerte súbita</span>
                        </div>
                        <ol className={styles.cupPath}>
                            {CUP_ROUNDS.map((label, i) => {
                                const opp = byId(cup.opponents[i]);
                                const res = cup.results[i];
                                const current = i === cup.round && !cup.eliminated;
                                const known = i <= cup.round;
                                return (
                                    <li key={label} className={`${styles.cupStep} ${current ? styles.cupCurrent : ''} ${res && res.us > res.them ? styles.cupWon : ''}`}>
                                        <span className={styles.groupTitle}>{label}</span>
                                        <span className={styles.cupOpp}>
                                            {known && opp ? (
                                                <>
                                                    <SpritePreview look={opp.players[0]} kit={opp.kit} scale={3} />
                                                    <FlagIcon code={opp.flag} /> {opp.name}
                                                </>
                                            ) : (
                                                <span className={styles.tbd}>Por definir</span>
                                            )}
                                        </span>
                                        <b>{res ? `${res.us} - ${res.them}` : current ? 'Te toca' : ''}</b>
                                    </li>
                                );
                            })}
                        </ol>
                        {cup.round >= 3 && <p className={styles.cupNote}>Campeón de la Copa Seven. Tres partidos, tres victorias.</p>}
                        {cup.eliminated && <p className={styles.cupNote}>Te quedaste en {CUP_ROUNDS[cup.round].toLowerCase()}. La próxima va.</p>}
                        <div className={styles.footerBtns}>
                            {btn('◀ Menú', () => setScreen({ k: 'menu' }))}
                            {cupLive
                                ? btn(`Jugar ${CUP_ROUNDS[cup.round].toLowerCase()} ▶`, playCupMatch, true)
                                : btn('Nueva Copa ▶', () => setScreen({ k: 'cupSetup', step: 1 }), true)}
                        </div>
                    </div>
                )}

                {screen.k === 'teams' && (
                    <div className={styles.body}>
                        <div className={styles.scrollPanel}>
                            {customTeams.length === 0 && <p className={styles.empty}>Todavía no armaste ninguno. Los equipos que crees aparecen en la categoría Mis equipos.</p>}
                            <ul className={styles.teamList}>
                                {customTeams.map((t) => (
                                    <li key={t.id} className={styles.teamRow}>
                                        <span className={styles.teamSprites} aria-hidden="true">
                                            {t.players.slice(0, 3).map((p, i) => (
                                                <SpritePreview key={i} look={p} kit={t.kit} scale={2} />
                                            ))}
                                        </span>
                                        <span className={styles.teamName}>
                                            {t.name} <small>{t.short}</small>
                                        </span>
                                        <button type="button" className={styles.btnGhost} onClick={() => setScreen({ k: 'edit', team: t })}>Editar</button>
                                        <button type="button" className={styles.btnGhost} onClick={() => deleteTeam(t.id)} aria-label={`Borrar ${t.name}`}>Borrar</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className={styles.footerBtns}>
                            {btn('◀ Menú', () => setScreen({ k: 'menu' }))}
                            {btn('Crear equipo ▶', () => setScreen({ k: 'edit', team: newTeam() }), true)}
                        </div>
                    </div>
                )}

                {screen.k === 'edit' && (
                    <div className={styles.body}>
                        <div className={styles.scrollPanel}>
                            <TeamEditor initial={screen.team} onSave={saveTeam} onCancel={() => setScreen({ k: 'teams' })} />
                        </div>
                    </div>
                )}

                {screen.k === 'match' && (
                    <MatchView
                        key={screen.nonce}
                        cfg={screen.cfg}
                        musicSrc={musicSrc}
                        fontFamily={pixel.style.fontFamily}
                        onFinish={(score, log) => onFinish(screen.cfg, screen.mode, score, log)}
                        onQuit={() => setScreen(screen.mode === 'cup' ? { k: 'cup' } : screen.mode === 'tour' ? { k: 'tour' } : { k: 'quick', step: 1 })}
                    />
                )}

                {screen.k === 'result' && (
                    <div className={styles.body}>
                        <div className={styles.result}>
                            <p className={styles.resultLabel}>
                                {screen.score[0] > screen.score[1] ? 'Ganaste' : screen.score[0] < screen.score[1] ? 'Perdiste' : 'Empate'}
                            </p>
                            <div className={styles.resultScore}>
                                <span>
                                    <SpritePreview look={screen.cfg.home.players[0]} kit={screen.cfg.home.kit} scale={5} running={screen.score[0] > screen.score[1]} />
                                    <FlagIcon code={screen.cfg.home.flag} /> {screen.cfg.home.name}
                                </span>
                                <strong>
                                    {screen.score[0]} - {screen.score[1]}
                                </strong>
                                <span>
                                    <SpritePreview look={screen.cfg.away.players[0]} kit={screen.cfg.away.kit} scale={5} running={screen.score[1] > screen.score[0]} />
                                    <FlagIcon code={screen.cfg.away.flag} /> {screen.cfg.away.name}
                                </span>
                            </div>
                            <div className={styles.footerBtns}>
                                {screen.mode === 'quick' && (
                                    <>
                                        {btn('Menú', () => setScreen({ k: 'menu' }))}
                                        {btn('Revancha ▶', () => play({ ...screen.cfg }, 'quick'), true)}
                                    </>
                                )}
                                {screen.mode === 'cup' && btn('Ver la Copa ▶', () => setScreen({ k: 'cup' }), true)}
                                {screen.mode === 'tour' && btn('Ver el torneo ▶', () => setScreen({ k: 'tour' }), true)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
