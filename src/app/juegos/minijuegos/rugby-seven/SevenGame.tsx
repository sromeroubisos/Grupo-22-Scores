'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { Silkscreen } from 'next/font/google';
import MatchView from './MatchView';
import SpritePreview from './SpritePreview';
import TeamEditor from './TeamEditor';
import { ClubPanel, CoachPrompt, LineupBoard, NewsPopup, PreseasonPanel, readCoach, RosterTable, saveCoach } from './CareerPanels';
import { matchupOdds, type MatchConfig, type MatchEvent } from './engine';
import { POSITIONS, playerNames } from './names';
import { APPROX_KIT, FEM_NATIONS, NATION_BY_CODE, NATION_ZONE, NATIONS, ZONES } from './nations';
import { randomLook } from './sprites';
import {
    cpuRatingFor,
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
    createTour,
    defOf,
    finalRanking,
    GROUP_LETTERS,
    groupStandings,
    koLabel,
    myFixture,
    nextIsHome,
    nextOpponent,
    playerAt,
    ratingBoost,
    ratingOf,
    roundLabel,
    replaceInDef,
    setCareerContext,
    setRatingContext,
    scoreEvents,
    simulate,
    TOURS,
    TOUR_CATS,
    catOf,
    type Stage,
    type TourDef,
    type ScoreEvent,
    type TourState,
} from './tours';
import { AR_CLUBS, AR_DIVISIONS_PLAYABLE, AR_SEVEN_DIVISIONS, isFemBranch, type ArBranch } from './arClubs';

/** Los países de la carrera: cada uno con sus ligas (las argentinas son dos ramas, URBA e interior). */
const CAREER_COUNTRIES: { id: string; name: string; flag: string; sub: string; branches: ArBranch[] }[] = [
    { id: 'ar', name: 'Argentina', flag: 'ar', sub: 'URBA y el interior: ascensos, promociones, Torneo del Interior y Nacional de Clubes.', branches: ['urba', 'interior'] },
    { id: 'uy', name: 'Uruguay', flag: 'uy', sub: 'El Uruguayo de Clubes: fase regular y semifinales por el título.', branches: ['uruguay'] },
    { id: 'br', name: 'Brasil', flag: 'br', sub: 'Super 12: grupos, Hexagonal y final; Repescagem con la Segunda.', branches: ['brasil'] },
    { id: 'es', name: 'España', flag: 'es', sub: 'División de Honor, Honor Élite y Honor B (en grupos). Sube el campeón, baja el último.', branches: ['espana'] },
    { id: 'fr', name: 'Francia', flag: 'fr', sub: 'Élite 14, Pro Segunda, Liga Nacional, Liga Nacional 2 y Federal Uno. Sube el campeón, baja el último.', branches: ['francia'] },
    { id: 'en', name: 'Inglaterra', flag: 'gb-eng', sub: 'Premier Union y Challenger Union. Sube el campeón, baja el último.', branches: ['inglaterra'] },
    { id: 'frf', name: 'Francia · femenino', flag: 'fr', sub: 'Élite 14 Femenina y Federal Uno Femenina. Sube la campeona, baja la última.', branches: ['franciaFem'] },
    { id: 'enf', name: 'Inglaterra · femenino', flag: 'gb-eng', sub: 'Premier Union Femenina y Challenger Union Femenina. Sube la campeona, baja la última.', branches: ['inglaterraFem'] },
    { id: 'za', name: 'Sudáfrica', flag: 'za', sub: 'Copa Curry: la Élite y el Ascenso. Sube el campeón, baja el último.', branches: ['sudafrica'] },
    { id: 'pt', name: 'Portugal', flag: 'pt', sub: 'Campeonato Lusitano: Divisão de Honra y Primeira Divisão. Sube el campeón, baja el último.', branches: ['portugal'] },
    { id: 'de', name: 'Alemania', flag: 'de', sub: 'Liga Federal Alemana: Primera y Segunda. Sube el campeón, baja el último.', branches: ['alemania'] },
    { id: 'pl', name: 'Polonia', flag: 'pl', sub: 'Liga Extra y Liga Uno de Polonia. Sube el campeón, baja el último.', branches: ['polonia'] },
    { id: 'ge', name: 'Georgia', flag: 'ge', sub: 'Liga Gran 10 y Liga Primera de Georgia. Sube el campeón, baja el último.', branches: ['georgia'] },
    { id: 'ru', name: 'Rusia', flag: 'ru', sub: 'Liga Pro y Liga Mayor de Rusia. Sube el campeón, baja el último.', branches: ['rusia'] },
    { id: 'au', name: 'Australia', flag: 'au', sub: 'Liga Escudo de Sídney y Liga Premier de Queensland. Sube el campeón, baja el último.', branches: ['australia'] },
    { id: 'cz', name: 'Chequia', flag: 'cz', sub: 'Liga Extra y Primera Liga Checa. Sube el campeón, baja el último.', branches: ['chequia'] },
    { id: 'bo', name: 'Bolivia', flag: 'bo', sub: 'Liga Altiplano de Bolivia: una sola división, fase regular y semifinales.', branches: ['bolivia'] },
    { id: 'pe', name: 'Perú', flag: 'pe', sub: 'Liga Andina del Perú: una sola división, fase regular y semifinales.', branches: ['peru'] },
    { id: 'mx', name: 'México', flag: 'mx', sub: 'Liga Azteca de México: una sola división, fase regular y semifinales.', branches: ['mexico'] },
    { id: 'co', name: 'Colombia', flag: 'co', sub: 'Liga de Rugby de Bogotá: una sola división, fase regular y semifinales.', branches: ['colombia'] },
    { id: 'arf', name: 'Argentina · femenino', flag: 'ar', sub: 'URBA (Top 9, Primera y Segunda) y el Centro (Córdoba y Andina). Las mejores juegan el Nacional de Clubes Femenino.', branches: ['fem'] },
    { id: 'esf', name: 'España · femenino', flag: 'es', sub: 'Liga Iberdrola y División de Honor B femenina. Sube la campeona, baja la última.', branches: ['espanaFem'] },
    { id: 'cl', name: 'Chile', flag: 'cl', sub: 'ARUSA: Top 10, Segunda, Tercera y Cuarta. Sube el campeón, baja el último.', branches: ['chile'] },
];
/** El primer club de un país en orden alfabético: el que aparece elegido al entrar. */
const firstClubOf = (countryId: string) => {
    const c = CAREER_COUNTRIES.find((x) => x.id === countryId);
    const ids = AR_SEVEN_DIVISIONS.filter((d) => c?.branches.includes(d.branch)).flatMap((d) => d.clubs);
    return [...new Set(ids)].map((id) => AR_CLUBS.find((t) => t.id === id)).filter((t): t is SevenTeam => !!t).sort((a, b) => a.name.localeCompare(b.name, 'es'))[0]?.id ?? null;
};
/** Bandera de cada categoría con país. */
const CAT_FLAG: Record<string, string> = { Argentina: 'ar', Chile: 'cl', Uruguay: 'uy', Brasil: 'br', España: 'es', Francia: 'fr', Inglaterra: 'gb-eng', Sudáfrica: 'za', Portugal: 'pt', Alemania: 'de', Polonia: 'pl', Georgia: 'ge', Rusia: 'ru', Australia: 'au', Chequia: 'cz', Bolivia: 'bo', Perú: 'pe', México: 'mx' };
/** Las categorías de torneo que tienen modo carrera. */
const CAREER_CATS = ['Argentina', 'Chile', 'Uruguay', 'Brasil', 'España', 'Francia', 'Inglaterra', 'Sudáfrica', 'Portugal', 'Alemania', 'Polonia', 'Georgia', 'Rusia', 'Australia', 'Chequia', 'Bolivia', 'Perú', 'México'];
const countryOfClub = (id: string | null) => CAREER_COUNTRIES.find((c) => AR_SEVEN_DIVISIONS.some((d) => c.branches.includes(d.branch) && d.clubs.includes(id ?? '')))?.id ?? null;

/** En qué grupo del selector va cada división: Argentina, o el país de afuera. */
const branchGroup = (b: ArBranch) =>
    ({ chile: 'Chile', uruguay: 'Uruguay', brasil: 'Brasil', espana: 'España', espanaFem: 'España femenino', fem: 'Argentina femenino', francia: 'Francia', inglaterra: 'Inglaterra', sudafrica: 'Sudáfrica', portugal: 'Portugal', franciaFem: 'Francia femenino', inglaterraFem: 'Inglaterra femenino', alemania: 'Alemania', polonia: 'Polonia', georgia: 'Georgia', rusia: 'Rusia', australia: 'Australia', chequia: 'Chequia', bolivia: 'Bolivia', peru: 'Perú', mexico: 'México' } as Record<string, string>)[b] ?? 'Argentina';
import { CLUB_LEAGUES, CLUBS, registerCustomTeams, teamOfCode } from './clubs';
import {
    advanceCareer,
    applyCareerContext,
    CAREER_PHASE_LABEL,
    careerBoosts,
    careerNames,
    careerPlayerName,
    careerRound,
    careerSkills,
    headToHead,
    clubRecords,
    HOME_ADV,
    inPreseason,
    preseasonFriendly,
    unseenNews,
    markNewsSeen,
    careerRating,
    careerVerdict,
    isArgCareer,
    sudamericanoFor,
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
    NAC_FORMATS,
    otherTours,
    ensureOthers,
    parallelView,
    renamePlayer,
    seasonFixture,
    seasonPlan,
    settleCareer,
    type NacFormat,
} from './career';
import { advanceRoad, AUTO_QUALIFIED, createRoad, PHASE_LABEL, regionalDef, regionFor, regionName, roadEligible, roadVerdict } from './road';
import { advanceIntl, compName, createIntl, intlBoosts, intlInvest, intlNames, intlSign, intlStartComp, intlToggleCall, intlToggleStarter, intlVerdict, isWcYear } from './intl';
import { IntlRanking, IntlSeason, IntlSquad, IntlUnion, IntlYouth } from './IntlPanels';
import { advanceSvns, createSvns, SVNS_LEGS, SVNS_PHASE_LABEL, svnsBoosts, svnsRegionName, svnsStartTier, svnsTable, svnsVerdict, TIER_LABEL } from './svns';
import { CloudSync, markTutorialSeenInAccount, tutorialSeenInAccount, type CloudStatus } from './cloudSave';
import { advanceMiClub, createMiClub, LIB_NAME, levelDef, levelOf, liveMine, mcAfterRound, mcRegionLabel, mcRelease, mcSign, mcTrain, mcUpgrade, mcVerdict, myTeam, nacHowOf, phaseName, WORLDS, type McRegion, type McWorld } from './miClub';
import { McClubPanel, McCredits, McMarket, McPyramid, McSquad, McTourTables } from './MiClubPanels';
import { useOfflineReady } from './offline';
import { readLang, startTranslating, writeLang, type Lang } from './i18n';
import { applyStoredClubEdits, EDITABLE_CLUBS, isClubEdited, resetClubEdit, saveClubEdit } from './clubEdits';
import styles from './seven.module.css';

const pixel = Silkscreen({ weight: ['400', '700'], subsets: ['latin'], display: 'swap' });

type Mode = 'quick' | 'cup' | 'tour' | 'friendly';
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
    | { k: 'svnsSetup'; step: 1 | 2 }
    | { k: 'intlSetup'; step: 1 | 2 }
    | { k: 'mcSetup'; step: 1 | 2 }
    | { k: 'newPick' }
    | { k: 'careerSetup'; step: 0 | 1 | 2 }
    | { k: 'tour' }
    | { k: 'teams' }
    | { k: 'edit'; team: SevenTeam }
    | { k: 'clubs' }
    | { k: 'clubEdit'; team: SevenTeam }
    | { k: 'match'; cfg: MatchConfig; mode: Mode; nonce: number }
    | { k: 'drill'; kind: 'tutorial' | 'practice'; nonce: number }
    | { k: 'result'; cfg: MatchConfig; mode: Mode; score: [number, number] };

type HubTab = 'tabla' | 'calendario' | 'cuadro' | 'resultados' | 'goleadores' | 'otros' | 'plantel' | 'club' | 'palmares' | 'camino' | 'carrera' | 'circuito' | 'ranking' | 'union' | 'temporada' | 'juveniles' | 'piramide' | 'fichajes';

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
/** Marca de que el tutorial ya se mostró en este dispositivo. */
const TUTORIAL_KEY = 'g22-rugby-seven-tutorial';

/** El partido de los ejercicios: sin rival de verdad, dos equipos de fábrica y el ritmo de fácil. */
function drillCfg(): MatchConfig {
    return { home: PRESET_TEAMS[0], away: PRESET_TEAMS[1], difficulty: 'facil', minutes: 7, suddenDeath: false, drill: 'move' };
}

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

/** Cierra una fecha: la carrera anota lo suyo y, en Mi Club, el resto de la pirámide avanza a la par. */
function tourRound(...args: Parameters<typeof careerRound>): TourState {
    const next = careerRound(...args);
    return next.miclub ? mcAfterRound(next) : next;
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

/**
 * Todas las banderas que el juego puede mostrar, para guardarlas y que se vean sin conexión
 * (los `kit:` son banderines dibujados, no archivos).
 */
const GAME_FLAGS: string[] = [...new Set(
    [...NATIONS, ...FEM_NATIONS, ...CLUBS, ...AR_CLUBS]
        .map((team) => team.flag)
        .filter((flag): flag is string => typeof flag === 'string' && flag.length > 0 && !flag.startsWith('kit:')),
)].sort();

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
        <span className={styles.level} role="img" aria-label={`${lvl} de 5 estrellas`}>
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
const codeOfTeam = (t: SevenTeam) => (t.id.startsWith('nat-') ? t.id.slice(4).toUpperCase() : t.id.startsWith('natf-') ? `${t.id.slice(5).toUpperCase()}-F` : t.id);

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
    // Las categorías van agrupadas por tipo (Internacional, Argentina, Chile...) en el desplegable.
    const groupOf = (c: Category) => c.group ?? c.name;
    const groups = [...new Set(cats.map(groupOf))];

    const pickIn = (c: Category, from: number, step: 1 | -1) => {
        for (let k = 0; k < c.teams.length; k++) {
            const t = c.teams[wrap(from + step * k, c.teams.length)];
            if (t.id !== avoid) return t.id;
        }
        return c.teams[0].id;
    };
    const moveTeam = (step: 1 | -1) => {
        if (!cat) return;
        const i = cat.teams.findIndex((t) => t.id === teamId);
        onChange(pickIn(cat, i + step, step));
    };

    return (
        <section className={`${styles.chooser} ${active ? styles.chooserActive : ''}`} aria-label={label} onFocusCapture={onActivate} onClick={onActivate}>
            <header className={styles.slotHead}>{label}</header>
            {cats.length > 1 && (
                <label className={styles.othersPick}>
                    <span>Liga o categoría</span>
                    <select
                        value={cat ? `${groupOf(cat)}|${cat.name}` : ''}
                        onChange={(e) => {
                            const next = cats.find((c) => `${groupOf(c)}|${c.name}` === e.target.value);
                            if (!next) return;
                            setPrefCat(next.name);
                            onChange(pickIn(next, 0, 1));
                        }}
                    >
                        {groups.map((g) => (
                            <optgroup key={g} label={g}>
                                {cats
                                    .filter((c) => groupOf(c) === g)
                                    .map((c) => (
                                        <option key={`${g}|${c.name}`} value={`${g}|${c.name}`}>
                                            {c.name} ({c.teams.length})
                                        </option>
                                    ))}
                            </optgroup>
                        ))}
                    </select>
                </label>
            )}
            {cat && cat.teams.length > 1 && (
                <label className={styles.othersPick}>
                    <span>Equipo</span>
                    <select value={team?.id ?? ''} onChange={(e) => e.target.value && onChange(e.target.value)}>
                        {!team && <option value="">Elegí un equipo</option>}
                        {[...cat.teams]
                            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                            .map((t) => (
                                <option key={t.id} value={t.id} disabled={t.id === avoid}>
                                    {t.name}
                                </option>
                            ))}
                    </select>
                </label>
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
                                {i > 0 && <Level rating={cpuRatingFor(difficulty, t.rating)} />}
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
    // Las copas grandes (Mi Club: hasta 256) se dibujan desde octavos; las rondas de antes van en Resultados.
    const top = Math.min(size, 16);
    for (let n = top; n >= 2; n /= 2) {
        const label = koLabel(n);
        const played = s.koHistory.find((h) => h.label === label);
        if (played) cols.push({ label, matches: played.results });
        else if (s.stage === 'ko' && s.alive.length === n) {
            const m = [];
            for (let i = 0; i + 1 < s.alive.length; i += 2) if (s.alive[i] !== '__bye__' && s.alive[i + 1] !== '__bye__') m.push({ a: s.alive[i], b: s.alive[i + 1] });
            cols.push({ label, matches: m });
        } else cols.push({ label, matches: Array.from({ length: n === size ? firstRoundMatches : n / 2 }, () => ({})) });    }
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

/** Lo que dejó una simulación: el último partido y, si fueron varios, el balance. */
interface SimFlash {
    home: SevenTeam;
    away: SevenTeam;
    score: [number, number];
    record?: [number, number, number]; // ganados, empatados, perdidos (al simular varios)
}

/** Cartel animado al simular: victoria, derrota o empate, con el resultado. Se va solo o con un toque. */
function SimResult({ flash, onClose }: { flash: SimFlash; onClose: () => void }) {
    const [a, b] = flash.score;
    const kind = a > b ? 'win' : a < b ? 'loss' : 'draw';
    const title = kind === 'win' ? 'VICTORIA' : kind === 'loss' ? 'DERROTA' : 'EMPATE';
    useEffect(() => {
        const t = setTimeout(onClose, flash.record ? 3600 : 2600);
        return () => clearTimeout(t);
    }, [flash, onClose]);
    const rec = flash.record;
    return (
        <button type="button" className={`${styles.simFlash} ${kind === 'win' ? styles.simFlashWin : kind === 'loss' ? styles.simFlashLoss : styles.simFlashDraw}`} onClick={onClose} aria-label={`${title}: ${flash.home.name} ${a}, ${flash.away.name} ${b}. Tocá para seguir.`}>
            <strong className={styles.simFlashTitle}>{title}</strong>
            <span className={styles.simFlashScore}>
                <span className={styles.simFlashTeam}>
                    <SpritePreview look={flash.home.players[0]} kit={flash.home.kit} scale={3} celebrating={kind === 'win'} />
                    <b>{flash.home.short}</b>
                </span>
                <span className={styles.simFlashNums}>
                    {a} <small>-</small> {b}
                </span>
                <span className={styles.simFlashTeam}>
                    <SpritePreview look={flash.away.players[0]} kit={flash.away.kit} scale={3} celebrating={kind === 'loss'} />
                    <b>{flash.away.short}</b>
                </span>
            </span>
            <span className={styles.simFlashSub}>
                {flash.home.name} contra {flash.away.name}
                {rec ? ` · simulaste ${rec[0] + rec[1] + rec[2]}: ${rec[0]} ganado${rec[0] === 1 ? '' : 's'}, ${rec[2]} perdido${rec[2] === 1 ? '' : 's'}${rec[1] ? `, ${rec[1]} empate${rec[1] === 1 ? '' : 's'}` : ''}` : ''}
            </span>
        </button>
    );
}

/** Una jugada del partido simulado: cuándo pasó (en minutos), de quién fue y qué fue. */
interface WatchItem {
    at: number;
    side: 0 | 1;
    pts: number;
    text: string;
}

/** Un partido que la computadora jugó sola: el resultado ya está guardado, esto es para mirarlo. */
interface SimWatchData {
    home: SevenTeam;
    away: SevenTeam;
    score: [number, number];
    minutes: number;
    items: WatchItem[];
}

/** Cuánto dura el relato (segundos de verdad) para todo el partido. */
const WATCH_SECONDS = 14;

/** Pasa el partido simulado como relato: reloj, marcador que sube y cada jugada, con salto al final. */
function SimWatch({ data, onClose }: { data: SimWatchData; onClose: () => void }) {
    const [t, setT] = useState(0);
    const done = t >= data.minutes;
    useEffect(() => {
        if (done) return;
        const step = data.minutes / (WATCH_SECONDS * 10);
        const id = setInterval(() => setT((x) => Math.min(data.minutes, x + step)), 100);
        return () => clearInterval(id);
    }, [done, data.minutes]);
    const seen = data.items.filter((i) => i.at <= t);
    const now: [number, number] = [0, 0];
    for (const i of seen) now[i.side] += i.pts;
    const [a, b] = done ? data.score : now;
    const kind = data.score[0] > data.score[1] ? 'victoria' : data.score[0] < data.score[1] ? 'derrota' : 'empate';
    const mm = Math.floor(t);
    const ss = Math.floor((t - mm) * 60);
    return (
        <div className={styles.simWatch} role="dialog" aria-modal="true" aria-label={`Partido simulado: ${data.home.name} contra ${data.away.name}`}>
            <div className={styles.simWatchBoard}>
                <span className={styles.simWatchTeam}>
                    <SpritePreview look={data.home.players[0]} kit={data.home.kit} scale={2} />
                    <b>{data.home.short}</b>
                </span>
                <span className={styles.simWatchNums} aria-live="polite">
                    {a} <small>-</small> {b}
                </span>
                <span className={styles.simWatchTeam}>
                    <SpritePreview look={data.away.players[0]} kit={data.away.kit} scale={2} />
                    <b>{data.away.short}</b>
                </span>
            </div>
            <span className={styles.simWatchClock}>
                {done ? 'Final' : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`}
                {!done && t >= data.minutes / 2 ? ' · segundo tiempo' : ''}
            </span>
            <ol className={styles.simWatchList} aria-label="Jugadas">
                {seen.length === 0 && <li className={styles.simWatchEmpty}>Arranca el partido.</li>}
                {[...seen].reverse().map((i, k) => (
                    <li key={`${i.at}-${k}`} className={i.side === 0 ? styles.simWatchMine : styles.simWatchTheirs}>
                        <b>{Math.max(1, Math.ceil(i.at))}'</b> {i.text}
                    </li>
                ))}
            </ol>
            {done && (
                <strong className={`${styles.simWatchEnd} ${kind === 'victoria' ? styles.simWatchWin : kind === 'derrota' ? styles.simWatchLoss : ''}`}>
                    {kind === 'victoria' ? 'VICTORIA' : kind === 'derrota' ? 'DERROTA' : 'EMPATE'}
                </strong>
            )}
            <div className={styles.simWatchActions}>
                {!done && (
                    <button type="button" className={styles.simBtn} onClick={() => setT(data.minutes)}>
                        Saltar al final
                    </button>
                )}
                <button type="button" className={styles.btnPrimary} onClick={onClose}>
                    {done ? 'Seguir ▶' : 'Cerrar'}
                </button>
            </div>
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
    // Mi Club: el club que se está fundando (camiseta y nombre) y su región.
    const [mcDraft, setMcDraft] = useState<SevenTeam | null>(null);
    const [mcRegion, setMcRegion] = useState<McRegion | null>(null);
    const [mcWorld, setMcWorld] = useState<McWorld>('ar');
    // Modo carrera: el nombre de tu jugador (opcional); arranca un poco arriba del nivel de tu club.
    const [careerPlayer, setCareerPlayer] = useState('');
    // Tu jugador (el marquee): nombre, puesto (0 a 6) y cuál de las siete caras del club es la suya.
    const [mcPlayer, setMcPlayer] = useState<{ name: string; pos: number; look: number }>({ name: '', pos: 4, look: 0 });
    const [coachName, setCoachName] = useState('');
    /** País elegido para la carrera nueva. */
    const [careerCountry, setCareerCountry] = useState<string>('ar');
    /** La primera vez que se abre el juego se pide el nombre del entrenador. */
    const [askCoach, setAskCoach] = useState(false);
    useEffect(() => {
        const c = readCoach();
        if (c) setCoachName(c);
        else if (c === '') setAskCoach(true);
    }, []);
    // El tutorial sale una sola vez, la primera vez que se abre el juego. Se anota al arrancarlo, así
    // no vuelve aunque lo salteen o cierren la pestaña a la mitad. Lo recuerdan el navegador Y la
    // cuenta: hay celulares que borran el navegador al cerrar (el de Instagram o WhatsApp, el modo
    // incógnito) y ahí salía en cada visita. Sin la marca local se le pregunta a la cuenta antes de
    // mostrarlo; sin sesión la cuenta contesta que no y todo queda como antes.
    useEffect(() => {
        let seenHere: boolean;
        try {
            seenHere = localStorage.getItem(TUTORIAL_KEY) === '1';
        } catch {
            return; // Sin localStorage no hay cómo recordarlo: mejor no mostrarlo en cada visita.
        }
        if (seenHere) return; // la cuenta se pone al día en el efecto de abajo, si hay sesión
        let cancelled = false;
        void tutorialSeenInAccount().then((seenInAccount) => {
            if (cancelled) return;
            try {
                localStorage.setItem(TUTORIAL_KEY, '1');
            } catch {
                // Sin localStorage: la cuenta igual lo recuerda si hay sesión.
            }
            void markTutorialSeenInAccount();
            if (!seenInAccount) setScreen({ k: 'drill', kind: 'tutorial', nonce: nextNonce() });
        });
        return () => {
            cancelled = true;
        };
    }, []);
    // Un solo objeto: la vista del partido rearma el motor cada vez que cambia la config.
    const drillConfig = useMemo(drillCfg, []);
    const [celebratedKey, setCelebratedKey] = useState<string | null>(null);
    /** El cartel de la última simulación (victoria, derrota o empate). */
    const [simFlash, setSimFlash] = useState<SimFlash | null>(null);
    const closeSimFlash = useCallback(() => setSimFlash(null), []);
    const [watch, setWatch] = useState<SimWatchData | null>(null);
    const closeWatch = useCallback(() => setWatch(null), []);
    // Una carrera guardada antes de los torneos en paralelo: se arman una vez y quedan en la partida.
    useEffect(() => {
        const fixed = tour ? ensureOthers(tour) : null;
        if (fixed) persist({ tour: fixed });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tour]);
    const [palmaresKey, setPalmaresKey] = useState<string | null>(null);
    const [hubTab, setHubTab] = useState<HubTab>('tabla');
    // El panel del próximo partido (dificultad, duración y cómo jugarlo): se abre tocando el versus de arriba.
    const [matchOpen, setMatchOpen] = useState(false);
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
    // Sin conexión: el juego queda guardado en el teléfono cada vez que abre con internet.
    const offline = useOfflineReady(GAME_FLAGS, [
        '/juegos/rugby-seven/dedo.png',
        ...[musicSrc, menuMusicSrc].filter((src): src is string => Boolean(src)),
    ]);

    /** Idioma de la interfaz: español, o inglés (una capa que traduce lo que se ve; ver i18n.ts). */
    const [lang, setLang] = useState<Lang>('es');
    const pageRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => setLang(readLang()), []);
    useEffect(() => {
        const root = pageRef.current;
        if (lang !== 'en' || !root) return;
        return startTranslating(root);
    }, [lang]);
    /** Editar clubes: lo que se busca, la liga elegida y un contador para repintar cuando cambia el catálogo. */
    const [clubQuery, setClubQuery] = useState('');
    /** Liga propia: el nombre que se le pone. */
    const [customName, setCustomName] = useState('');
    /** Modo carrera: un equipo propio (id) que ocupa el lugar del club elegido. */
    const [careerReplace, setCareerReplace] = useState('');
    const [clubLeague, setClubLeague] = useState('');
    const [, setClubTick] = useState(0);

    useEffect(() => {
        // Los clubes editados antes se aplican al catálogo antes de armar nada con ellos.
        applyStoredClubEdits();
        const saved = loadSaved();
        const list = saved.tours.map((t) => (t ? settleCareer(t) : null));
        // Una carrera vieja se lleva a la versión actual al abrirse: se guarda enseguida, así no se rehace.
        if (list.some((t, i) => t !== saved.tours[i])) saveSaved({ customTeams: saved.customTeams, cup: saved.cup, tours: list });
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

    // Con sesión, el tutorial visto en este navegador se anota también en la cuenta (una vez): así,
    // si el celular borra el navegador, la próxima visita no lo vuelve a mostrar.
    useEffect(() => {
        if (!userId) return;
        try {
            if (localStorage.getItem(TUTORIAL_KEY) !== '1') return;
        } catch {
            return;
        }
        void markTutorialSeenInAccount();
    }, [userId]);

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
    const matchOn = screen.k === 'match' || screen.k === 'drill';
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

    // Todo el juego es fijo: sin zoom de pellizco, doble toque ni Ctrl+rueda (en la cancha no se puede, y afuera confundía).
    useEffect(() => {
        const stop = (e: Event) => e.preventDefault();
        const pinch = (e: TouchEvent) => {
            if (e.touches.length > 1) e.preventDefault();
        };
        const wheel = (e: WheelEvent) => {
            if (e.ctrlKey) e.preventDefault();
        };
        document.addEventListener('gesturestart', stop);
        document.addEventListener('gesturechange', stop);
        document.addEventListener('touchmove', pinch, { passive: false });
        document.addEventListener('wheel', wheel, { passive: false });
        document.addEventListener('dblclick', stop);
        return () => {
            document.removeEventListener('gesturestart', stop);
            document.removeEventListener('gesturechange', stop);
            document.removeEventListener('touchmove', pinch);
            document.removeEventListener('wheel', wheel);
            document.removeEventListener('dblclick', stop);
        };
    }, []);

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
            ...ZONES.map((z) => ({ name: `${z} · femenino`, group: 'Internacional femenino', kind: 'Continente', teams: FEM_NATIONS.filter((t) => NATION_ZONE[t.id] === z).sort(byRating) })),
            ...CLUB_LEAGUES.map((l) => ({ name: l.name, group: 'Clubes', kind: 'Liga', teams: l.teams })),
            ...AR_DIVISIONS_PLAYABLE.map((d) => ({ name: d.label, group: branchGroup(d.branch), kind: 'División', teams: d.clubs.map((id) => teamOfCode(id)).filter((t): t is SevenTeam => !!t) })),
            { name: 'Inventados', teams: PRESET_TEAMS },
            { name: 'Mis equipos', teams: customTeams },
        ];
    }, [customTeams]);

    // Mi Club: el club propio, con el nivel que da su plantel de hoy y sus siete titulares.
    const mcTeam = useMemo(() => (tour?.miclub ? myTeam(tour.miclub) : null), [tour?.miclub]);
    const ownTeams = useMemo(() => (mcTeam ? [...customTeams, mcTeam] : customTeams), [customTeams, mcTeam]);
    const allTeams = useMemo(() => [...ownTeams, ...NATIONS, ...FEM_NATIONS, ...CLUBS, ...AR_CLUBS, ...PRESET_TEAMS], [ownTeams]);
    // Los equipos propios también se resuelven por código (ligas y torneos con ellos adentro).
    registerCustomTeams(ownTeams);
    // Nivel de los equipos propios y, en una carrera, lo que cada club ganó o perdió con las temporadas.
    setRatingContext(Object.fromEntries(ownTeams.map((t) => [t.id, t.rating ?? 70])),tour?.career ? careerBoosts(tour.career) : tour?.svns ? svnsBoosts(tour.svns) : tour?.intl ? intlBoosts(tour.intl) : undefined);
    // En una carrera: quién juega en cada puesto y la localía; afuera, nada.
    if (tour?.career) applyCareerContext(tour.career);
    else setCareerContext();
    const byId = (id: string | null) => {
        const t = allTeams.find((x) => x.id === id) ?? null;
        if (!t) return t;
        // En una carrera: el plantel de este año (retiros, cantera, nombres editados) y el nivel que ganó o perdió.
        const names = tour?.career ? careerNames(tour.career, t) : tour?.intl && t.id === tour.intl.me ? intlNames(tour.intl) : null;
        const boosted = ratingBoost(t.id) ? Math.round(ratingOf(t.id)) : null;
        if (!names && boosted === null) return t;
        return { ...t, ...(boosted !== null ? { rating: boosted } : {}), ...(names ? { names } : {}) };
    };
    /** Nombre completo de un jugador de un equipo, para las tablas de goleadores. */
    const playerName = (team: string, slot: number) => {
        const t = byId(team);
        if (!t) return '—';
        // En la carrera los goleadores se anotan por jugador (id), no por puesto.
        const n = tour?.career ? careerPlayerName(tour.career, t, slot) : playerNames(t)[slot];
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

    /**
     * Amistoso entre dos equipos cualquiera, sin jugarlo: la computadora lo resuelve.
     * Con `watchIt` se muestra como relato; si no, solo el cartel con el resultado. No toca ninguna partida guardada.
     */
    const simQuick = (watchIt: boolean) => {
        const home = byId(mine);
        const away = byId(rival);
        if (!home || !away) return;
        const score = simulate(home.id, away.id, false, 0);
        if (!watchIt) {
            setSimFlash({ home, away, score });
            return;
        }
        const events = [...scoreEvents(home.id, score[0]), ...scoreEvents(away.id, score[1])];
        const minutes = duration;
        const items: WatchItem[] = [];
        for (const team of [home.id, away.id]) {
            const side: 0 | 1 = team === home.id ? 0 : 1;
            const own = events.filter((e) => e.team === team);
            const convs = own.filter((e) => e.kind === 'conv');
            own.filter((e) => e.kind === 'try').forEach((e, i) => {
                const at = 0.4 + Math.random() * (minutes - 0.8);
                items.push({ at, side, pts: 5, text: `Try de ${playerName(team, e.slot)}` });
                const c = convs[i];
                if (c) items.push({ at: Math.min(minutes, at + 0.15), side, pts: 2, text: `Conversión de ${playerName(team, c.slot)}` });
            });
            own.filter((e) => e.kind === 'drop').forEach((e) => items.push({ at: 0.4 + Math.random() * (minutes - 0.8), side, pts: 3, text: `Drop de ${playerName(team, e.slot)}` }));
        }
        items.sort((x, y) => x.at - y.at);
        setWatch({ home, away, score, minutes, items });
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
            persist({ tour: tourRound(tour, null) });
            return;
        }
        const home = byId(tour.me);
        const away0 = byId(opp);
        if (!home || !away0) return;
        const r = tour.career;
        // De visitante en la fase regular, el local suma la localía.
        const away = r && tour.stage === 'grupos' && !nextIsHome(tour) ? { ...away0, rating: (away0.rating ?? 70) + HOME_ADV } : away0;
        const skills: MatchConfig['skills'] = r ? [careerSkills(r, tour.me), careerSkills(r, opp)] : undefined;
        play({ home, away, difficulty: tour.difficulty, minutes: tour.duration, suddenDeath: tour.stage === 'ko', skills }, 'tour');
    };

    /** Simula el partido del usuario (o todos los que le quedan en la etapa) con el nivel de cada equipo. */
    const simTourMatch = (all: boolean) => {
        if (!tour) return;
        let s = tour;
        let last: { opp: string; score: [number, number] } | null = null;
        const rec: [number, number, number] = [0, 0, 0];
        for (let guard = 0; guard < 200 && !s.done && !s.eliminated; guard++) {
            const o = nextOpponent(s);
            if (s.career) applyCareerContext(s.career);
            const ko = s.stage === 'ko';
            // La localía del simulado: suma el que juega en su cancha (en el cuadro, neutral).
            const adv = ko || !s.career ? 0 : nextIsHome(s) ? HOME_ADV : -HOME_ADV;
            const score = o ? simulate(s.me, o, ko, adv) : null;
            if (o && score) {
                last = { opp: o, score };
                rec[score[0] > score[1] ? 0 : score[0] === score[1] ? 1 : 2] += 1;
            }
            s = tourRound(s, score);
            if (!all && o) break;
        }
        persist({ tour: s });
        const home = byId(s.me);
        const away = last ? byId(last.opp) : null;
        if (last && home && away) setSimFlash({ home, away, score: last.score, record: rec[0] + rec[1] + rec[2] > 1 ? rec : undefined });
    };

    /**
     * La computadora juega el partido del usuario sola y se lo muestra como relato. El resultado se
     * guarda ya (igual que al jugarlo), el relato es solo para mirarlo.
     */
    const watchTourMatch = () => {
        if (!tour) return;
        const o = nextOpponent(tour);
        if (!o) return;
        if (tour.career) applyCareerContext(tour.career);
        const ko = tour.stage === 'ko';
        const adv = ko || !tour.career ? 0 : nextIsHome(tour) ? HOME_ADV : -HOME_ADV;
        const score = simulate(tour.me, o, ko, adv);
        const events = [...scoreEvents(tour.me, score[0]), ...scoreEvents(o, score[1])];
        const home = byId(tour.me);
        const away = byId(o);
        if (!home || !away) return;
        const minutes = tour.duration;
        const items: WatchItem[] = [];
        for (const team of [tour.me, o]) {
            const side: 0 | 1 = team === tour.me ? 0 : 1;
            const mine = events.filter((e) => e.team === team);
            const tries = mine.filter((e) => e.kind === 'try');
            const convs = mine.filter((e) => e.kind === 'conv');
            tries.forEach((e, i) => {
                const at = 0.4 + Math.random() * (minutes - 0.8);
                items.push({ at, side, pts: 5, text: `Try de ${playerName(team, e.slot)}` });
                const c = convs[i];
                if (c) items.push({ at: Math.min(minutes, at + 0.15), side, pts: 2, text: `Conversión de ${playerName(team, c.slot)}` });
            });
            mine.filter((e) => e.kind === 'drop').forEach((e) => items.push({ at: 0.4 + Math.random() * (minutes - 0.8), side, pts: 3, text: `Drop de ${playerName(team, e.slot)}` }));
        }
        items.sort((x, y) => x.at - y.at);
        persist({ tour: tourRound(tour, score, events) });
        setWatch({ home, away, score, minutes, items });
    };

    /** Un amistoso de pretemporada: se juega (o se simula) y deja moral, o una lesión. */
    const friendly = (opp: string, sim: boolean) => {
        if (!tour?.career) return;
        const home = byId(tour.me);
        const away = byId(opp);
        if (!home || !away) return;
        if (sim) {
            const score = simulate(tour.me, opp, true);
            persist({ tour: preseasonFriendly(tour, opp, score) });
            setSimFlash({ home, away, score });
            return;
        }
        play({ home, away, difficulty: tour.difficulty, minutes: tour.duration, suddenDeath: true, skills: [careerSkills(tour.career, tour.me), careerSkills(tour.career, opp)] }, 'friendly');
    };

    const startRoad = () => {
        if (!mine) return;
        persist({ tour: createRoad(mine, difficulty, duration) });
        setHubTab('tabla');
        setScreen({ k: 'tour' });
    };

    const startCareer = () => {
        if (!mine) return;
        // Un equipo propio en lugar del club: toma su nombre, su camiseta y su plantel (se deshace en Editar clubes).
        const own = careerReplace ? customTeams.find((c) => c.id === careerReplace) : null;
        if (own) saveClubEdit(mine, { name: own.name, short: own.short, kit: own.kit, players: own.players });
        setCareerReplace('');
        persist({ tour: createCareer(mine, difficulty, duration, coachName || readCoach() || undefined, careerPlayer.trim() ? { name: careerPlayer } : undefined) });
        setHubTab('tabla');
        setScreen({ k: 'tour' });
    };

    const nextCareerStage = (format?: NacFormat, playSud = false) => {
        if (!tour) return;
        persist({ tour: advanceCareer(tour, format, playSud) });
        setNacPick(null);
        setHubTab('tabla');
    };

    const nextRoadStage = () => {
        if (!tour) return;
        persist({ tour: advanceRoad(tour) });
        setHubTab('tabla');
    };

    const startIntl = () => {
        if (!mine) return;
        persist({ tour: createIntl(mine, difficulty, duration) });
        setHubTab('tabla');
        setScreen({ k: 'tour' });
    };

    const startMiClub = () => {
        if (!mcDraft || !mcRegion) return;
        persist({ tour: createMiClub({ team: mcDraft, region: mcRegion, world: mcWorld, player: mcPlayer }, difficulty, duration) });
        setMcDraft(null);
        setMcRegion(null);
        setHubTab('tabla');
        setScreen({ k: 'tour' });
    };

    /** Mi Club: cierra la temporada (ascensos, descensos, plantel) y arranca la siguiente; se ve en la Pirámide. */
    const nextMcSeason = () => {
        if (!tour) return;
        persist({ tour: advanceMiClub(tour) });
        setHubTab('piramide');
    };

    const nextIntlStage = () => {
        if (!tour) return;
        const t = advanceIntl(tour);
        persist({ tour: t });
        // Al cerrar el año, a la temporada nueva (ahí está el resumen del cierre).
        setHubTab(t.intl && tour.intl && t.intl.season !== tour.intl.season ? 'temporada' : 'tabla');
    };

    const startSvns = () => {
        if (!mine) return;
        persist({ tour: createSvns(mine, difficulty, duration) });
        setHubTab('tabla');
        setScreen({ k: 'tour' });
    };

    const nextSvnsStage = () => {
        if (!tour) return;
        persist({ tour: advanceSvns(tour) });
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
            // En la carrera el autor es el jugador (id) que estaba en ese puesto.
            const teamOf = (side: 0 | 1) => (side === 0 ? cfg.home.id : cfg.away.id);
            const events: ScoreEvent[] = [];
            const misses: number[] = [];
            for (const e of log) {
                if (!e.stat) continue;
                const team = teamOf(e.side);
                const id = playerAt(team, e.stat.slot);
                if (e.stat.kind === 'miss') {
                    if (e.side === 0) misses.push(id);
                } else events.push({ team, slot: id, kind: e.stat.kind });
            }
            persist({ tour: tourRound(tour, score, events, misses) });
        }
        if (mode === 'friendly' && tour) persist({ tour: preseasonFriendly(tour, cfg.away.id, score) });
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
        // Con las tarjetas en grilla, las cuatro flechas recorren el menú en orden.
        if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[wrap(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1), btns.length)]?.focus();
        e.preventDefault();
    };

    const inMatch = screen.k === 'match' || screen.k === 'drill';
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
        svnsSetup: 'Circuito SVNS',
        intlSetup: 'Carrera internacional',
        mcSetup: 'Mi Club',
        careerSetup: 'Modo carrera',
        newPick: 'Nuevo torneo',
        tour: tourDef?.name ?? 'Torneo',
        cupSetup: 'Copa Seven',
        cup: 'Copa Seven',
        teams: 'Mis equipos',
        edit: 'Editor de equipo',
        result: 'Final del partido',
    };
    const stepOf = 'step' in screen ? screen.step : null;

    return (
        <div ref={pageRef} lang={lang} className={`${styles.page} ${pixel.className}`}>
            <div className={inMatch ? `${styles.shell} ${styles.shellMatch}` : styles.shell}>
                {/* En el partido la cancha se queda con toda la pantalla: el título queda para lectores de pantalla y salir está en la pausa. */}
                {inMatch && <h1 className={styles.srOnly}>Rugby Seven</h1>}
                {!inMatch && (
                <header className={styles.bar}>
                    <h1 className={screen.k === 'menu' ? styles.srOnly : styles.titleSmall}>Rugby Seven</h1>
                    {screen.k !== 'menu' && !inMatch && (
                        <span className={styles.barTitle}>
                            {titles[screen.k]}
                            {stepOf ? <small> · paso {stepOf} de 2</small> : null}
                        </span>
                    )}
                    <button
                        type="button"
                        className={`${styles.exitBtn} ${styles.musicBtn}`}
                        onClick={() => {
                            const next: Lang = lang === 'en' ? 'es' : 'en';
                            writeLang(next);
                            setLang(next);
                        }}
                        aria-label={lang === 'en' ? 'Cambiar a español' : 'Switch to English'}
                        lang={lang === 'en' ? 'es' : 'en'}
                    >
                        {lang === 'en' ? 'ES' : 'EN'}
                    </button>
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
                    {screen.k !== 'menu' && (
                        <button type="button" className={styles.exitBtn} onClick={() => setScreen({ k: 'menu' })} aria-label="Salir al menú de Rugby Argento">
                            ◀ Salir
                        </button>
                    )}
                    <Link href="/juegos/minijuegos" className={`${styles.exitBtn} ${styles.exitGames}`} aria-label="Volver a los minijuegos">
                        {screen.k === 'menu' ? '✕ Salir' : '✕ Minijuegos'}
                    </Link>
                </header>
                )}
                {menuMusicSrc && <audio ref={menuAudio} src={menuMusicSrc} loop preload="auto" />}

                {askCoach && screen.k === 'menu' && (
                    <CoachPrompt
                        initial={coachName}
                        onDone={(n) => {
                            saveCoach(n);
                            setCoachName(n);
                            setAskCoach(false);
                        }}
                    />
                )}
                {screen.k === 'menu' && (
                    <div className={styles.menuScreen}>
                        <div className={styles.logo}>
                            <p className={styles.title} aria-hidden="true">Rugby Seven</p>
                            <p className={styles.subtitle}>Siete contra siete · pelota en mano · siempre para adelante</p>
                            {coachName && (
                                <button type="button" className={styles.coachLine} onClick={() => setAskCoach(true)} aria-label={`Entrenador: ${coachName}. Cambiar el nombre`}>
                                    Entrenador: <b>{coachName}</b> · cambiar
                                </button>
                            )}
                            {(offline === 'ready' || offline === 'offline') && (
                                <p className={styles.offlineLine} role="status">
                                    {offline === 'offline'
                                        ? 'Sin conexión: jugás igual. Tu cuenta se pone al día cuando vuelva la señal.'
                                        : 'Listo para jugar sin conexión en este dispositivo.'}
                                </p>
                            )}
                        </div>
                        <div className={styles.runway} aria-hidden="true">
                            <div className={styles.runners}>
                                {(['ARG', 'NZL', 'FRA', 'FIJ', 'RSA', 'JPN'] as const).map((c, i) => {
                                    const t = teamOfCode(c);
                                    return <SpritePreview key={c} look={t.players[i % 7]} kit={t.kit} scale={4} running />;
                                })}
                            </div>
                        </div>
                        {(() => {
                            // Lo que está en juego: cada partida guardada que sigue (con su próximo partido) y la Copa Seven.
                            const live = tours
                                .map((t, i) => ({ t, i }))
                                .filter((x): x is { t: TourState; i: number } => {
                                    const t = x.t;
                                    if (!t) return false;
                                    const finished = !t.career && !t.svns && !t.intl && !t.miclub && (t.road ? t.road.out || (t.road.phase === 'wc' && t.done) : t.done || t.eliminated);
                                    return !finished;
                                });
                            if (!live.length && !cupLive) return null;
                            return (
                                <section className={styles.continueBox} aria-labelledby="menu-seguir">
                                    <h2 className={styles.menuGroupTitle} id="menu-seguir">
                                        Seguir jugando<small>Tus partidas en curso</small>
                                    </h2>
                                    <div className={styles.continueGrid}>
                                        {live.map(({ t, i }) => {
                                            const me = t.miclub ? myTeam(t.miclub) : byId(t.me);
                                            const playing = !t.done && !t.eliminated;
                                            const opp = playing ? nextOpponent(t) : null;
                                            const mode = t.miclub ? 'Mi Club' : t.career ? 'Modo carrera' : t.intl ? 'Carrera internacional' : t.svns ? 'Circuito SVNS' : t.road ? 'Road to Rugby World Cup' : 'Torneo';
                                            const season = t.miclub ? ` · temporada ${t.miclub.season}` : t.career ? ` · temporada ${t.career.season}` : t.intl ? ` · ${t.intl.season}` : t.svns ? ` · temporada ${t.svns.season}` : '';
                                            const comp = t.miclub ? phaseName(t) : (defOf(t)?.name ?? '').replace(/ \d{4}$/, '');
                                            const next = !playing ? 'Terminó la etapa: pasá a la siguiente.' : opp ? `${roundLabel(t)} · vs ${nameOf(opp)}` : `${roundLabel(t)} · fecha libre`;
                                            return (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    className={styles.continueCard}
                                                    onClick={() => {
                                                        setSlot(i);
                                                        setHubTab('tabla');
                                                        setScreen({ k: 'tour' });
                                                    }}
                                                    aria-label={`Seguir: ${mode}, ${me?.name ?? ''}. ${next}`}
                                                >
                                                    {me && (
                                                        <span className={styles.continueSprite} aria-hidden="true">
                                                            <SpritePreview look={me.players[0]} kit={me.kit} scale={3} running />
                                                        </span>
                                                    )}
                                                    <span className={styles.continueText}>
                                                        <small>
                                                            {mode}
                                                            {season}
                                                        </small>
                                                        <strong>
                                                            <FlagIcon code={me?.flag} size={16} /> {me?.name ?? 'Equipo borrado'}
                                                        </strong>
                                                        <span>
                                                            {comp} · {next}
                                                        </span>
                                                    </span>
                                                    <span className={styles.continueCta} aria-hidden="true">
                                                        Seguir ▶
                                                    </span>
                                                </button>
                                            );
                                        })}
                                        {cupLive && cup && (
                                            <button type="button" className={styles.continueCard} onClick={() => setScreen({ k: 'cup' })} aria-label={`Seguir la Copa Seven: te toca ${CUP_ROUNDS[cup.round].toLowerCase()}`}>
                                                <span className={styles.continueSprite} aria-hidden="true">
                                                    ♛
                                                </span>
                                                <span className={styles.continueText}>
                                                    <small>Copa Seven</small>
                                                    <strong>Te toca: {CUP_ROUNDS[cup.round].toLowerCase()}</strong>
                                                    <span>Cuartos, semi y final contra rivales al azar.</span>
                                                </span>
                                                <span className={styles.continueCta} aria-hidden="true">
                                                    Seguir ▶
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                </section>
                            );
                        })()}
                        <div className={styles.menu} onKeyDown={onMenuKey} role="menu" aria-label="Menú principal">
                            <div className={styles.menuGroup} role="group" aria-labelledby="menu-jugar">
                                <h2 className={styles.menuGroupTitle} id="menu-jugar">Jugar ahora<small>Un partido y listo</small></h2>
                                <div className={styles.menuGrid}>
                                    <button type="button" role="menuitem" className={styles.menuBtn} style={{ '--acc': '#3fbf5a' } as React.CSSProperties} onClick={() => setScreen({ k: 'quick', step: 1 })}>
                                        <span className={styles.menuIcon} aria-hidden="true">▶</span>
                                        <strong>Partido rápido</strong>
                                        <span>Elegís los dos equipos y a la cancha.</span>
                                    </button>
                                    <button type="button" role="menuitem" className={styles.menuBtn} style={{ '--acc': '#4aa3ff' } as React.CSSProperties} onClick={() => setScreen({ k: 'drill', kind: 'practice', nonce: nextNonce() })}>
                                        <span className={styles.menuIcon} aria-hidden="true">◎</span>
                                        <strong>Práctica</strong>
                                        <span>Repetí los ejercicios: moverte, pasar, chocar, tacklear, el ruck y patear.</span>
                                    </button>
                                    <button type="button" role="menuitem" className={styles.menuBtn} style={{ '--acc': '#f0c419' } as React.CSSProperties} onClick={() => setScreen(cupLive ? { k: 'cup' } : { k: 'cupSetup', step: 1 })}>
                                        <span className={styles.menuIcon} aria-hidden="true">♛</span>
                                        <strong>{cupLive ? 'Seguir la Copa Seven' : 'Copa Seven'}</strong>
                                        <span>{cupLive && cup ? `Te toca: ${CUP_ROUNDS[cup.round].toLowerCase()}.` : 'Cuartos, semi y final contra rivales al azar.'}</span>
                                    </button>
                                </div>
                            </div>
                            <div className={styles.menuGroup} role="group" aria-labelledby="menu-carreras">
                                <h2 className={styles.menuGroupTitle} id="menu-carreras">Carreras<small>Temporada tras temporada, con guardado</small></h2>
                                <div className={styles.menuGrid}>
                                    {(() => {
                                        // Mi Club: si ya hay uno fundado, lo retoma; si no, lo funda en la primera partida libre.
                                        const mcSlot = tours.findIndex((t) => !!t?.miclub);
                                        const live = mcSlot >= 0 ? tours[mcSlot]?.miclub : null;
                                        return (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className={styles.menuBtn} style={{ '--acc': '#ff8a3d' } as React.CSSProperties}
                                                onClick={() => {
                                                    if (live) {
                                                        setSlot(mcSlot);
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
                                                    setMcDraft(null);
                                                    setMcRegion(null);
                                                    setScreen({ k: 'mcSetup', step: 1 });
                                                }}
                                            >
                                                <span className={styles.menuIcon} aria-hidden="true">⚑</span>
                                                <strong>{live ? 'Seguir con Mi Club' : 'Mi Club'}</strong>
                                                <span>
                                                    {live
                                                        ? `${live.team.name} · temporada ${live.season} · ${levelDef(levelOf(live, live.me) ?? 'base').label}.`
                                                        : tours.some((t) => !t)
                                                          ? 'Fundás tu club y lo llevás de la Regional a Primera, en Argentina o en Sudamérica.'
                                                          : 'Las tres partidas están ocupadas: borrá una para empezar.'}
                                                </span>
                                            </button>
                                        );
                                    })()}
                                    {(() => {
                                        // Si ya hay una carrera guardada, este botón la retoma; si no, arranca una en la primera partida libre.
                                        const careerSlot = tours.findIndex((t) => !!t?.career);
                                        const live = careerSlot >= 0 ? tours[careerSlot]?.career : null;
                                        return (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                className={styles.menuBtn} style={{ '--acc': '#e04848' } as React.CSSProperties}
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
                                                    setScreen({ k: 'careerSetup', step: 0 });
                                                }}
                                            >
                                                <span className={styles.menuIcon} aria-hidden="true">◆</span>
                                                <strong>{live ? 'Seguir la carrera' : 'Modo carrera'}</strong>
                                                <span>
                                                    {live
                                                        ? `${nameOf(live.me)} · temporada ${live.season} · ${divisionLabel(divisionOf(live, live.me) ?? '')}.`
                                                        : tours.some((t) => !t)
                                                          ? 'Un club de Argentina, Sudáfrica, Inglaterra, Francia, Portugal y más, varias temporadas: ascensos, descensos y títulos.'
                                                          : 'Las tres partidas están ocupadas: borrá una para empezar.'}
                                                </span>
                                            </button>
                                        );
                                    })()}
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={styles.menuBtn} style={{ '--acc': '#5ad1e6' } as React.CSSProperties}
                                        onClick={() => {
                                            const free = tours.findIndex((t) => !t);
                                            if (free < 0) {
                                                setScreen({ k: 'slots' });
                                                return;
                                            }
                                            setSlot(free);
                                            setScreen({ k: 'intlSetup', step: 1 });
                                        }}
                                    >
                                        <span className={styles.menuIcon} aria-hidden="true">◎</span>
                                        <strong>Carrera interna&shy;cional</strong>
                                        <span>{tours.some((t) => !t) ? 'Una selección de XV, año tras año: divisiones, Mundial, ranking en vivo y el desarrollo de tu país.' : 'Las tres partidas están ocupadas: borrá una para empezar.'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={styles.menuBtn} style={{ '--acc': '#b072ff' } as React.CSSProperties}
                                        onClick={() => {
                                            const free = tours.findIndex((t) => !t);
                                            if (free < 0) {
                                                setScreen({ k: 'slots' });
                                                return;
                                            }
                                            setSlot(free);
                                            setScreen({ k: 'svnsSetup', step: 1 });
                                        }}
                                    >
                                        <span className={styles.menuIcon} aria-hidden="true">✦</span>
                                        <strong>Circuito SVNS</strong>
                                        <span>{tours.some((t) => !t) ? 'Una selección de seven, del regional al SVNS 1. Varones y mujeres.' : 'Las tres partidas están ocupadas: borrá una para empezar.'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        className={styles.menuBtn} style={{ '--acc': '#2fd3a0' } as React.CSSProperties}
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
                                </div>
                            </div>
                            <div className={styles.menuGroup} role="group" aria-labelledby="menu-equipos">
                                <h2 className={styles.menuGroupTitle} id="menu-equipos">Torneos y equipos<small>Tus partidas, tus camisetas</small></h2>
                                <div className={styles.menuGrid}>
                                    <button type="button" role="menuitem" className={styles.menuBtn} style={{ '--acc': '#ffd36b' } as React.CSSProperties} onClick={() => setScreen({ k: 'slots' })}>
                                        <span className={styles.menuIcon} aria-hidden="true">★</span>
                                        <strong>Torneos</strong>
                                        <span>{savedCount ? `${savedCount} de ${TOUR_SLOTS} partidas guardadas.` : 'Selecciones, clubes de Europa y del sur, y el rugby argentino.'}</span>
                                    </button>
                                    <button type="button" role="menuitem" className={styles.menuBtn} style={{ '--acc': '#ff6fb0' } as React.CSSProperties} onClick={() => setScreen({ k: 'teams' })}>
                                        <span className={styles.menuIcon} aria-hidden="true">✎</span>
                                        <strong>Mis equipos</strong>
                                        <span>Armá tu camiseta y tu plantel de siete.</span>
                                    </button>
                                    <button type="button" role="menuitem" className={styles.menuBtn} style={{ '--acc': '#9ea5b6' } as React.CSSProperties} onClick={() => setScreen({ k: 'clubs' })}>
                                        <span className={styles.menuIcon} aria-hidden="true">⚙</span>
                                        <strong>Editar clubes</strong>
                                        <span>Cambiá el nombre, la camiseta y los jugadores de cualquier club.</span>
                                    </button>
                                </div>
                            </div>
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
                            {btn('Resultado rápido', () => simQuick(false))}
                            {btn('Ver simulación', () => simQuick(true))}
                            {btn('Jugar ▶', startQuick, true)}
                        </div>
                    </div>
                )}

                {screen.k === 'slots' && (
                    <div className={styles.body}>
                        <div className={styles.slotList}>
                            {tours.map((t, i) => {
                                const d = t ? defOf(t) : null;
                                // El club de Mi Club vive dentro de su partida: se arma de ahí, no del catálogo.
                                const me = t ? (t.miclub ? myTeam(t.miclub) : byId(t.me)) : null;
                                const finished = !!t && !t.career && !t.svns && !t.intl && !t.miclub &&(t.road ? t.road.out || (t.road.phase === 'wc' && t.done) : t.done || t.eliminated);
                                return (
                                    <section key={i} className={`${styles.saveSlot} ${i === slot && t ? styles.saveSlotOn : ''}`} aria-label={`Partida ${i + 1}`}>
                                        <header className={styles.slotHead}>Partida {i + 1}</header>
                                        {t && d ? (
                                            <>
                                                <strong className={styles.saveTitle}>{t.miclub ? `Mi Club · temporada ${t.miclub.season}` : t.intl ? `Carrera internacional · ${t.intl.season}` : t.svns ? `Circuito SVNS · temporada ${t.svns.season}` : t.road ? 'Road to Rugby World Cup' : t.career ? `Carrera · temporada ${t.career.season}` : d.name}</strong>
                                                <span className={styles.saveTeam}>
                                                    <FlagIcon code={me?.flag} size={20} /> {me?.name ?? 'Equipo borrado'}
                                                </span>
                                                <span className={styles.saveMeta}>{t.intl ? d.name : t.svns ? `${SVNS_PHASE_LABEL[t.svns.phase]} · ${d.name}` : t.road ? `${PHASE_LABEL[t.road.phase]} · ${d.name}` : t.career ? `${CAREER_PHASE_LABEL[t.career.phase]} · ${d.name}` : d.formatLabel}</span>
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
                                                            setScreen({ k: 'newPick' });
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

                {screen.k === 'newPick' && (
                    <div className={styles.body}>
                        <div className={styles.cardGrid} role="group" aria-label="Qué querés jugar">
                            <button type="button" className={styles.pickCard} onClick={() => setScreen({ k: 'tourPick' })}>
                                <strong>Jugar un torneo</strong>
                                <span>Selecciones, clubes de Europa y del sur, y las ligas de Argentina, Uruguay, Brasil y Chile. Un torneo y listo.</span>
                                <small>Elegí el país o la categoría</small>
                            </button>
                            <button
                                type="button"
                                className={styles.pickCard}
                                onClick={() => {
                                    setMcDraft(null);
                                    setMcRegion(null);
                                    setScreen({ k: 'mcSetup', step: 1 });
                                }}
                            >
                                <strong>Mi Club</strong>
                                <span>Fundás tu club y arrancás en la Regional, en Argentina o en Sudamérica: subís hasta Primera y la Copa de América.</span>
                                <small>Argentina o Sudamérica · varones</small>
                            </button>
                            <button type="button" className={`${styles.pickCard} ${styles.pickCardAlt}`} onClick={() => setScreen({ k: 'careerSetup', step: 0 })}>
                                <strong>Modo carrera</strong>
                                <span>Un club, temporada tras temporada: plantel, pretemporada, ascensos, descensos y títulos.</span>
                                <small>Argentina, Europa, Sudáfrica, Oceanía y más: decenas de ligas · varones y mujeres</small>
                            </button>
                            <button type="button" className={styles.pickCard} onClick={() => setScreen({ k: 'svnsSetup', step: 1 })}>
                                <strong>Circuito SVNS</strong>
                                <span>Una selección de seven, temporada tras temporada: del regional al SVNS 3, al SVNS 2 y al SVNS 1, con ascensos y descensos.</span>
                                <small>Selecciones · varones y mujeres</small>
                            </button>
                            <button type="button" className={`${styles.pickCard} ${styles.pickCardAlt}`} onClick={() => setScreen({ k: 'intlSetup', step: 1 })}>
                                <strong>Carrera interna&shy;cional</strong>
                                <span>Una selección de XV, año tras año: subís de división, buscás el Mundial y desarrollás el rugby de tu país. Ranking de World Rugby en vivo.</span>
                                <small>Selecciones · varones y mujeres</small>
                            </button>
                        </div>
                        <div className={styles.footerBtns}>
                            {btn('◀ Partidas', () => setScreen({ k: 'slots' }))}
                        </div>
                    </div>
                )}

                {screen.k === 'careerSetup' && screen.step === 0 && (
                    <div className={styles.body}>
                        <div className={styles.cardGrid} role="group" aria-label="País de la carrera">
                            {CAREER_COUNTRIES.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className={styles.pickCard}
                                    onClick={() => {
                                        setCareerCountry(c.id);
                                        if (countryOfClub(mine) !== c.id) setMine(firstClubOf(c.id));
                                        setScreen({ k: 'careerSetup', step: 1 });
                                    }}
                                >
                                    <strong>
                                        <FlagIcon code={c.flag} size={20} /> {c.name}
                                    </strong>
                                    <span>{c.sub}</span>
                                    <small>{AR_DIVISIONS_PLAYABLE.filter((d) => c.branches.includes(d.branch)).length} divisiones</small>
                                </button>
                            ))}
                        </div>
                        <div className={styles.footerBtns}>
                            {btn('◀ Volver', () => setScreen({ k: 'newPick' }))}
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
                                                <strong>
                                                    {CAT_FLAG[c.id] && <FlagIcon code={CAT_FLAG[c.id]} size={20} />} {c.id}
                                                </strong>
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
                            <h2 className={styles.pickTitle}>
                                {CAT_FLAG[tourCat] && <FlagIcon code={CAT_FLAG[tourCat]} size={22} />} {tourCat}
                            </h2>
                            <div className={styles.cardGrid}>
                                {CAREER_CATS.includes(tourCat) && (
                                    <button
                                        type="button"
                                        className={`${styles.pickCard} ${styles.pickCardAlt}`}
                                        onClick={() => {
                                            const id = CAREER_COUNTRIES.find((c) => c.name === tourCat)?.id ?? 'ar';
                                            setCareerCountry(id);
                                            if (countryOfClub(mine) !== id) setMine(firstClubOf(id));
                                            setScreen({ k: 'careerSetup', step: 1 });
                                        }}
                                    >
                                        <strong>Modo carrera</strong>
                                        <span>Un club, varias temporadas: ascensos, descensos y títulos.</span>
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

                {screen.k === 'careerSetup' && screen.step !== 0 && (() => {
                    // Cualquier club del país elegido, de cualquier división: la carrera arranca donde juega en 2026.
                    const country = CAREER_COUNTRIES.find((c) => c.id === careerCountry) ?? CAREER_COUNTRIES[0];
                    const arCats: Category[] = AR_DIVISIONS_PLAYABLE.filter((d) => country.branches.includes(d.branch)).map((d) => ({ name: d.label, group: branchGroup(d.branch), kind: 'División', teams: d.clubs.map((id) => teamOfCode(id)).filter((t): t is SevenTeam => !!t) }));
                    const valid = countryOfClub(mine) === country.id;
                    return screen.step === 1 ? (
                        <div className={styles.body}>
                            <div className={styles.single}>
                                <TeamChooser label="Tu club" teamId={valid ? mine : null} onChange={setMine} categories={arCats} />
                                <p className={styles.note}>
                                    {country.id === 'ar'
                                        ? 'Jugás la división de tu club temporada tras temporada: ascensos y descensos, el Torneo del Interior con las plazas de tu región, y el Nacional de Clubes si salís campeón del Top 14 o del TDI A.'
                                        : `Jugás la división de tu club temporada tras temporada. ${country.sub}`}
                                </p>
                                {customTeams.length > 0 && (
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel} htmlFor="seven-career-replace">Jugar con un equipo tuyo</label>
                                        <select id="seven-career-replace" className={styles.input} value={careerReplace} onChange={(e) => setCareerReplace(e.target.value)} disabled={!valid}>
                                            <option value="">No: jugar con el club tal cual</option>
                                            {customTeams.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} reemplaza a {byId(mine)?.name ?? 'este club'}
                                                </option>
                                            ))}
                                        </select>
                                        {careerReplace && <p className={styles.note}>El club toma el nombre, la camiseta y los siete jugadores de tu equipo. Lo deshacés en Editar clubes.</p>}
                                    </div>
                                )}
                            </div>
                            <div className={styles.footerBtns}>
                                {btn('◀ Países', () => setScreen({ k: 'careerSetup', step: 0 }))}
                                {!valid && <span className={styles.missing}>Elegí un club de {country.name}.</span>}
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
                            <label className={styles.coachField}>
                                <span>Tu jugador (opcional): el crack del club</span>
                                <input value={careerPlayer} onChange={(e) => setCareerPlayer(e.target.value.slice(0, 28))} placeholder="Nombre y apellido" maxLength={28} autoComplete="off" />
                            </label>
                            <p className={styles.note}>Si lo creás, se suma al plantel un poco por encima del nivel de tu club, con 19 años, y crece entrenándolo en cada pretemporada. No se retira antes de los 37.</p>
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
                    const pools = [...(customTeams.length ? [{ name: 'Mis equipos', teams: customTeams }] : []), ...ZONES.map((z) => ({ name: z as string, teams: NATIONS.filter((t) => NATION_ZONE[t.id] === z).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)) })), ...ZONES.map((z) => ({ name: `${z} · femenino`, teams: FEM_NATIONS.filter((t) => NATION_ZONE[t.id] === z).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)) })), ...CLUB_LEAGUES.map((l) => ({ name: l.name, teams: l.teams })), ...AR_DIVISIONS_PLAYABLE.map((d) => ({ name: d.label, teams: d.clubs.map((id) => teamOfCode(id)).filter((t): t is SevenTeam => !!t) }))];
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
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel} htmlFor="seven-league-name">Nombre de tu liga</label>
                                        <input id="seven-league-name" className={styles.input} value={customName} maxLength={32} onChange={(e) => setCustomName(e.target.value)} placeholder="Torneo personalizado" />
                                    </div>
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
                                        name: customName.trim() || 'Torneo personalizado',
                                        sub: `${customField.length} equipos.`,
                                        // Con equipos propios o clubes entre los participantes se elige "tu club", no "tu selección".
                                        clubs: customField.some((c) => !/^[A-Z]{3}(-F)?$/.test(c)) || undefined,
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

                {screen.k === 'mcSetup' &&
                    (screen.step === 1 ? (
                        <div className={styles.body}>
                            <p className={styles.note}>Diseñá tu club: nombre, sigla del marcador, camiseta y caras.</p>
                            <TeamEditor
                                initial={mcDraft ?? makeNewTeam()}
                                saveLabel="Siguiente ▶"
                                onSave={(t) => {
                                    setMcDraft(t);
                                    setScreen({ k: 'mcSetup', step: 2 });
                                }}
                                onCancel={() => setScreen({ k: 'newPick' })}
                            />
                        </div>
                    ) : (
                        <div className={styles.body}>
                            <div className={styles.nacAsk} role="radiogroup" aria-label="Dónde juega tu club">
                                <span className={styles.nacAskQ}>¿En qué pirámide juega {mcDraft?.name.trim() || 'tu club'}?</span>
                                <div className={styles.regionGrid}>
                                    {(['ar', 'sa'] as McWorld[]).map((w) => (
                                        <button
                                            key={w}
                                            type="button"
                                            role="radio"
                                            aria-checked={mcWorld === w}
                                            className={`${styles.nacOpt} ${mcWorld === w ? styles.nacOptOn : ''}`}
                                            onClick={() => {
                                                setMcWorld(w);
                                                setMcRegion(null);
                                            }}
                                        >
                                            <strong>{WORLDS[w].label}</strong>
                                            <small>
                                                {WORLDS[w].levels.length} divisiones · {WORLDS[w].pool.length} clubes
                                            </small>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className={styles.nacAsk} role="radiogroup" aria-label={mcWorld === 'sa' ? 'País de tu club' : 'Región de tu club'}>
                                <span className={styles.nacAskQ}>
                                    ¿De {mcWorld === 'sa' ? 'qué país' : 'dónde'} es {mcDraft?.name.trim() || 'tu club'}?
                                </span>
                                <div className={styles.regionGrid}>
                                    {WORLDS[mcWorld].regions.map((reg) => (
                                        <button key={reg} type="button" role="radio" aria-checked={mcRegion === reg} className={`${styles.nacOpt} ${mcRegion === reg ? styles.nacOptOn : ''}`} onClick={() => setMcRegion(reg)}>
                                            <strong>{mcRegionLabel(reg)}</strong>
                                        </button>
                                    ))}
                                </div>
                                <small className={styles.nacAskNote}>
                                    Define tu zona en la Regional y en las divisiones con zonas: tus rivales son los de tu {WORLDS[mcWorld].regionWord}.
                                </small>
                            </div>
                            <div className={styles.nacAsk}>
                                <span className={styles.nacAskQ}>Tu jugador · el crack del club</span>
                                <label className={styles.field}>
                                    <span className={styles.fieldLabel}>Nombre y apellido</span>
                                    <input className={styles.input} value={mcPlayer.name} maxLength={28} placeholder="Por ejemplo: Tomás Albornoz" onChange={(e) => setMcPlayer((p) => ({ ...p, name: e.target.value }))} />
                                </label>
                                <div role="radiogroup" aria-label="Puesto de tu jugador" className={styles.regionGrid}>
                                    {POSITIONS.map((label, i) => (
                                        <button key={i} type="button" role="radio" aria-checked={mcPlayer.pos === i} className={`${styles.nacOpt} ${mcPlayer.pos === i ? styles.nacOptOn : ''}`} onClick={() => setMcPlayer((p) => ({ ...p, pos: i }))}>
                                            <strong>{i === 0 ? 'Pilar izquierdo' : i === 2 ? 'Pilar derecho' : label}</strong>
                                        </button>
                                    ))}
                                </div>
                                {mcDraft && (
                                    <div role="radiogroup" aria-label="La cara de tu jugador" className={styles.lookPick}>
                                        {mcDraft.players.map((look, i) => (
                                            <button key={i} type="button" role="radio" aria-checked={mcPlayer.look === i} aria-label={`Cara ${i + 1}`} className={`${styles.lookOpt} ${mcPlayer.look === i ? styles.nacOptOn : ''}`} onClick={() => setMcPlayer((p) => ({ ...p, look: i }))}>
                                                <SpritePreview look={look} kit={mcDraft.kit} scale={2} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <small className={styles.nacAskNote}>
                                    Arranca un poco por encima del nivel de su división y crece con el club: entrenándolo con créditos y jugando. Es tuyo: no se libera.
                                </small>
                            </div>
                            <SettingsStep teams={[mcDraft]} difficulty={difficulty} setDifficulty={setDifficulty} duration={duration} setDuration={setDuration} />
                            <div className={styles.roadInfo}>
                                <strong>Cómo es Mi Club · {WORLDS[mcWorld].label}</strong>
                                <span>
                                    {WORLDS[mcWorld].levels.length} divisiones con los {WORLDS[mcWorld].pool.length} clubes de varones{' '}
                                    {mcWorld === 'sa' ? 'de Chile, Brasil, Uruguay, Perú, México y Colombia' : 'de Argentina'}: {WORLDS[mcWorld].levels.map((l) => l.label).join(', ')}. Arrancás en la Regional, con un plantel de pibes del barrio.
                                </span>
                                <span>{WORLDS[mcWorld].levels.at(-1)!.upHow}</span>
                                <span>A la par de la liga, cada tantas fechas, la copa de tu división: todos sus clubes, mata-mata.</span>
                                <span>
                                    Desde mitad de año, la {WORLDS[mcWorld].nacName}, con los que van arriba en ese momento. {nacHowOf({ world: mcWorld })}.
                                </span>
                                <span>
                                    En Primera, además, la {LIB_NAME}: los 8 mejores de la Primera de Argentina contra los 8 mejores de la de Sudamérica, mata-mata.
                                </span>
                                <span>Los clubes de la pirámide suben y bajan como vos: la tabla de cada división se ve fecha a fecha.</span>
                            </div>
                            <p className={styles.note}>Se guarda en la partida {slot + 1}{tour ? ', en lugar de la que había' : ''}.</p>
                            <div className={styles.footerBtns}>
                                {btn('◀ Camiseta', () => setScreen({ k: 'mcSetup', step: 1 }))}
                                {(!mcRegion || !mcPlayer.name.trim()) && (
                                    <span className={styles.missing}>{!mcRegion ? 'Elegí la región de tu club para empezar.' : 'Poné el nombre de tu jugador para empezar.'}</span>
                                )}
                                {btn('Fundar el club ▶', startMiClub, true, !mcDraft || !mcRegion || !mcPlayer.name.trim())}
                            </div>
                        </div>
                    ))}

                {screen.k === 'intlSetup' && (() => {
                    const byRating = (a: SevenTeam, b: SevenTeam) => (b.rating ?? 0) - (a.rating ?? 0);
                    const cats: Category[] = [
                        ...ZONES.map((z) => ({ name: z, group: 'Varones', kind: 'Continente', teams: NATIONS.filter((t) => NATION_ZONE[t.id] === z).sort(byRating) })),
                        ...ZONES.map((z) => ({ name: `${z} · femenino`, group: 'Mujeres', kind: 'Continente', teams: FEM_NATIONS.filter((t) => NATION_ZONE[t.id] === z).sort(byRating) })),
                    ];
                    const valid = !!mine && (mine.startsWith('nat-') || mine.startsWith('natf-'));
                    const fem = !!mine && mine.startsWith('natf-');
                    return screen.step === 1 ? (
                        <div className={styles.body}>
                            <div className={styles.single}>
                                <TeamChooser label="Tu selección" teamId={valid ? mine : null} onChange={setMine} categories={cats} />
                                {valid && mine && <p className={styles.note}>Arrancás en 2026, en el {intlStartComp(mine)}.</p>}
                            </div>
                            <div className={styles.footerBtns}>
                                {btn('◀ Partidas', () => setScreen({ k: 'slots' }))}
                                {!valid && <span className={styles.missing}>Elegí una selección (varones o mujeres) para empezar.</span>}
                                {btn('Siguiente ▶', () => setScreen({ k: 'intlSetup', step: 2 }), true, !valid)}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.body}>
                            <SettingsStep teams={[byId(mine)]} difficulty={difficulty} setDifficulty={setDifficulty} duration={duration} setDuration={setDuration} />
                            <div className={styles.roadInfo}>
                                <strong>Cómo es la carrera</strong>
                                {fem ? (
                                    <>
                                        <span>Cada año: tu regional (Women’s Six Nations, Pacific Four, Rugby Europe, Asia, África, Oceanía o Américas) y, si estás adentro, el WXV en septiembre-octubre. El Mundial es en 2029 y 2033: lo juegan las 16 mejores del ranking.</span>
                                        <span>En el WXV y en Europa sube la campeona del escalón de abajo y baja la última.</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Cada año: tu regional (Six Nations, Rugby Europe Championship, Trophy o Conference, Rugby Championship, Pacific Nations Cup, Sudamérica, Asia o África), y en julio y noviembre el Nations Championship, la Nations Cup o los test.</span>
                                        <span>En Europa y Sudamérica sube el campeón de abajo y baja el último. Desde 2030, el campeón de la Nations Cup sube al Nations Championship.</span>
                                        <span>Mundial en 2027, 2031, 2035… Al siguiente van directo las 12 mejores; el resto se gana en los regionales del año anterior y en los repechajes.</span>
                                    </>
                                )}
                                <span>Entre torneo y torneo dirigís la unión: liga local, academia, staff y red de elegibles. Los plazos son los del rugby: un juvenil tarda 3 años en llegar y uno por residencia, 5.</span>
                            </div>
                            <p className={styles.note}>Se guarda en la partida {slot + 1}{tour ? ', en lugar de la que había' : ''}.</p>
                            <div className={styles.footerBtns}>
                                {btn('◀ Selección', () => setScreen({ k: 'intlSetup', step: 1 }))}
                                {btn('Empezar la carrera ▶', startIntl, true, !valid)}
                            </div>
                        </div>
                    );
                })()}

                {screen.k === 'svnsSetup' && (() => {
                    const byRating = (a: SevenTeam, b: SevenTeam) => (b.rating ?? 0) - (a.rating ?? 0);
                    const cats: Category[] = [
                        ...ZONES.map((z) => ({ name: z, group: 'Varones', kind: 'Continente', teams: NATIONS.filter((t) => NATION_ZONE[t.id] === z).sort(byRating) })),
                        ...ZONES.map((z) => ({ name: `${z} · femenino`, group: 'Mujeres', kind: 'Continente', teams: FEM_NATIONS.filter((t) => NATION_ZONE[t.id] === z).sort(byRating) })),
                    ];
                    const valid = !!mine && (mine.startsWith('nat-') || mine.startsWith('natf-'));
                    const tier = valid && mine ? svnsStartTier(mine) : null;
                    return screen.step === 1 ? (
                        <div className={styles.body}>
                            <div className={styles.single}>
                                <TeamChooser label="Tu selección" teamId={valid ? mine : null} onChange={setMine} categories={cats} />
                                {tier && mine && (
                                    <p className={styles.note}>
                                        {tier === 'reg'
                                            ? `Arrancás en el ${svnsRegionName(mine)}: el campeón va al SVNS 3.`
                                            : `Arrancás en el ${TIER_LABEL[tier]}, como en 2026.`}
                                    </p>
                                )}
                            </div>
                            <div className={styles.footerBtns}>
                                {btn('◀ Partidas', () => setScreen({ k: 'slots' }))}
                                {!valid && <span className={styles.missing}>Elegí una selección (varones o mujeres) para empezar.</span>}
                                {btn('Siguiente ▶', () => setScreen({ k: 'svnsSetup', step: 2 }), true, !valid)}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.body}>
                            <SettingsStep teams={[byId(mine)]} difficulty={difficulty} setDifficulty={setDifficulty} duration={duration} setDuration={setDuration} />
                            <div className={styles.roadInfo}>
                                <strong>Cómo es el circuito</strong>
                                <span>Regional: el campeón de cada zona va al SVNS 3.</span>
                                <span>SVNS 3: ocho selecciones, un torneo. Las dos primeras suben al SVNS 2.</span>
                                <span>SVNS 2: seis selecciones, {SVNS_LEGS.s2} etapas que suman puntos. Las cuatro primeras juegan el World Championship; las dos últimas bajan al SVNS 3.</span>
                                <span>SVNS 1: ocho selecciones, {SVNS_LEGS.s1} etapas. La que más suma es campeona del circuito.</span>
                                <span>World Championship: las 8 del SVNS 1 y las 4 mejores del SVNS 2. Las 8 primeras juegan el SVNS 1 del año siguiente.</span>
                            </div>
                            <p className={styles.note}>Se guarda en la partida {slot + 1}{tour ? ', en lugar de la que había' : ''}.</p>
                            <div className={styles.footerBtns}>
                                {btn('◀ Selección', () => setScreen({ k: 'svnsSetup', step: 1 }))}
                                {btn('Empezar el circuito ▶', startSvns, true, !valid)}
                            </div>
                        </div>
                    );
                })()}

                {screen.k === 'tourSetup' && setupDef && (() => {
                    const def = setupDef;
                    const field = def.teams.map((c) => teamOfCode(c)).filter((t): t is SevenTeam => !!t).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
                    const valid = !!mine && field.some((t) => t.id === mine);
                    const outside = [...(def.teams.some((c) => c.startsWith('ar-')) ? AR_CLUBS : def.teams.some((c) => c.startsWith('club-')) ? CLUBS : def.teams.some((c) => c.endsWith('-F')) ? FEM_NATIONS : NATIONS), ...customTeams].filter((t) => !def.teams.includes(codeOfTeam(t))).sort((a, b) => a.name.localeCompare(b.name));
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
                    const svns = tour.svns ?? null;
                    const intl = tour.intl ?? null;
                    const miclub = tour.miclub ?? null;
                    const verdict = road ? roadVerdict(tour) : career ? careerVerdict(tour) : svns && tour.done ? svnsVerdict(tour) : intl && tour.done ? intlVerdict(tour) : miclub ? mcVerdict(tour) : null;
                    const tabs: [HubTab, string][] = [
                        ...(onlyKo ? [] : [['tabla', tour.groups.length > 1 ? (tour.cross ? 'Conferencias' : 'Grupos') : 'Tabla'] as ['tabla', string]]),
                        ['calendario', 'Calendario'],
                        ...(tour.hasKo ? [['cuadro', 'Cuadro'] as ['cuadro', string]] : []),
                        ['resultados', 'Resultados'],
                        ...(road ? [['camino', 'Camino al Mundial'] as ['camino', string]] : []),
                        ...(svns ? [['circuito', 'Circuito'] as ['circuito', string]] : []),
                        ...(intl
                            ? ([
                                  ['ranking', 'Ranking'],
                                  ['temporada', 'Temporada'],
                                  ['union', 'Unión'],
                                  ['plantel', 'Plantel'],
                                  ['juveniles', 'Juveniles'],
                              ] as [HubTab, string][])
                            : []),
                        ...(miclub
                            ? ([
                                  ['piramide', 'Pirámide'],
                                  ['plantel', 'Plantel'],
                                  ['fichajes', 'Fichajes'],
                                  ['club', 'Club'],
                              ] as [HubTab, string][])
                            : []),
                        ...(tour.stats ? [['goleadores', 'Goleadores'] as ['goleadores', string]] : []),
                        ...(career ? [['otros', 'Otros torneos'] as ['otros', string]] : []),
                        ...(career?.rosters ? [['plantel', 'Plantel'] as ['plantel', string]] : []),
                        ...(career ? [['club', 'Club'] as ['club', string]] : []),
                        ...(career ? [['palmares', 'Palmarés'] as ['palmares', string]] : []),
                        ...(career ? [['carrera', 'Carrera'] as ['carrera', string]] : []),
                    ];
                    const tab = tabs.some(([k]) => k === hubTab) ? hubTab : tabs[0][0];
                    const di = DIFFICULTIES.findIndex((d) => d.id === tour.difficulty);
                    const du = DURATIONS.indexOf(tour.duration);
                    const careerWins = career && tour.done ? pendingCelebration(career) : [];
                    // Festejo de título fuera de la carrera de clubes (suelto, Road, SVNS y selecciones): una clave por torneo jugado.
                    const soloKey =
                        !career && tour.done && tour.champion === tour.me
                            ? `${tour.tourId}:${tour.groupHistory.length}:${tour.koHistory.length}:${road?.phase ?? ''}:${svns ? `${svns.season}.${svns.phase}.${svns.leg}` : ''}:${intl ? `${intl.season}.${intl.step}` : ''}`
                            : null;
                    const celebrateTeam = careerWins.length || (soloKey && soloKey !== celebratedKey) ? byId(tour.me) : null;
                    const preseason = !!career && inPreseason(career) && !tour.done;
                    const news = career && !celebrateTeam ? unseenNews(career)[0] ?? null : null;
                    const h2h = career && opp ? headToHead(career, opp) : null;
                    const best = career ? clubRecords(career).find((x) => x.label === 'Máximo anotador') ?? null : null;
                    const homeNow = !!career && tour.stage === 'grupos' && nextIsHome(tour);
                    // Amistosos contra cualquier club: los de tu división primero, después cada división del país y de afuera, y las ligas del mundo.
                    const rivals = (() => {
                        if (!career) return [];
                        const fem = isFemBranch(career.branch);
                        const seen = new Set<string>([career.me]);
                        const out: { id: string; name: string; group: string }[] = [];
                        const push = (group: string, ids: string[]) => {
                            for (const id of [...ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'es'))) {
                                if (seen.has(id)) continue;
                                seen.add(id);
                                out.push({ id, name: nameOf(id), group });
                            }
                        };
                        const myDiv = divisionOf(career, career.me);
                        if (myDiv) push(`Tu división · ${divisionLabel(myDiv)}`, career.divisions[myDiv] ?? []);
                        for (const d of AR_DIVISIONS_PLAYABLE) {
                            if (isFemBranch(d.branch) !== fem) continue;
                            push(`${branchGroup(d.branch)} · ${d.label}`, career.divisions[d.id] ?? d.clubs);
                        }
                        if (!fem) for (const l of CLUB_LEAGUES) push(l.name, l.teams.map((t) => t.id));
                        return out;
                    })();
                    const nextStep = preseason
                        ? null
                        : tourLive
                        ? { label: opp ? 'Jugar ▶' : 'Simular la fecha ▶', run: playTourMatch }
                        : career && verdict?.next
                          ? { label: `${verdict.next} ▶`, run: () => nextCareerStage(closesSeason(tour) ? nacPick ?? formatOf(career, career.season + 1) : undefined) }
                          : road && verdict?.next
                            ? { label: `${verdict.next} ▶`, run: nextRoadStage }
                            : svns && verdict?.next
                              ? { label: `${verdict.next} ▶`, run: nextSvnsStage }
                              : intl && verdict?.next
                                ? { label: `${verdict.next} ▶`, run: nextIntlStage }
                                : miclub && verdict?.next
                                  ? { label: `${verdict.next} ▶`, run: nextMcSeason }
                                  : null;
                    const closeAnd = (f: () => void) => () => {
                        setMatchOpen(false);
                        f();
                    };
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
                            {news && meTeam && (
                                <NewsPopup
                                    key={`${career?.newsSeen ?? 0}-${news.title}`}
                                    news={news}
                                    team={meTeam}
                                    more={career ? unseenNews(career).length - 1 : 0}
                                    onClose={() => career && persist({ tour: { ...tour, career: { ...career, newsSeen: (career.newsSeen ?? 0) + 1 } } })}
                                    onSkipAll={() => persist({ tour: markNewsSeen(tour) })}
                                />
                            )}
                            <div className={styles.hub}>
                                <div className={styles.hubBar}>
                                    <button
                                        type="button"
                                        className={styles.vsMini}
                                        onClick={() => setMatchOpen(true)}
                                        aria-haspopup="dialog"
                                        aria-label={oppTeam && meTeam && tourLive ? `${meTeam.name} contra ${oppTeam.name}: abrir dificultad, duración y cómo jugar` : 'Abrir el detalle de la fecha'}
                                    >
                                        {oppTeam && meTeam && tourLive && !preseason ? (
                                            <>
                                                <span className={styles.vsMiniTeam}>
                                                    <SpritePreview look={meTeam.players[0]} kit={meTeam.kit} scale={2} running />
                                                    <b>{meTeam.name}</b>
                                                </span>
                                                <span className={styles.vsMiniBadge}>VS</span>
                                                <span className={styles.vsMiniTeam}>
                                                    <SpritePreview look={oppTeam.players[0]} kit={oppTeam.kit} scale={2} running />
                                                    <b>{oppTeam.name}</b>
                                                </span>
                                            </>
                                        ) : (
                                            <span className={styles.vsMiniText}>{tour.done && verdict ? verdict.title : preseason ? 'Pretemporada' : tour.done ? (tour.champion === tour.me ? 'Campeón' : 'Terminó el torneo') : 'Fecha libre'}</span>
                                        )}
                                        <small className={styles.vsMiniHint}>Tocá para ver opciones</small>
                                    </button>
                                    <div className={styles.hubBarInfo}>
                                        <strong>{miclub ? `${phaseName(tour)} · Temporada ${miclub.season}` : career ? `Temporada ${career.season}` : tourDef.name.replace(/ \d{4}$/, '')}</strong>
                                        <span>{tourLive ? roundLabel(tour) : tour.done ? 'Terminado' : ''}</span>
                                        {miclub && <McCredits n={miclub.credits} gain={miclub.lastGain ? `último partido ${miclub.lastGain.split(':')[0]}` : undefined} />}
                                    </div>
                                    {!preseason && (
                                        <button type="button" className={`${styles.btnPrimary} ${styles.hubBarGo}`} onClick={closeAnd(nextStep?.run ?? (() => setScreen({ k: 'slots' })))}>
                                            {nextStep?.label ?? 'Partidas ▶'}
                                        </button>
                                    )}
                                </div>
                                {(matchOpen || preseason) && (
                                <div className={styles.sheetLayer} onClick={() => setMatchOpen(false)}>
                                <div className={`${styles.nextCard} ${styles.hubSheet}`} role="dialog" aria-modal="true" aria-label="Próximo partido" onClick={(e) => e.stopPropagation()}>
                                    {!preseason && (
                                        <button type="button" className={styles.sheetClose} onClick={() => setMatchOpen(false)} aria-label="Cerrar">
                                            ✕
                                        </button>
                                    )}
                                    {road && <span className={styles.roadChip}>⚑ {nameOf(road.me)} · {PHASE_LABEL[road.phase]}</span>}
                                    {intl && (
                                        <span className={styles.roadChip}>
                                            ◎ {nameOf(intl.me)} · {intl.season} · {compName(intl.plan[intl.step])}
                                            {isWcYear(intl.gender, intl.season) ? ' · año de Mundial' : ''}
                                        </span>
                                    )}
                                    {svns && <span className={styles.roadChip}>✦ {nameOf(svns.me)} · Temporada {svns.season} · {SVNS_PHASE_LABEL[svns.phase]}</span>}
                                    {miclub && <span className={styles.roadChip}>⚑ {miclub.team.name} · Temporada {miclub.season} · {phaseName(tour)}</span>}
                                    {miclub && (
                                        <span className={styles.parallelNote}>
                                            <McCredits n={miclub.credits} gain={miclub.lastGain ? `último partido ${miclub.lastGain.split(':')[0]}` : undefined} />
                                        </span>
                                    )}
                                    {miclub && liveMine(tour).length > 1 && (
                                        <span className={styles.parallelNote}>
                                            También en juego:{' '}
                                            {liveMine(tour)
                                                .slice(1)
                                                .map((t) => `${(t.def?.name ?? '').replace(/ \d{4}$/, '')} · ${roundLabel(t).toLowerCase()}`)
                                                .join(' · ')}
                                        </span>
                                    )}
                                    {career && <span className={styles.roadChip}>⚑ {nameOf(career.me)} · Temporada {career.season} · {CAREER_PHASE_LABEL[career.phase]}</span>}
                                    {career?.parallel && !career.parallel.done && (
                                        <span className={styles.parallelNote}>
                                            En paralelo: {(defOf(career.parallel)?.name ?? '').replace(/ \d{4}$/, '')} · {roundLabel(career.parallel).toLowerCase()}
                                        </span>
                                    )}
                                    {(road || career || svns || intl || miclub) && tour.done && verdict ? (
                                        <>
                                            <div className={styles.champBox}>
                                                <span>{verdict.title}</span>
                                                <small>{verdict.text}</small>
                                            </div>
                                            {career && sudamericanoFor(tour) && (
                                                <div className={styles.nacAsk}>
                                                    <span className={styles.nacAskQ}>Clasificaste al Sudamericano de Clubes {career.season}</span>
                                                    <small className={styles.nacAskNote}>
                                                        {sudamericanoFor(tour)!.map((id) => nameOf(id)).join(' · ')}. Semifinales y final. Si seguís de largo, se simula.
                                                    </small>
                                                    <button type="button" className={styles.btnPrimary} onClick={() => nextCareerStage(isArgCareer(career) ? nacPick ?? formatOf(career, career.season + 1) : undefined, true)}>
                                                        Jugar el Sudamericano ▶
                                                    </button>
                                                </div>
                                            )}
                                            {career && isArgCareer(career) && closesSeason(tour) && (
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
                                    ) : preseason ? (
                                        <PreseasonPanel tour={tour} rivals={rivals} nameOf={nameOf} onChange={(t) => persist({ tour: t })} onFriendly={friendly} />
                                    ) : (
                                        <>
                                            <span className={styles.nextLabel}>
                                                {roundLabel(tour)}
                                                {career && opp ? (tour.stage === 'grupos' ? (homeNow ? ' · de local' : ' · de visitante: el rival suma la localía') : ' · cancha neutral') : ''}
                                            </span>
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
                                                        <Level rating={cpuRatingFor(tour.difficulty, oppTeam.rating)} />
                                                    </span>
                                                </div>
                                            ) : (
                                                <p className={styles.note}>Fecha libre: esta fecha la juegan los demás.</p>
                                            )}
                                            {h2h && <p className={styles.h2hNote}>{h2h}</p>}
                                            {career && best && <p className={styles.h2hNote}>{best.label} de tu carrera: {best.name} ({best.n}).</p>}
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
                                        return (
                                            <div className={styles.hubActions}>
                                                {!preseason && (
                                                    <button type="button" className={`${styles.btnPrimary} ${styles.hubMainBtn}`} onClick={closeAnd(nextStep?.run ?? (() => setScreen({ k: 'slots' })))}>
                                                        {nextStep?.label ?? 'Partidas ▶'}
                                                    </button>
                                                )}
                                                {tourLive && !preseason && (
                                                    <div className={styles.simRow}>
                                                        <button type="button" className={styles.simBtn} onClick={closeAnd(watchTourMatch)} disabled={!opp}>
                                                            Ver simulación
                                                        </button>
                                                        <button type="button" className={styles.simBtn} onClick={closeAnd(() => simTourMatch(false))} disabled={!opp}>
                                                            Resultado rápido
                                                        </button>
                                                        <button type="button" className={styles.simBtn} onClick={closeAnd(() => simTourMatch(true))}>
                                                            Simular todo
                                                        </button>
                                                    </div>
                                                )}
                                                {(nextStep || preseason) && (
                                                    <button type="button" className={styles.textBtn} onClick={() => setScreen({ k: 'slots' })}>
                                                        ◀ Volver a partidas
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                                </div>
                                )}

                                <div className={styles.hubMain}>
                                    <div className={styles.tabs} role="tablist" aria-label="Vista del torneo">
                                        {tabs.map(([k, l]) => (
                                            <button key={k} type="button" role="tab" aria-selected={tab === k} className={styles.tab} onClick={() => setHubTab(k)}>
                                                {l}
                                            </button>
                                        ))}
                                    </div>
                                    <div className={styles.hubPanel}>
                                        {tab === 'tabla' && miclub && <McTourTables s={tour} r={miclub} nameOf={nameOf} flag={(id) => <FlagIcon code={flagOf(id)} size={14} />} />}
                                        {tab === 'piramide' && miclub && <McPyramid s={tour} nameOf={nameOf} flag={(id) => <FlagIcon code={flagOf(id)} size={14} />} bracket={(t) => (defOf(t) ? <Bracket s={t} def={defOf(t)!} nameOf={nameOf} flagOf={flagOf} /> : null)} />}
                                        {tab === 'plantel' && miclub && <McSquad r={miclub} onTrain={(id) => persist({ tour: mcTrain(tour, id) })} onRelease={(id) => persist({ tour: mcRelease(tour, id) })} />}
                                        {tab === 'fichajes' && miclub && <McMarket r={miclub} nameOf={nameOf} onSign={(id) => persist({ tour: mcSign(tour, id) })} />}
                                        {tab === 'club' && miclub && <McClubPanel r={miclub} onUpgrade={(f) => persist({ tour: mcUpgrade(tour, f) })} />}
                                        {tab === 'tabla' && !miclub && (
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
                                            const moves = career.movesLog;
                                            const movesBox = moves && moves.lines.length > 0 && (
                                                <div className={styles.roadPending}>
                                                    <strong>Ascensos y descensos {moves.season}</strong>
                                                    {moves.lines.map((l, i) => (
                                                        <span key={i}>{l}</span>
                                                    ))}
                                                </div>
                                            );
                                            if (list.length === 0) return movesBox || <p className={styles.empty}>No hay otros torneos en juego.</p>;
                                            const cur = list.find((x) => x.key === otherKey) ?? list[0];
                                            const t = cur.state;
                                            const d = defOf(t);
                                            // Los partidos sueltos (promociones, repechajes, reválidas) van todos, sin tabla.
                                            const loose = t.tourId.startsWith('career-res-');
                                            const lastRounds = loose ? t.koHistory : [...t.koHistory].reverse().concat([...t.groupHistory].reverse()).slice(0, 2);
                                            return (
                                                <div className={styles.othersPanel}>
                                                    <label className={styles.othersPick}>
                                                        <span>Torneo</span>
                                                        <select value={cur.key} onChange={(e) => setOtherKey(e.target.value)}>
                                                            {[...new Set(list.map((x) => ('group' in x ? x.group : 'Tu club')))].map((g) => (
                                                                <optgroup key={g} label={g}>
                                                                    {list
                                                                        .filter((x) => ('group' in x ? x.group : 'Tu club') === g)
                                                                        .map((x) => (
                                                                            <option key={x.key} value={x.key}>
                                                                                {x.name} · {x.state.done ? 'terminado' : roundLabel(x.state).toLowerCase()}
                                                                            </option>
                                                                        ))}
                                                                </optgroup>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    {movesBox}
                                                    <p className={styles.note}>
                                                        {loose
                                                            ? 'Partido por partido: el que gana se queda con el lugar.'
                                                            : t.done
                                                              ? `Terminado · campeón: ${nameOf(t.champion ?? finalRanking(t)[0] ?? '')}.`
                                                              : `Va por: ${roundLabel(t).toLowerCase()}. Se juega a la par de tu temporada: avanza cada vez que jugás o simulás una fecha.`}
                                                    </p>
                                                    {/* Terminado con playoff: la tabla de la fase regular también, no solo el cuadro. */}
                                                    {!loose && (t.stage === 'grupos' || !t.hasKo || (t.done && t.groupHistory.length > 0)) && (
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
                                                                    <h3 className={styles.groupTitle}>{loose ? h.label : `${hi === 0 ? 'Última fecha' : 'Fecha anterior'} · ${h.label}`}</h3>
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
                                                            {(['rating', 'points', 'tackles', 'tries'] as const).map((by) => {
                                                                const rows = liveScorers(t, by, playerName, 10);
                                                                return (
                                                                    <div key={by} className={styles.groupCard}>
                                                                        <h4 className={styles.scorerTitle}>{by === 'tries' ? 'Tryman' : by === 'points' ? 'Goleador' : by === 'tackles' ? 'Mejor defensor' : 'Mejor jugador'}</h4>
                                                                        {rows.length === 0 ? (
                                                                            <p className={styles.empty}>Todavía no hay tantos.</p>
                                                                        ) : (
                                                                            <ol className={styles.scorerList}>
                                                                                {rows.map((x) => (
                                                                                    <li key={`${x.team}-${x.slot}`} className={x.team === tour.me ? styles.rowMine : undefined}>
                                                                                        <span>{x.name}</span>
                                                                                        <small><FlagIcon code={flagOf(x.team)} size={12} /> {nameOf(x.team)}</small>
                                                                                        <b>{by === 'tries' ? `${x.tries} tries` : by === 'points' ? `${x.points} pts` : by === 'tackles' ? `${x.tackles} tackles` : `${x.rating} pts · ${x.points} + ${x.tackles} tk`}</b>
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
                                                <LineupBoard tour={tour} kit={byId(career.me)?.kit} onChange={(t) => persist({ tour: t })} />
                                                <h3 className={styles.groupTitle}>Los doce</h3>
                                                <p className={styles.note}>
                                                    Valoración de 1 a 10 y skills: velocidad, patada, tackle y resistencia. La moral (▲▼) sube con los triunfos y los tries y baja con las derrotas y las patadas erradas. Cada año los jóvenes mejoran, los veteranos bajan y se retiran, y sube la camada de M19. Tocá un nombre para cambiarlo.
                                                </p>
                                                <RosterTable tour={tour} kit={byId(career.me)?.kit} onRename={(id, v) => persist({ tour: renamePlayer(tour, id, v) })} />
                                            </div>
                                        )}
                                        {tab === 'club' && career && <ClubPanel career={career} nameOf={nameOf} />}
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
                                                {isArgCareer(career) && (
                                                <div className={styles.roadPending}>
                                                    <span>Formato del Nacional de Clubes:</span>
                                                    {[0, 1, 2].map((k) => (
                                                        <span key={k}>
                                                            {career.season + k}: {NAC_FORMATS.find((f) => f.id === formatOf(career, career.season + k))?.label}
                                                            {k === 2 && !career.nacFormat?.[String(career.season + 2)] ? ' (se elige al cerrar esta temporada)' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                                )}
                                                {!isArgCareer(career) ? null : formatOf(career, career.season) === 'ab' && career.cuposAB ? (
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
                                                        <span>Premios de cada temporada (mejor jugador, goleador, mejor defensor y tryman):</span>
                                                        {[...(career.awards ?? [])].reverse().slice(0, 12).map((a, i) => {
                                                            const fmt = (x: { name: string; club: string; n: number } | undefined, unit: string) => (x ? `${x.name} (${nameOf(x.club)}, ${x.n}${unit})` : '—');
                                                            return (
                                                                <span key={i}>
                                                                    {a.season} · {a.comp}: mejor jugador {fmt(a.best?.[0], ' pts')} · goleador {fmt(a.points[0], ' pts')} · mejor defensor {fmt(a.tackles?.[0], ' tackles')} · tryman {fmt(a.tries[0], '')}
                                                                </span>
                                                            );
                                                        })}
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
                                        {tab === 'ranking' && intl && <IntlRanking r={intl} nameOf={nameOf} flag={(id) => <FlagIcon code={flagOf(id)} size={14} />} />}
                                        {tab === 'temporada' && intl && <IntlSeason r={intl} done={tour.done} nameOf={nameOf} flag={(id) => <FlagIcon code={flagOf(id)} size={14} />} />}
                                        {tab === 'union' && intl && <IntlUnion r={intl} onInvest={(a) => persist({ tour: intlInvest(tour, a) })} />}
                                        {tab === 'juveniles' && intl && <IntlYouth r={intl} nameOf={nameOf} flag={(id) => <FlagIcon code={flagOf(id)} size={14} />} />}
                                        {tab === 'plantel' && intl && <IntlSquad r={intl} onSign={(id) => persist({ tour: intlSign(tour, id) })} onCall={(id) => persist({ tour: intlToggleCall(tour, id) })} onStart={(id) => persist({ tour: intlToggleStarter(tour, id) })} />}
                                        {tab === 'circuito' && svns && (
                                            <div className={styles.roadPanel}>
                                                {svnsTable(tour) && (
                                                    <>
                                                        <h3 className={styles.groupTitle}>Tabla del {SVNS_PHASE_LABEL[svns.phase]} {svns.season} · después de {svns.leg - (tour.done ? 0 : 1)} de {SVNS_LEGS[svns.phase as 's1' | 's2']} etapas</h3>
                                                        <ul className={styles.roadSlots}>
                                                            {svnsTable(tour)!.map((x, i) => (
                                                                <li key={x.id} className={x.id === svns.me ? styles.rowMine : undefined}>
                                                                    <span>{i + 1}. <FlagIcon code={flagOf(x.id)} size={14} /> {nameOf(x.id)}</span>
                                                                    <small>{x.pts} pts</small>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </>
                                                )}
                                                <h3 className={styles.groupTitle}>SVNS 1 {svns.season}</h3>
                                                <ul className={styles.roadSlots}>
                                                    {svns.s1.map((id) => (
                                                        <li key={id} className={id === svns.me ? styles.rowMine : undefined}>
                                                            <span><FlagIcon code={flagOf(id)} size={14} /> {nameOf(id)}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                <h3 className={styles.groupTitle}>SVNS 2 {svns.season}</h3>
                                                <ul className={styles.roadSlots}>
                                                    {svns.s2.map((id) => (
                                                        <li key={id} className={id === svns.me ? styles.rowMine : undefined}>
                                                            <span><FlagIcon code={flagOf(id)} size={14} /> {nameOf(id)}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                {svns.s3direct.length > 0 && (
                                                    <div className={styles.roadPending}>
                                                        <span>Bajaron del SVNS 2 y juegan el SVNS 3: {svns.s3direct.map(nameOf).join(' y ')}.</span>
                                                    </div>
                                                )}
                                                {svns.titles.length > 0 && (
                                                    <>
                                                        <h3 className={styles.groupTitle}>Títulos</h3>
                                                        <ul className={styles.roadLog}>
                                                            {svns.titles.map((t, i) => (
                                                                <li key={i}>{t.season} · {t.label}</li>
                                                            ))}
                                                        </ul>
                                                    </>
                                                )}
                                                {svns.history.length > 0 && (
                                                    <>
                                                        <h3 className={styles.groupTitle}>Temporadas</h3>
                                                        <ul className={styles.roadLog}>
                                                            {[...svns.history].reverse().map((h) => (
                                                                <li key={h.season}>{h.season} · {h.text}</li>
                                                            ))}
                                                        </ul>
                                                    </>
                                                )}
                                                {svns.log.length > 0 && (
                                                    <ul className={styles.roadLog}>
                                                        {[...svns.log].reverse().map((l, i) => (
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
                            {customTeams.length >= 3 && (
                                btn('Crear una liga con mis equipos', () => {
                                    // Va a la primera partida libre (si están las tres ocupadas, a elegir cuál borrar).
                                    const free = tours.findIndex((t) => !t);
                                    if (free < 0) {
                                        setScreen({ k: 'slots' });
                                        return;
                                    }
                                    setSlot(free);
                                    // Arranca con todos tus equipos adentro: después sumás clubes o sacás los que no.
                                    setCustomField(customTeams.slice(0, 64).map((c) => c.id));
                                    setCustomName('');
                                    setCustomZone(0);
                                    setScreen({ k: 'customSetup' });
                                })
                            )}
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

                {screen.k === 'clubs' && (() => {
                    const q = clubQuery.trim().toLowerCase();
                    const leagues = [...new Set(EDITABLE_CLUBS.map((c) => c.league).filter((l): l is string => !!l))].sort((a, b) => a.localeCompare(b, 'es'));
                    const found = EDITABLE_CLUBS.filter((c) => (!clubLeague || c.league === clubLeague) && (!q || c.name.toLowerCase().includes(q) || c.short.toLowerCase() === q));
                    const shown = found.slice(0, 60);
                    return (
                        <div className={styles.body}>
                            <div className={styles.editorTop}>
                                <div className={styles.field}>
                                    <label className={styles.fieldLabel} htmlFor="seven-club-q">Buscar club</label>
                                    <input id="seven-club-q" className={styles.input} value={clubQuery} onChange={(e) => setClubQuery(e.target.value)} placeholder="Nombre del club" />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.fieldLabel} htmlFor="seven-club-league">Liga o división</label>
                                    <select id="seven-club-league" className={styles.input} value={clubLeague} onChange={(e) => setClubLeague(e.target.value)}>
                                        <option value="">Todas</option>
                                        {leagues.map((l) => (
                                            <option key={l} value={l}>
                                                {l}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className={styles.scrollPanel}>
                                {shown.length === 0 ? (
                                    <p className={styles.note}>No hay clubes con esa búsqueda.</p>
                                ) : (
                                    <ul className={styles.teamList}>
                                        {shown.map((t) => (
                                            <li key={t.id} className={styles.teamRow}>
                                                <span className={styles.teamSprites} aria-hidden="true">
                                                    {t.players.slice(0, 3).map((p, i) => (
                                                        <SpritePreview key={i} look={p} kit={t.kit} scale={2} />
                                                    ))}
                                                </span>
                                                <span className={styles.teamName}>
                                                    {t.name} <small>{t.league ?? t.short}{isClubEdited(t.id) ? ' · editado' : ''}</small>
                                                </span>
                                                <button type="button" className={styles.btnGhost} onClick={() => setScreen({ k: 'clubEdit', team: t })} aria-label={`Editar ${t.name}`}>
                                                    Editar
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {found.length > shown.length && <p className={styles.note}>Hay {found.length - shown.length} más: afiná la búsqueda o elegí una liga.</p>}
                            </div>
                            <div className={styles.footerBtns}>
                                {btn('◀ Menú', () => setScreen({ k: 'menu' }))}
                                <span className={styles.missing}>Los cambios se guardan en este navegador y valen en todos los modos.</span>
                            </div>
                        </div>
                    );
                })()}

                {screen.k === 'clubEdit' && (
                    <div className={styles.body}>
                        <div className={styles.scrollPanel}>
                            <TeamEditor
                                initial={screen.team}
                                saveLabel="Guardar club"
                                onSave={(t) => {
                                    saveClubEdit(screen.team.id, { name: t.name, short: t.short, kit: t.kit, players: t.players });
                                    setClubTick((n) => n + 1);
                                    setScreen({ k: 'clubs' });
                                }}
                                onReset={
                                    isClubEdited(screen.team.id)
                                        ? () => {
                                              resetClubEdit(screen.team.id);
                                              setClubTick((n) => n + 1);
                                              setScreen({ k: 'clubs' });
                                          }
                                        : undefined
                                }
                                onCancel={() => setScreen({ k: 'clubs' })}
                            />
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
                        onQuit={() => setScreen(screen.mode === 'cup' ? { k: 'cup' } : screen.mode === 'tour' || screen.mode === 'friendly' ? { k: 'tour' } : { k: 'quick', step: 1 })}
                    />
                )}

                {screen.k === 'drill' && (
                    <MatchView
                        key={screen.nonce}
                        cfg={drillConfig}
                        drill={screen.kind}
                        musicSrc={musicSrc}
                        fontFamily={pixel.style.fontFamily}
                        onFinish={() => setScreen({ k: 'menu' })}
                        onQuit={() => setScreen({ k: 'menu' })}
                    />
                )}

                {screen.k === 'result' && (
                    <div className={styles.body}>
                        <div className={styles.result}>
                            <p className={styles.resultLabel}>
                                {screen.mode === 'friendly' ? 'Amistoso · ' : ''}
                                {screen.score[0] > screen.score[1] ? 'Ganaste' : screen.score[0] < screen.score[1] ? 'Perdiste' : 'Empate'}
                            </p>
                            {screen.mode === 'friendly' && (
                                <p className={styles.note}>{screen.score[0] > screen.score[1] ? 'La moral de todo el plantel sube al máximo.' : 'La moral del plantel baja un punto.'}</p>
                            )}
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
                                {screen.mode === 'friendly' && btn('Volver a la pretemporada ▶', () => setScreen({ k: 'tour' }), true)}
                            </div>
                        </div>
                    </div>
                )}

                {/* Los carteles de simulación son de pantalla completa: valen en el menú (amistoso) y en los torneos. */}
                {simFlash && <SimResult flash={simFlash} onClose={closeSimFlash} />}
                {watch && <SimWatch data={watch} onClose={closeWatch} />}
            </div>
        </div>
    );
}
