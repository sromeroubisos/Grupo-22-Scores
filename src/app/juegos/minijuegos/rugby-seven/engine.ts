/*
 * Motor del Seven. Un partido es una clase mutable que avanza con update(dt)
 * y se dibuja con render(ctx) sobre un canvas de 384×216 que la página escala
 * en píxeles duros.
 *
 * Coordenadas en metros: x de 0 a 120 (in-goal de 10 en cada punta, try en
 * x=10 y x=110), y de 0 a 70 (ancho). El usuario (lado 0) ataca siempre hacia
 * la derecha; la máquina (lado 1) hacia la izquierda.
 *
 * Este juego no guarda partidas a medias ni necesita repetir resultados, así
 * que acá Math.random() es legítimo (la regla de determinismo es del motor de
 * Carrera, en features/career/engine).
 */

import { DIFF, type DiffParams, type Difficulty, type SevenTeam } from './teams';
import { playerNames } from './names';
import { DIVE_ANCHOR, drawBall, playerSprite, SPRITE_H, type Frame, type Kit, type Look } from './sprites';

// Cancha grande respecto del jugador: 80 m a la vista y 70 m de ancho en 210 px,
// así hay lugar para abrir la pelota, patear al fondo y que el fullback se vea.
export const VIEW_W = 480;
export const VIEW_H = 270;
/** Gracia al salir jugando de una pelota parada (s): tiempo para moverse sin recibir un tackle. */
const SAFE_EXIT = 1.6;
const PXM = 6; // píxeles por metro, a lo largo
const PYM = 3; // píxeles por metro, a lo ancho (vista inclinada)
const FIELD_TOP = 48;
const TRY_R = 110;
const TRY_L = 10;
const WIDTH = 70;
/** Trote para reacomodarse entre jugadas: nadie cruza la cancha en un cuadro. */
const WALK_SPEED = 9;

type Side = 0 | 1;
type Pose = 'stand' | 'ground' | 'dive' | 'celebrate' | 'scrum';
export type Phase = 'ready' | 'play' | 'ruck' | 'scrum' | 'lineout' | 'try' | 'conv' | 'convResult' | 'drop' | 'dropResult' | 'halftime' | 'end';

interface Player {
    side: Side;
    i: number;
    look: Look;
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: 1 | -1;
    pose: Pose;
    down: number; // segundos en el piso
    lunge: number; // tackle en el aire (lado del usuario)
    hit: number; // ventana de "chocar" del portador
    hitCd: number;
    juke: number; // ventana de amague
    jukeCd: number;
    jukeDir: number;
    cool: number; // no vuelve a chocar con el portador hasta que baje a 0
    passT: number;
    stun: number;
    anim: number;
    oy: number; // lugar en la línea, relativo al portador
    mark: Player | null;
    fb: boolean; // fullback: el que defiende queda siempre uno al fondo
    rucking: boolean; // está metido en el ruck, empujando sobre la pelota
    sk: PlayerSkill | null; // skills del modo carrera (null: el jugador promedio)
}

/**
 * Skills de un jugador (1 a 10, con la moral ya sumada). `fat0` es el cansancio
 * con que llega al partido (la seguidilla de la temporada): se resta de entrada.
 */
export interface PlayerSkill {
    spd: number;
    kick: number;
    tkl: number;
    sta: number;
    fat0?: number;
    /** Peso (kg) y altura (cm): mandan en el scrum y en el line. */
    kg?: number;
    cm?: number;
}

interface Flight {
    from: Player;
    to: Player;
    sx: number;
    sy: number;
    releaseX: number;
    /** Dónde estaba el receptor al soltarla: el adelantado se juzga por la dirección del pase, no por la carrera del que recibe. */
    toX0?: number;
    t: number;
    dur: number;
    tried: Set<Player>;
    skip?: boolean; // salteo: más largo y más fácil de leer para la defensa
    /** Patada: la pelota va a un punto, no a un compañero. */
    kick?: { tx: number; ty: number };
    goal?: boolean; // patada a los palos que entra: drop
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
    c: string;
}

type Minigame =
    | { kind: 'scrum'; user: number; cpu: number }
    | { kind: 'ruck'; mash: number }
    | { kind: 'timing'; cursor: number; dir: 1 | -1; speed: number; zone: number; userActs: boolean; done: boolean; win: boolean }
    | null;

export interface MatchConfig {
    home: SevenTeam;
    away: SevenTeam;
    difficulty: Difficulty;
    minutes: number;
    /** Partido que se tiene que definir: empate → un minuto extra; si sigue igual, muerte súbita. */
    suddenDeath: boolean;
    /** Skills de los siete de cada lado (modo carrera). Sin esto, todos promedio. */
    skills?: [PlayerSkill[] | null, PlayerSkill[] | null];
}

/** Cuánto se abre de costado el portador rival cuando lo apuran (m/s). */
const DODGE_VY: Record<Difficulty, number> = { 'muy-facil': 3.2, facil: 4, normal: 5, dificil: 5.8, leyenda: 6.3 };
/** Ancho del verde en tu saque de line, por dificultad (antes de la altura de los saltadores). */
const LINE_ZONE: Record<Difficulty, number> = { 'muy-facil': 0.36, facil: 0.3, normal: 0.24, dificil: 0.2, leyenda: 0.16 };
/** Robar el line del rival: la franja verde se achica con la dificultad. */
const LINE_STEAL: Record<Difficulty, number> = { 'muy-facil': 0.2, facil: 0.15, normal: 0.1, dificil: 0.08, leyenda: 0.06 };
/** Lo rápido que corre la marca del line: más difícil, más rápida. */
const LINE_SPEED: Record<Difficulty, number> = { 'muy-facil': 1.0, facil: 1.18, normal: 1.35, dificil: 1.5, leyenda: 1.68 };
/**
 * Puntos de velocidad personal (en la escala 1 a 10 de las skills) que la defensa rival suma sobre
 * su propio nivel, según la dificultad. Es un empujón a SUS estadísticas, no una velocidad fija:
 * contra un equipo mucho peor siguen siendo más lentos que tus jugadores.
 */
const CPU_DEF_SPD_PTS: Record<Difficulty, number> = { 'muy-facil': 0, facil: 0.5, normal: 1, dificil: 1.5, leyenda: 2 };
/** A qué velocidad corren los rivales a buscar una patada o una pelota suelta (m/s). */
const CPU_CHASE: Record<Difficulty, number> = { 'muy-facil': 6.6, facil: 7.5, normal: 8.3, dificil: 8.8, leyenda: 9.3 };
/** Pelota suelta disputada: lo que le cuesta al rival quedársela si llegan juntos. */
const CPU_GRAB: Record<Difficulty, number> = { 'muy-facil': 0.3, facil: 0.4, normal: 0.5, dificil: 0.58, leyenda: 0.66 };

/** Lo que dura el minuto extra antes de la muerte súbita (s). */
const EXTRA_LEN = 60;

export interface Hud {
    home: string;
    away: string;
    homeColor: string;
    awayColor: string;
    sh: number;
    sa: number;
    clock: string;
    period: string;
    banner: string | null;
    bannerSub: string | null;
    hint: string | null;
    attacking: boolean;
    phase: Phase;
    carrier: string | null; // "7 · F. Ferreyra"
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rnd = Math.random;

function colorDistance(a: string, b: string): number {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const dr = ((pa >> 16) & 255) - ((pb >> 16) & 255);
    const dg = ((pa >> 8) & 255) - ((pb >> 8) & 255);
    const db = (pa & 255) - (pb & 255);
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * La dificultad elegida es la base; el ranking la mueve mucho. Manda sobre
 * todo el nivel del rival (Nueva Zelanda, Sudáfrica o Francia son duros
 * siempre; Malta es accesible), y en menor medida el tuyo: con Argentina te
 * cuesta menos que con Paraguay. Sin ranking, 70.
 */
function withRating(base: DiffParams, cpuRating: number, userRating: number): DiffParams {
    // Manda la DIFERENCIA entre los dos: Perú contra Brasil es cuesta arriba aunque los dos estén lejos
    // de la elite. El nivel absoluto del rival suma un poco (un clásico entre potencias pide más).
    const f = clamp((cpuRating - userRating) / 14 + (cpuRating - 62) / 45, -1, 1);
    return {
        ...base,
        cpuRun: base.cpuRun + f * 0.9,
        cpuDefRun: base.cpuDefRun + f * 0.8,
        cpuTackle: clamp(base.cpuTackle * (1 + f * 0.35), 0.15, 0.96),
        cpuBreak: clamp(base.cpuBreak * (1 + f * 0.8), 0.03, 0.9),
        breakHit: clamp(base.breakHit * (1 - f * 0.55), 0.1, 0.94),
        dodge: clamp(base.dodge * (1 - f * 0.55), 0.1, 0.94),
        // Tu tackle: contra un rival de abajo casi no fallás; contra Nueva Zelanda se te escapan.
        userTackle: clamp(base.userTackle * (1 - f * 0.3), 0.45, 0.99),
        intercept: clamp(base.intercept * (1 + f * 0.8), 0, 0.3),
        cpuRuckKeep: clamp(base.cpuRuckKeep + f * 0.04, 0.6, 0.98),
        ruckKeep: clamp(base.ruckKeep - f * 0.04, 0.7, 0.98),
        ruckRate: base.ruckRate * (1 + f * 0.2),
        scrumCpu: base.scrumCpu * (1 + f * 0.4),
        cpuKick: clamp(base.cpuKick + f * 0.15, 0.2, 0.92),
        cpuPassIQ: base.cpuPassIQ * (1 + f * 0.5),
    };
}

/**
 * Techo de puntos por dificultad: K · minutos^0.6. Crece menos que el reloj, así
 * que lo que metés en 3 minutos no se duplica en 7. Muy fácil: 54 a los 3', 90 a
 * los 7'. Normal: 33 y 55.
 */
const PACE_K: Record<Difficulty, number> = { 'muy-facil': 28, facil: 20, normal: 14, dificil: 11, leyenda: 9 };
export function paceCap(difficulty: Difficulty, minutes: number): number {
    return PACE_K[difficulty] * Math.max(0, minutes) ** 0.6;
}

/**
 * La dificultad evoluciona con el partido. `def` aprieta la defensa rival (sube
 * con el reloj y, sobre todo, cuando vas por encima del techo de puntos); `atk`
 * mueve el ataque rival (sube un poco con el reloj y afloja si el rival es el que
 * se escapa). Vale para todos los niveles y los dos lados.
 */
function pressured(b: DiffParams, def: number, atk: number): DiffParams {
    return {
        ...b,
        cpuDefRun: b.cpuDefRun + def * 1.1,
        cpuTackle: clamp(b.cpuTackle + def * 0.4, 0.15, 0.97),
        breakHit: clamp(b.breakHit * (1 - def * 0.55), 0.06, 0.92),
        dodge: clamp(b.dodge * (1 - def * 0.55), 0.06, 0.92),
        intercept: clamp(b.intercept * (1 + def * 1.4) + def * 0.03, 0, 0.36),
        cpuRuckKeep: clamp(b.cpuRuckKeep + def * 0.02, 0.6, 0.98),
        ruckKeep: clamp(b.ruckKeep - def * 0.04, 0.7, 0.98),
        scrumCpu: b.scrumCpu * (1 + def * 0.35),
        kickWindow: b.kickWindow * (1 - def * 0.4),
        cpuRun: b.cpuRun + atk * 0.7,
        cpuBreak: clamp(b.cpuBreak * (1 + atk * 0.6), 0.03, 0.9),
        userTackle: clamp(b.userTackle * (1 - atk * 0.15), 0.45, 0.99),
        cpuPassIQ: Math.max(0.3, b.cpuPassIQ * (1 + atk * 0.4)),
        cpuKick: clamp(b.cpuKick + atk * 0.1, 0.15, 0.95),
    };
}

/** Una línea del relato del partido (lo jugado y lo simulado). */
export interface MatchEvent {
    t: number; // segundos de juego transcurridos
    side: Side;
    text: string;
    score: [number, number] | null; // marcador después, si cambió
    sim: boolean;
    /** Si sumó puntos: quién (puesto 0-6 del equipo de `side`) y cómo. Alimenta las tablas de goleadores. */
    stat?: { slot: number; kind: 'try' | 'conv' | 'drop' | 'miss' | 'tackle' };
}

/**
 * Lo que te espera contra este rival, para mostrarlo antes de jugar: de cada
 * 10 tackles tuyos cuántos entran, y de cada 10 choques o amagues cuántos rompen.
 */
export function matchupOdds(difficulty: Difficulty, cpuRating: number, userRating: number): { tackle: number; breakLine: number } {
    const d = withRating(DIFF[difficulty], cpuRating, userRating);
    return { tackle: Math.round(d.userTackle * 10), breakLine: Math.round(((d.breakHit + d.dodge) / 2) * 10) };
}

/** Si las dos camisetas se confunden, el visitante juega con la alternativa. */
function awayKit(home: Kit, away: Kit): Kit {
    if (colorDistance(home.shirt, away.shirt) > 110) return away;
    const alt =
        colorDistance(home.shirt, away.shirt2) > 110
            ? away.shirt2
            : colorDistance(home.shirt, '#f4f4f4') > 110
              ? '#f4f4f4'
              : '#141218';
    return { ...away, shirt: alt, shirt2: away.shirt, pattern: 'liso' };
}

export class SevenMatch {
    readonly cfg: MatchConfig;
    /** Parámetros vivos: la base con la presión del momento encima. */
    D: DiffParams;
    private readonly baseD: DiffParams;
    /** Presión actual (0 = la dificultad elegida tal cual). */
    pressure = { def: 0, atk: 0 };
    private pressureTick = 0;
    private warned = false;
    /** Relato: tries, conversiones y drops, jugados o simulados. */
    log: MatchEvent[] = [];
    readonly kits: [Kit, Kit];
    players: Player[] = [];
    ball = { x: 60, y: 35, holder: null as Player | null, flight: null as Flight | null, loose: null as { vx: number; vy: number; t: number; kicker: Side } | null };
    private walkT = 0;
    /** Velocidad de reacomodo de la jugada en curso (trote, o más rápido para un saque). */
    private moveSpeed = WALK_SPEED;
    private pendingPose = new Map<Player, { pose: Pose; facing: 1 | -1 }>();
    phase: Phase = 'ready';
    phaseT = 0;
    score: [number, number] = [0, 0];
    half = 1;
    clock: number;
    readonly halfLen: number;
    lastPlay = false;
    /** Minuto extra en juego (o ya jugado, si después hubo muerte súbita). */
    extra = false;
    overtime = false;
    ctrl: Player | null = null;
    input = { up: false, down: false };
    onEnd: ((score: [number, number]) => void) | null = null;
    /** Fuente del nombre sobre el jugador: la pixel del juego (la pasa la vista). */
    fontFamily = 'monospace';
    /** Ancho del lienzo en píxeles del juego: lo fija la vista según la pantalla (alto fijo, 270). */
    viewW = VIEW_W;
    private banner: { text: string; sub: string | null; t: number } | null = null;
    private mg: Minigame = null;
    private camX = 20;
    private shake = 0;
    private particles: Particle[] = [];
    private targets = new Map<Player, { x: number; y: number }>();
    private starter: Side = 0;
    private lastTry: { side: Side; y: number } | null = null;
    private convKicker = 4; // puesto del que patea la conversión en curso
    private afterConv: Side = 0;
    private lineout: { x: number; y: number; thrower: Side } | null = null;
    private scrumAt = { x: 60, y: 35 };
    private ruckAt = { x: 60, y: 35, side: 0 as Side };
    private ruckCarrier: Player | null = null;
    private offloadTried = false;
    /** Quién se metió primero sobre la pelota en el ruck en curso. */
    private ruckFirst: Side | null = null;
    /** El sorteo del ruck en curso, tirado al armarse: fija la raya que la barra tiene que cruzar. */
    private ruckRoll = 0.5;
    /** El que se agacha a levantar la pelota del ruck (un paso, sin cortar el juego). */
    private pickup: { p: Player; t: number } | null = null;
    /** Segundos de gracia del que sale jugando de un ruck, scrum o line: nadie lo tacklea. */
    private safeT = 0;
    private time = 0;
    private crowd: string[] = [];
    private ended = false;

    constructor(cfg: MatchConfig) {
        this.cfg = cfg;
        this.baseD = withRating(DIFF[cfg.difficulty], cfg.away.rating ?? 70, cfg.home.rating ?? 70);
        this.D = this.baseD;
        this.kits = [cfg.home.kit, awayKit(cfg.home.kit, cfg.away.kit)];
        this.halfLen = (cfg.minutes * 60) / 2;
        this.clock = this.halfLen;
        for (const side of [0, 1] as Side[]) {
            const team = side === 0 ? cfg.home : cfg.away;
            for (let i = 0; i < 7; i++) {
                this.players.push({
                    side, i, look: team.players[i], x: 60, y: 35, vx: 0, vy: 0, facing: side === 0 ? 1 : -1,
                    pose: 'stand', down: 0, lunge: 0, hit: 0, hitCd: 0, juke: 0, jukeCd: 0, jukeDir: 0, cool: 0,
                    passT: 0, stun: 0, anim: rnd() * 4, oy: 0, mark: null, fb: false, rucking: false,
                    sk: cfg.skills?.[side]?.[i] ?? null,
                });
            }
        }
        const palette = ['#e9e4d8', '#c62828', '#1f3b73', '#f0c419', '#7cc4ef', '#1f7a3e', '#2a1d16', '#ef7d1a', '#8a8f98'];
        for (let k = 0; k < 400; k++) this.crowd.push(palette[(k * 7919 + ((k * k) % 13)) % palette.length]);
        this.restart(0, true);
        this.phaseT = 1.8;
        this.say('SAQUE', `${cfg.home.name} contra ${cfg.away.name}`, 1.8);
    }

    /* ---------------- entradas ---------------- */

    setMove(up: boolean, down: boolean) {
        this.input.up = up;
        this.input.down = down;
    }

    /** Toque nuevo de ↑/↓: amague si llevás la pelota. */
    juke(dir: -1 | 1) {
        const c = this.ball.holder;
        if (this.phase !== 'play' || !c || c.side !== 0 || c.jukeCd > 0) return;
        c.juke = 0.32;
        c.jukeCd = 0.45;
        c.jukeDir = dir;
    }

    /** D: chocar fuerte con la pelota, o tirarse al tackle sin ella. */
    hit() {
        if (this.phase !== 'play') return;
        const c = this.ball.holder;
        if (c && c.side === 0) {
            if (c.hitCd > 0) return;
            c.hit = 0.38;
            c.hitCd = 0.9;
            return;
        }
        const me = this.ctrl;
        const target = c ?? this.ball.flight?.to ?? null;
        if (me && target && target.side === 1 && me.down <= 0 && me.lunge <= 0) me.lunge = 0.36;
    }

    /** W/S: pase. Un toque es el pase corto; mantenido, salteo al segundo de ese lado. */
    pass(dir: -1 | 1 | 0, skip = false) {
        // Recién tackleado, todavía se puede soltar la pelota (offload).
        if (this.phase === 'ruck' && this.ruckAt.side === 0 && this.phaseT > 1.25) {
            this.tryOffload(dir);
            return;
        }
        if (this.phase !== 'play') return;
        const c = this.ball.holder;
        if (!c || c.side !== 0 || c.passT > 0 || c.down > 0) return;
        const target = dir === 0 ? this.bestOption(c) : this.passTarget(c, dir, skip);
        if (!target) return;
        this.throwPass(c, target, skip);
        if (skip) this.say('SALTEO', null, 0.6);
    }

    /** Cargando la patada: mantené A y soltá. 0..1, o null si no se está cargando. */
    kickCharge: number | null = null;

    /** A apretada: empieza a cargar la potencia. */
    startKick() {
        const c = this.ball.holder;
        if (this.phase !== 'play' || !c || c.side !== 0 || c.passT > 0 || c.down > 0) return;
        this.kickCharge = 0;
    }

    /** A soltada: patea con la potencia cargada. */
    releaseKick() {
        const power = this.kickCharge;
        this.kickCharge = null;
        const c = this.ball.holder;
        if (power === null || this.phase !== 'play' || !c || c.side !== 0 || c.down > 0) return;
        this.throwKick(c, power);
    }

    /** Espacio: pase al mejor ubicado, cambiar de jugador, empujar o patear según el momento. */
    action() {
        const mg = this.mg;
        if (this.walkT > 0 && (this.phase === 'scrum' || this.phase === 'lineout')) return; // todavía se están acomodando
        if (this.phase === 'scrum' && mg?.kind === 'scrum') {
            mg.user += 7 * this.packRatio() ** 2;
            this.shake = Math.max(this.shake, 0.5);
            return;
        }
        if (this.phase === 'ruck' && mg?.kind === 'ruck') {
            mg.mash += 1;
            return;
        }
        if (this.phase === 'drop' && this.dropPrep > 0) return; // todavía se está acomodando
        if ((this.phase === 'lineout' || this.phase === 'conv' || this.phase === 'drop') && mg?.kind === 'timing' && mg.userActs && !mg.done) {
            mg.done = true;
            mg.win = Math.abs(mg.cursor - 0.5) <= mg.zone / 2;
            this.phaseT = Math.min(this.phaseT, 0.5);
            return;
        }
        if (this.phase !== 'play') return;
        const c = this.ball.holder ?? this.ball.flight?.to ?? null;
        if (c && c.side === 0) {
            this.pass(0);
            return;
        }
        if (c && c.side === 1) this.switchPlayer();
    }

    /* ---------------- reglas ---------------- */

    private team(side: Side) {
        return this.players.filter((p) => p.side === side);
    }

    private dir(side: Side): 1 | -1 {
        return side === 0 ? 1 : -1;
    }

    /**
     * Una skill del jugador en este momento: la de base menos el cansancio. El
     * cansancio arranca en el que trae de la temporada y crece con el reloj, más
     * rápido cuanto menos resistencia tiene (con 10 casi no se nota; con 3, un 7
     * termina en 5). Nunca baja de 1.
     */
    skill(p: Player, k: 'spd' | 'kick' | 'tkl'): number {
        const sk = p.sk;
        if (!sk) return 6;
        const total = this.halfLen * 2 + (this.extra ? EXTRA_LEN : 0);
        const prog = clamp(this.elapsed() / Math.max(1, total), 0, 1.2);
        const drop = (sk.fat0 ?? 0) + ((11 - sk.sta) / 10) * 2.4 * prog;
        return clamp(sk[k] - drop, 1, 10);
    }

    /** Cuánto le queda al jugador (0 a 1), para mostrarlo. */
    legs(p: Player): number {
        const sk = p.sk;
        if (!sk) return 1;
        const base = (sk.spd + sk.tkl) / 2;
        return clamp((this.skill(p, 'spd') + this.skill(p, 'tkl')) / 2 / Math.max(1, base), 0, 1);
    }

    /** Peso de un jugador (kg): el del plantel, o uno típico según el nivel del equipo. */
    private kgOf(p: Player): number {
        const team = p.side === 0 ? this.cfg.home : this.cfg.away;
        return p.sk?.kg ?? 92 + ((team.rating ?? 70) - 60) * 0.25;
    }

    private cmOf(p: Player): number {
        const team = p.side === 0 ? this.cfg.home : this.cfg.away;
        return p.sk?.cm ?? 185 + ((team.rating ?? 70) - 60) * 0.12;
    }

    /** Peso del pack propio contra el rival (los tres más pesados de cada lado): >1, empujás más. */
    private packRatio(): number {
        const pack = (side: Side) => this.team(side).map((p) => this.kgOf(p)).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
        return clamp(pack(0) / Math.max(1, pack(1)), 0.8, 1.25);
    }

    /** Altura de los saltadores de un lado (promedio de los dos más altos). */
    private jumpers(side: Side): number {
        const h = this.team(side).map((p) => this.cmOf(p)).sort((a, b) => b - a);
        return (h[0] + (h[1] ?? h[0])) / 2;
    }

    /** Factores sobre la base del partido: con skill 6 no cambia nada. */
    private fSpd = (p: Player) => 1 + (this.skill(p, 'spd') - 6) * 0.028;
    private fKick = (p: Player) => clamp(1 + (this.skill(p, 'kick') - 6) * 0.07, 0.6, 1.3);
    private fTkl = (p: Player) => clamp(1 + (this.skill(p, 'tkl') - 6) * 0.045, 0.75, 1.2);
    /** Manos (sale de "pase y patada"): pases más rápidos y difíciles de cortar, menos pelotas al piso. */
    private fHands = (p: Player) => clamp(1 + (this.skill(p, 'kick') - 6) * 0.05, 0.7, 1.25);

    private say(text: string, sub: string | null = null, t = 1.2) {
        this.banner = { text, sub, t };
    }

    private puff(x: number, y: number, n = 8, c = '#d8d2c0') {
        for (let k = 0; k < n; k++) {
            this.particles.push({ x, y, vx: (rnd() - 0.5) * 8, vy: (rnd() - 0.5) * 5, t: 0.35 + rnd() * 0.3, c });
        }
    }

    /** Arma las dos líneas alrededor de la pelota. `snap` las pone ahí de una. */
    private form(att: Side, bx: number, by: number, carrier: Player, snap: boolean, speed = WALK_SPEED) {
        this.moveSpeed = speed;
        this.pickup = null;
        this.safeT = 0;
        bx = clamp(bx, TRY_L + 4, TRY_R - 4);
        by = clamp(by, 5, WIDTH - 5);
        this.targets.clear();
        for (const p of this.players) {
            p.pose = 'stand';
            p.down = 0;
            p.lunge = 0;
            p.hit = 0;
            p.juke = 0;
            p.cool = 0;
            p.stun = 0;
            p.passT = 0;
            p.rucking = false;
            p.facing = this.dir(p.side);
        }

        this.ball.holder = carrier;
        this.ball.flight = null;
        this.planFormation(att, bx, by, carrier);
        // Pegado al ingol, los apoyos quedarían detrás de la línea de pelota muerta;
        // al arrancar la jugada el límite de la cancha los traía de golpe. Adentro desde ya.
        for (const t of this.targets.values()) {
            t.x = clamp(t.x, 0.5, 119.5);
            t.y = clamp(t.y, 1, WIDTH - 1);
        }

        if (snap) {
            for (const [p, t] of this.targets) {
                p.x = t.x;
                p.y = t.y;
                p.vx = 0;
                p.vy = 0;
            }
        }
        this.ball.x = carrier.x;
        this.ball.y = carrier.y;
        this.ball.loose = null;
        this.ctrl = att === 1 ? this.nearestTo(0, bx, by) : null;
        this.mg = null;
        this.phase = 'ready';
        // Nadie se teletransporta: la jugada arranca cuando el más lejano llegó trotando.
        this.phaseT = snap ? 1.1 : clamp(this.farthestTarget() / speed, 0.9, 6);
    }

    /**
     * Salida de pelota parada SIN cortar el juego: la levanta el que ya está ahí
     * (uno del ruck, el que está en la base del scrum) o, si `from` la tiene (el
     * saltador del line, el octavo), sale con un pase de verdad al más cercano.
     * Nadie camina hasta la pelota ni se reacomoda en una pausa.
     */
    private quickRelease(winner: Side, bx: number, by: number, from: Player | null) {
        const d = this.dir(winner);
        for (const p of this.players) {
            p.rucking = false;
            p.lunge = 0;
            if (p.pose === 'scrum') p.pose = 'stand';
            if (p.down > 90) p.down = 0.6; // el tackleado se levanta enseguida
        }
        this.targets.clear();
        this.pendingPose.clear();
        this.walkT = 0;
        this.mg = null;
        this.pickup = null;
        this.ball.flight = null;
        this.ball.loose = null;
        this.phase = 'play';
        this.phaseT = 0;
        const mates = this.team(winner).filter((p) => p !== from && p.down <= 0);
        if (from) {
            // Al más cercano que esté atrás o a la par: el pase no puede ir adelante.
            const behind = mates.filter((p) => (p.x - from.x) * d <= 0.5);
            const to = (behind.length ? behind : mates).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
            this.ball.holder = from;
            this.ball.x = from.x;
            this.ball.y = from.y;
            if (to) {
                this.throwPass(from, to);
                this.safeT = SAFE_EXIT;
                // Sale desde donde está la pelota (el pie del pack, las manos del saltador).
                if (this.ball.flight) {
                    this.ball.flight.sx = bx;
                    this.ball.flight.sy = by;
                    this.ball.x = bx;
                    this.ball.y = by;
                }
                this.planFormation(winner, to.x, to.y, to);
                this.targets.clear();
                if (winner === 1) this.ctrl = this.nearestTo(0, bx, by);
                return;
            }
            this.turnoverInPlay(from);
            this.safeT = SAFE_EXIT;
            this.targets.clear();
            return;
        }
        const picker = (mates.length ? mates : this.team(winner)).sort((a, b) => Math.hypot(a.x - bx, a.y - by) - Math.hypot(b.x - bx, b.y - by))[0];
        this.ball.holder = null;
        this.ball.x = bx;
        this.ball.y = by;
        // Da el paso hasta la pelota y la levanta: la pelota no vuela sola a sus manos.
        this.pickup = { p: picker, t: 0 };
    }

    private farthestTarget(): number {
        let far = 0;
        for (const [p, t] of this.targets) far = Math.max(far, Math.hypot(t.x - p.x, t.y - p.y));
        return far;
    }

    /**
     * Pelota parada (scrum, line): los jugadores van caminando a su lugar y
     * recién ahí arranca. `poses` dice cómo queda cada uno al llegar.
     */
    private beginWalk(places: Map<Player, { x: number; y: number; pose: Pose; facing: 1 | -1 }>, speed = 11): number {
        this.moveSpeed = speed;
        this.targets.clear();
        this.pendingPose.clear();
        for (const [p, t] of places) {
            p.pose = 'stand';
            p.down = 0;
            p.lunge = 0;
            p.rucking = false;
            this.targets.set(p, { x: clamp(t.x, 0.5, 119.5), y: clamp(t.y, 0.5, WIDTH - 0.5) });
            this.pendingPose.set(p, { pose: t.pose, facing: t.facing });
        }
        // Sin tope corto: si están lejos, tardan más, pero llegan caminando (nada de aparecer).
        this.walkT = clamp(this.farthestTarget() / speed, 0.5, 6);
        return this.walkT;
    }

    private stepWalk(dt: number): boolean {
        if (this.walkT <= 0) return false;
        this.walkT -= dt;
        this.moveToTargets(dt);
        if (this.walkT > 0) return true;
        for (const [p, t] of this.targets) {
            p.x = t.x;
            p.y = t.y;
            p.vx = 0;
            p.vy = 0;
            const pp = this.pendingPose.get(p);
            if (pp) {
                p.pose = pp.pose;
                p.facing = pp.facing;
            }
        }
        return false;
    }

    /**
     * Dónde va cada uno para la próxima jugada: los apoyos escalonados detrás
     * del portador, seis defensores en línea marcando y el 7 de fullback, al
     * fondo, cubriendo la patada y el quiebre. No toca posturas ni la pelota.
     */
    private planFormation(att: Side, bx: number, by: number, carrier: Player) {
        const d = this.dir(att);
        this.targets.clear();
        this.targets.set(carrier, { x: bx, y: by });

        const supports = this.team(att).filter((p) => p !== carrier).sort((a, b) => a.y - b.y || a.i - b.i);
        this.assignSlots(carrier, supports, by);
        for (const s of supports) {
            this.targets.set(s, { x: bx - d * (3 + Math.abs(s.oy) * 0.22), y: clamp(by + s.oy, 3, WIDTH - 3) });
        }
        for (const p of this.team(att)) {
            p.fb = false;
            p.mark = null;
        }

        const defs = this.team(att === 0 ? 1 : 0);
        const fb = defs.find((p) => p.i === 6) ?? defs[defs.length - 1];
        const line = defs.filter((p) => p !== fb).sort((a, b) => a.y - b.y || a.i - b.i);
        // El atacante más abierto queda para el fullback: seis marcan a seis.
        const atk = this.team(att)
            .sort((a, b) => Math.abs((this.targets.get(b)?.y ?? by) - by) - Math.abs((this.targets.get(a)?.y ?? by) - by))
            .slice(1)
            .sort((a, b) => (this.targets.get(a)?.y ?? 0) - (this.targets.get(b)?.y ?? 0));
        line.forEach((df, k) => {
            const mk = atk[k];
            df.fb = false;
            df.mark = mk ?? null;
            const ty = mk ? this.targets.get(mk)?.y ?? by : by;
            this.targets.set(df, { x: bx + d * (7 + Math.abs(ty - by) * 0.05), y: ty });
        });
        fb.fb = true;
        fb.mark = null;
        this.targets.set(fb, { x: clamp(bx + d * 22, TRY_L - 4, TRY_R + 4), y: (by + WIDTH / 2) / 2 });
    }

    /** Reparte a los de apoyo arriba y abajo del portador, según el espacio que haya. */
    private assignSlots(carrier: Player, supports: Player[], by: number) {
        const roomUp = by - 3;
        const roomDown = WIDTH - 3 - by;
        let nUp = clamp(Math.round((supports.length * roomUp) / (roomUp + roomDown)), 0, supports.length);
        if (roomUp < 6) nUp = 0;
        if (roomDown < 6) nUp = supports.length;
        const nDown = supports.length - nUp;
        const stepUp = nUp ? Math.min(8, roomUp / nUp) : 0;
        const stepDown = nDown ? Math.min(8, roomDown / nDown) : 0;
        supports.forEach((s, k) => {
            if (k < nUp) s.oy = -(nUp - k) * stepUp;
            else s.oy = (k - nUp + 1) * stepDown;
        });
        carrier.oy = 0;
    }

    private nearestTo(side: Side, x: number, y: number, except?: Player | null): Player | null {
        let best: Player | null = null;
        let bd = Infinity;
        for (const p of this.players) {
            if (p.side !== side || p === except || p.down > 0) continue;
            const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
            if (dd < bd) {
                bd = dd;
                best = p;
            }
        }
        return best;
    }

    private switchPlayer() {
        const c = this.ball.holder ?? this.ball.flight?.to;
        if (!c) return;
        const next = this.nearestTo(0, c.x, c.y, this.ctrl);
        if (next) this.ctrl = next;
    }

    private restart(side: Side, snap: boolean) {
        const x = side === 0 ? 45 : 75;
        const carrier = this.team(side)[3];
        this.form(side, x, 35, carrier, snap, 13);
    }

    /**
     * El compañero al que va el pase. `skip`: salteo, saltea al primero y se
     * la da al segundo de ese lado (si hay).
     */
    private passTarget(c: Player, dir: -1 | 1, skip = false): Player | null {
        const options = this.team(c.side)
            .filter((p) => p !== c && p.down <= 0 && !p.rucking)
            .filter((p) => Math.sign(p.y - c.y) === dir && Math.abs(p.y - c.y) >= 1.5)
            .map((p) => ({ p, dist: Math.hypot(p.x - c.x, p.y - c.y) }))
            .filter((o) => o.dist <= (skip ? 36 : 28))
            .sort((a, b) => a.dist - b.dist);
        if (!options.length) return null;
        return (skip && options[1] ? options[1] : options[0]).p;
    }

    /** El compañero con más aire alrededor, sin irse a más de 22 m. */
    private bestOption(c: Player): Player | null {
        let best: Player | null = null;
        let score = -Infinity;
        const opp = this.team(c.side === 0 ? 1 : 0);
        for (const p of this.team(c.side)) {
            if (p === c || p.down > 0) continue;
            const dist = Math.hypot(p.x - c.x, p.y - c.y);
            if (dist > 22 || Math.abs(p.y - c.y) < 2) continue;
            let space = Infinity;
            for (const o of opp) if (o.down <= 0) space = Math.min(space, Math.hypot(o.x - p.x, o.y - p.y));
            const s = space - dist * 0.25;
            if (s > score) {
                score = s;
                best = p;
            }
        }
        return best;
    }

    private throwPass(from: Player, to: Player, skip = false) {
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        this.ball.holder = null;
        // Sale de las manos del que pasa: sin esto, el primer cuadro la dibujaba donde había quedado.
        this.ball.x = from.x;
        this.ball.y = from.y;
        this.ball.flight = {
            from, to, sx: from.x, sy: from.y, releaseX: from.x, toX0: to.x, t: 0,
            dur: clamp(dist / ((skip ? 24 : 21) * this.fHands(from)), 0.16, 1.4), tried: new Set(), skip,
        };
        from.passT = 0.28;
    }

    /**
     * Patada al fondo. `power` 0..1 decide el largo (12 a 45 m); con más
     * potencia la pelota sale menos precisa. Apunta al lado que el fullback
     * rival tiene descubierto. Después pica, queda suelta y la gana el primero
     * que llega corriendo.
     */
    private throwKick(from: Player, power = 0.5) {
        const d = this.dir(from.side);
        this.ball.x = from.x;
        this.ball.y = from.y;
        const fb = this.team(from.side === 0 ? 1 : 0).find((p) => p.fb && p.down <= 0);
        const foot = this.fKick(from);
        const dist = 12 + power * 33 * foot;
        const tx = clamp(from.x + d * dist, 2, 118);
        const goalX = from.side === 0 ? TRY_R : TRY_L;
        const toPosts = Math.abs(goalX - from.x);
        // De frente a los palos, fuerte y a tiro: va a los palos. Si entra, es drop.
        const atPosts = power >= 0.7 && toPosts <= 45 && Math.abs(from.y - WIDTH / 2) < 9;
        let ty: number;
        let goal = false;
        if (atPosts) {
            const err = ((rnd() - 0.5) * (2 + toPosts * 0.16 + Math.abs(from.y - WIDTH / 2) * 0.3)) / foot;
            ty = WIDTH / 2 + err;
            goal = Math.abs(err) < 2.8 && (tx - goalX) * d >= 0;
        } else {
            const lanes = [10, 22, 35, 48, 60].filter((y) => Math.abs(y - from.y) < 30);
            const lane = lanes.sort((a, b) => (fb ? Math.abs(b - fb.y) - Math.abs(a - fb.y) : Math.abs(a - from.y) - Math.abs(b - from.y)))[0] ?? from.y;
            ty = lane + ((rnd() - 0.5) * (3 + power * 12)) / foot;
        }
        ty = clamp(ty, 4, WIDTH - 4);
        this.ball.holder = null;
        this.ball.flight = { from, to: from, sx: from.x, sy: from.y, releaseX: from.x, t: 0, dur: 0.7 + power * 0.8, tried: new Set(), kick: { tx, ty }, goal };
        from.passT = 0.3;
        this.say(atPosts ? 'A LOS PALOS' : power > 0.75 ? 'PATADA LARGA' : power < 0.3 ? 'PATADITA' : 'PATADA', null, 0.7);
    }

    /** Patada directa sin cargar (botón táctil de un toque). */
    kick() {
        if (this.phase !== 'play') return;
        const c = this.ball.holder;
        if (!c || c.side !== 0 || c.passT > 0 || c.down > 0) return;
        this.throwKick(c, 0.55);
    }

    private catchBall(p: Player) {
        this.ball.holder = p;
        this.ball.flight = null;
        const mates = this.team(p.side).filter((m) => m !== p).sort((a, b) => a.y - b.y || a.i - b.i);
        this.assignSlots(p, mates, p.y);
        if (p.side === 1 && (!this.ctrl || this.ctrl.side !== 0)) this.ctrl = this.nearestTo(0, p.x, p.y);
        if (p.side === 0) this.ctrl = null;
    }

    private turnoverInPlay(newCarrier: Player) {
        this.catchBall(newCarrier);
        // Marcas y fullback nuevos para el que ahora defiende.
        this.planFormation(newCarrier.side, newCarrier.x, newCarrier.y, newCarrier);
        if (newCarrier.side === 1) this.ctrl = this.nearestTo(0, newCarrier.x, newCarrier.y);
    }

    /** Pelota muerta. Si ya sonó la chicharra, termina el tiempo. */
    private deadBall(): boolean {
        if (!this.lastPlay) return false;
        this.endHalf();
        return true;
    }

    private endHalf() {
        this.lastPlay = false;
        if (this.half === 1) {
            this.phase = 'halftime';
            this.phaseT = 2.6;
            this.mg = null;
            this.say('ENTRETIEMPO', `${this.cfg.home.short} ${this.score[0]} - ${this.score[1]} ${this.cfg.away.short}`, 2.6);
            return;
        }
        // Empate en un partido que se tiene que definir: primero un minuto más, que gana el que esté arriba.
        if (this.cfg.suddenDeath && this.score[0] === this.score[1] && !this.extra) {
            this.extra = true;
            this.half = 3;
            this.clock = EXTRA_LEN;
            this.restart(rnd() < 0.5 ? 0 : 1, false);
            this.phaseT = 2;
            this.say('MINUTO EXTRA', 'Un minuto más: gana el que termine arriba', 2.2);
            return;
        }
        // Y si en ese minuto siguen iguales, muerte súbita: el primero que marca.
        if (this.cfg.suddenDeath && this.score[0] === this.score[1] && !this.overtime) {
            this.overtime = true;
            this.half = 4;
            this.restart(rnd() < 0.5 ? 0 : 1, false);
            this.phaseT = 2;
            this.say('MUERTE SÚBITA', 'El primero que marca, gana', 2);
            return;
        }
        this.finish();
    }

    /**
     * Desde la pausa: el resto del partido se juega "a ciegas", posesión por
     * posesión, y queda como relato (`MatchEvent[]`). Cada posesión termina en
     * try, drop o pelota perdida; la fuerza de cada uno sale del ranking, la
     * dificultad y cómo venía el partido, y el techo de puntos frena al que se
     * escapa igual que en cancha.
     */
    simulateRest(): MatchEvent[] {
        if (this.phase === 'end') return [];
        const total = this.halfLen * 2;
        let t = this.elapsed();
        const ru = this.cfg.home.rating ?? 70;
        const rc = this.cfg.away.rating ?? 70;
        const bias: Record<Difficulty, number> = { 'muy-facil': 0.25, facil: 0.1, normal: -0.05, dificil: -0.12, leyenda: -0.18 };
        const model = clamp(1 / (1 + 10 ** ((rc - ru) / 18)) + bias[this.cfg.difficulty], 0.08, 0.92);
        // Cómo venía el partido: pesa, sin mandar.
        const played = (this.score[0] + 3) / (this.score[0] + this.score[1] + 6);
        const share = clamp(model * 0.65 + played * 0.35, 0.08, 0.92);
        const teams = [this.cfg.home, this.cfg.away];
        const names = [playerNames(this.cfg.home), playerNames(this.cfg.away)];
        const pick = (w: number[]) => {
            let r = rnd() * w.reduce((a, b) => a + b, 0);
            for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i;
            return w.length - 1;
        };
        const who = (side: Side, w: number[]) => names[side][pick(w)].short;
        const out: MatchEvent[] = [];
        const add = (side: Side, text: string, scored: boolean, at = t, stat?: MatchEvent['stat']) => {
            const ev: MatchEvent = { t: Math.min(at, total), side, text, score: scored ? [this.score[0], this.score[1]] : null, sim: true, ...(stat ? { stat } : {}) };
            out.push(ev);
            this.log.push(ev);
        };
        const holder = this.ball.holder ?? this.ball.flight?.to ?? null;
        let pos: Side = holder ? holder.side : this.starter;
        const strength = (s: Side) => (s === 0 ? share : 1 - share);
        const tryProb = (s: Side, at: number) => {
            let p = 0.04 + 0.6 * strength(s) ** 1.2;
            if (this.score[s] > paceCap(this.cfg.difficulty, at / 60) + 5) p *= 0.5;
            return p;
        };
        const convProb = (s: Side) => (s === 0 ? clamp(0.45 + this.D.kickWindow, 0.4, 0.85) : this.D.cpuKick);
        const TRY_W = [1, 1, 1, 2, 3, 4, 5];
        /** Quién tacklea más: los de adelante cargan con el trabajo. */
        const TACKLER_W = [4, 4, 4, 3, 2, 3, 2];
        const TRY_HOW = ['por la punta', 'tras un quiebre por el medio', 'después de un salteo', 'en un contraataque', 'tras un ruck rápido', 'con un amague que deja parado al fullback'];

        /** Una posesión. Devuelve true si terminó en try (para la muerte súbita). */
        const possession = (at: number, sudden: boolean): boolean => {
            const s = pos;
            const o: Side = s === 0 ? 1 : 0;
            // Cada posesión del que ataca deja unos tackles del que defiende (se anotan en el log, no en el relato).
            const nTackles = 2 + Math.floor(rnd() * 3);
            for (let k = 0; k < nTackles; k++) {
                this.log.push({ t: Math.min(at, total), side: o, text: '', score: null, sim: true, stat: { slot: pick(TACKLER_W), kind: 'tackle' } });
            }
            const r = rnd();
            const pt = tryProb(s, at);
            if (r < pt) {
                this.score[s] += 5;
                const scorerSlot = pick(TRY_W);
                add(s, `Try de ${names[s][scorerSlot].short} ${TRY_HOW[Math.floor(rnd() * TRY_HOW.length)]}`, true, at, { slot: scorerSlot, kind: 'try' });
                if (sudden) return true;
                const kicker = names[s][4].short;
                if (rnd() < convProb(s)) {
                    this.score[s] += 2;
                    add(s, `Conversión de ${kicker}`, true, at, { slot: 4, kind: 'conv' });
                } else add(s, `${kicker} erra la conversión`, false, at, { slot: 4, kind: 'miss' });
                pos = o; // en el seven saca el que convirtió: la pelota es del otro
                return false;
            }
            if (r < pt + 0.05 && !sudden) {
                const kicker = names[s][4].short;
                if (rnd() < (s === 0 ? 0.45 : this.D.cpuKick * 0.7)) {
                    this.score[s] += 3;
                    add(s, `Drop de ${kicker}`, true, at, { slot: 4, kind: 'drop' });
                } else add(s, `${kicker} prueba el drop y se va afuera`, false, at);
                pos = o;
                return false;
            }
            // Pelota perdida: el relato lo cuenta el que la recupera.
            const k = rnd();
            if (k < 0.32) add(o, `Jackal de ${who(o, [3, 2, 3, 4, 1, 1, 1])}`, false, at);
            else if (k < 0.5) add(o, `Intercepción de ${who(o, [0, 0, 0, 1, 2, 3, 4])}`, false, at);
            else if (k < 0.68) add(o, `Knock-on de ${who(s, [1, 1, 1, 2, 2, 2, 2])}: scrum para ${teams[o].short}`, false, at);
            else if (k < 0.82) add(o, `Line robado por ${who(o, [2, 3, 2, 1, 0, 0, 0])}`, false, at);
            else add(o, `Tackle de ${who(o, [2, 2, 2, 3, 2, 3, 2])} y pelota recuperada`, false, at);
            pos = o;
            return false;
        };

        t += 6 + rnd() * 10;
        while (t < total) {
            possession(t, false);
            t += 14 + rnd() * 26;
        }
        this.clock = 0;
        this.half = 2;
        this.lastPlay = false;
        // Si se tiene que definir: un minuto más (gana el que termine arriba)...
        const inExtra = this.extra && !this.overtime; // se simuló con el minuto extra ya empezado
        if (this.cfg.suddenDeath && !this.overtime && (inExtra || this.score[0] === this.score[1])) {
            if (!this.extra) {
                this.extra = true;
                add(0, 'Minuto extra: gana el que termine arriba', false, total);
                pos = rnd() < 0.5 ? 0 : 1;
            }
            for (let et = Math.max(t, total + 8 + rnd() * 10); et < total + EXTRA_LEN; et += 18 + rnd() * 20) possession(et, false);
        }
        // ...y si siguen iguales, muerte súbita hasta que alguien apoye.
        if (this.cfg.suddenDeath && this.score[0] === this.score[1]) {
            this.overtime = true;
            add(0, 'Muerte súbita: el primero que marca, gana', false, total);
            pos = rnd() < 0.5 ? 0 : 1;
            let n = 0;
            while (!possession(total, true)) if (++n > 30) {
                // Cierre de seguridad: el más fuerte termina apoyando.
                pos = rnd() < share ? 0 : 1;
                this.score[pos] += 5;
                add(pos, `Try de ${who(pos, TRY_W)} en la muerte súbita`, true, total);
                break;
            }
        }
        this.finish();
        this.say('SIMULADO', `${this.cfg.home.short} ${this.score[0]} - ${this.score[1]} ${this.cfg.away.short}`, 99);
        return out;
    }

    private finish() {
        this.phase = 'end';
        this.mg = null;
        this.say('FINAL', `${this.cfg.home.short} ${this.score[0]} - ${this.score[1]} ${this.cfg.away.short}`, 99);
        if (!this.ended) {
            this.ended = true;
            this.onEnd?.([this.score[0], this.score[1]]);
        }
    }

    private startScrum(feed: Side, x: number, y: number, why: string) {
        if (this.deadBall()) return;
        this.phase = 'scrum';
        this.scrumAt = { x: clamp(x, TRY_L + 6, TRY_R - 6), y: clamp(y, 15, WIDTH - 15) };
        this.mg = { kind: 'scrum', user: feed === 0 ? 12 : 0, cpu: feed === 1 ? 12 : 0 };
        this.ball.holder = null;
        this.ball.flight = null;
        this.ball.loose = null;
        this.ball.x = this.scrumAt.x;
        this.ball.y = this.scrumAt.y;
        const walk = this.beginWalk(this.scrumPlaces());
        this.phaseT = walk + 3.2;
        this.say(why, 'Scrum', 1.3);
    }

    /** Tres por lado agachados frente a frente; el resto, escalonado atrás. */
    private scrumPlaces() {
        const { x, y } = this.scrumAt;
        const places = new Map<Player, { x: number; y: number; pose: Pose; facing: 1 | -1 }>();
        for (const side of [0, 1] as Side[]) {
            const d = this.dir(side);
            // Los tres más cercanos arman el pack: así nadie cruza la cancha.
            const byDist = this.team(side).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
            byDist.forEach((p, k) => {
                if (k < 3) places.set(p, { x: x - d * 1.6, y: y + (k - 1) * 2.2, pose: 'scrum', facing: d });
                else if (k === 3) places.set(p, { x: x - d * 3.4, y: clamp(y + (y < WIDTH / 2 ? 2.4 : -2.4), 2, WIDTH - 2), pose: 'stand', facing: d });
                else places.set(p, { x: x - d * (6 + (k - 3) * 2), y: clamp(y + (k - 4.5) * 12, 4, WIDTH - 4), pose: 'stand', facing: d });
            });
        }
        return places;
    }

    private startLineout(thrower: Side, x: number, y: number) {
        if (this.deadBall()) return;
        const top = y < WIDTH / 2;
        const lx = clamp(x, TRY_L + 6, TRY_R - 6);
        this.lineout = { x: lx, y: top ? 0 : WIDTH, thrower };
        this.mg = {
            kind: 'timing', cursor: 0, dir: 1, speed: LINE_SPEED[this.cfg.difficulty],
            zone: clamp((thrower === 0 ? LINE_ZONE[this.cfg.difficulty] : LINE_STEAL[this.cfg.difficulty]) * (this.jumpers(0) / this.jumpers(1)) ** 6, 0.04, 0.45),
            userActs: true, done: false, win: false,
        };
        this.phase = 'lineout';
        this.ball.holder = null;
        this.ball.flight = null;
        this.ball.loose = null;
        const places = new Map<Player, { x: number; y: number; pose: Pose; facing: 1 | -1 }>();
        for (const side of [0, 1] as Side[]) {
            const byDist = this.team(side).sort((a, b) => Math.hypot(a.x - lx, a.y - (top ? 0 : WIDTH)) - Math.hypot(b.x - lx, b.y - (top ? 0 : WIDTH)));
            byDist.forEach((p, k) => {
                const f = this.dir(side);
                if (k === 0 && side === thrower) places.set(p, { x: lx, y: top ? 0.5 : WIDTH - 0.5, pose: 'stand', facing: f });
                else if (k < 4) places.set(p, { x: lx + (side === 0 ? -0.8 : 0.8), y: top ? 5 + k * 2.4 : WIDTH - 5 - k * 2.4, pose: 'stand', facing: f });
                else places.set(p, { x: lx - f * (8 + (k - 4) * 4), y: top ? 14 + (k - 4) * 8 : WIDTH - 14 - (k - 4) * 8, pose: 'stand', facing: f });
            });
        }
        const walk = this.beginWalk(places);
        this.phaseT = walk + 3.4;
        this.ball.x = lx;
        this.ball.y = top ? 1 : WIDTH - 1;
        this.say('LINE', thrower === 0 ? 'Saque tuyo' : 'Saca el rival', 1.2);
    }

    private scoreTry(c: Player) {
        const side = c.side;
        this.score[side] += 5;
        this.lastTry = { side, y: c.y };
        c.pose = 'dive';
        c.vx = this.dir(side) * 6;
        c.vy = 0;
        this.phase = 'try';
        this.phaseT = 2.2;
        this.ball.holder = c;
        this.puff(c.x + this.dir(side) * 2, c.y, 14);
        this.shake = 1;
        const team = side === 0 ? this.cfg.home : this.cfg.away;
        this.say('TRY', team.name, 2.2);
        this.note(side, `Try de ${this.nameOf(c)}`, true, { slot: c.i, kind: 'try' });
    }

    private startConversion() {
        const lt = this.lastTry;
        if (!lt) return;
        const wide = Math.abs(lt.y - WIDTH / 2) / (WIDTH / 2);
        const userKicks = lt.side === 0;
        this.mg = {
            kind: 'timing', cursor: 0, dir: 1, speed: 1.6 + wide * 0.9,
            zone: Math.max(0.05, this.D.kickWindow * (1 - wide * 0.65)),
            userActs: userKicks, done: false, win: userKicks ? false : rnd() < this.D.cpuKick * (1 - wide * 0.3),
        };
        this.phase = 'conv';
        this.afterConv = lt.side === 0 ? 1 : 0;
        const d = this.dir(lt.side);
        for (const p of this.players) {
            p.pose = 'stand';
            p.down = 0;
            p.vx = 0;
            p.vy = 0;
        }
        // El pateador camina hasta su lugar, en línea con el try; los demás se quedan.
        // Patea el que apoyó: ya tiene la pelota y vuelve caminando con ella (nada de que aparezca en otras manos).
        const scorer = this.ball.holder && this.ball.holder.side === lt.side ? this.ball.holder : null;
        const kicker = scorer ?? this.team(lt.side).sort((a, b) => Math.hypot(a.x - TRY_R, a.y - lt.y) - Math.hypot(b.x - TRY_R, b.y - lt.y))[0];
        this.convKicker = kicker?.i ?? 4;
        // La patada del que patea: agranda o achica el verde (o la chance del rival).
        if (kicker && this.mg?.kind === 'timing') {
            const f = this.fKick(kicker);
            if (userKicks) this.mg.zone = clamp(this.mg.zone * f, 0.04, 0.5);
            else this.mg.win = rnd() < clamp(this.D.cpuKick * (1 - wide * 0.3) * f, 0.05, 0.97);
        }
        const places = new Map<Player, { x: number; y: number; pose: Pose; facing: 1 | -1 }>();
        places.set(kicker, { x: (lt.side === 0 ? TRY_R : TRY_L) - d * 18, y: lt.y, pose: 'stand', facing: d });
        const walk = this.beginWalk(places, 12);
        this.phaseT = walk + (userKicks ? 4 : 1.6);
        this.ball.holder = kicker;
        this.ball.flight = null;
        this.ball.loose = null;
    }

    /* ---------------- drop ---------------- */

    private dropPrep = 0;
    private dropFrom: { x: number; y: number; side: Side } | null = null;
    private dropOk = false;

    /**
     * Q: drop. El portador se acomoda (el juego frena un momento) y patea
     * con timing; más lejos o más abierto, más chica la zona buena.
     */
    dropGoal() {
        if (this.phase === 'drop') {
            this.action();
            return;
        }
        const c = this.ball.holder;
        if ((this.phase !== 'play' && this.phase !== 'ready') || !c || c.side !== 0 || c.down > 0) return;
        const dist = TRY_R - c.x;
        if (dist > 45) {
            this.say('MUY LEJOS PARA EL DROP', null, 0.9);
            return;
        }
        const wide = Math.abs(c.y - WIDTH / 2) / (WIDTH / 2);
        this.kickCharge = null;
        this.dropFrom = { x: c.x, y: c.y, side: 0 };
        this.phase = 'drop';
        this.dropPrep = 0.7;
        this.phaseT = 0.7 + 3.2;
        for (const p of this.players) {
            p.vx = 0;
            p.vy = 0;
        }
        c.facing = 1;
        this.mg = {
            kind: 'timing', cursor: 0, dir: 1, speed: 1.4 + dist / 40,
            zone: clamp(this.D.kickWindow * 1.15 * (1 - dist / 75) * (1 - wide * 0.6) * this.fKick(c), 0.04, 0.4),
            userActs: true, done: false, win: false,
        };
        this.say('DROP', 'Se acomoda para patear', 0.8);
    }

    /** La máquina también intenta el drop cuando está cerca y la apuran. */
    private cpuDrop(c: Player) {
        const dist = c.x - TRY_L;
        const wide = Math.abs(c.y - WIDTH / 2) / (WIDTH / 2);
        this.dropFrom = { x: c.x, y: c.y, side: 1 };
        this.dropOk = rnd() < this.D.cpuKick * (1 - dist / 70) * (1 - wide * 0.5) * this.fKick(c);
        this.phase = 'dropResult';
        this.phaseT = 1.4;
        this.ball.holder = c;
        this.mg = null;
        this.say('DROP', null, 0.7);
    }

    private resolveDrop() {
        const mg = this.mg;
        this.dropOk = !!mg && mg.kind === 'timing' && mg.done && mg.win;
        this.mg = null;
        this.phase = 'dropResult';
        this.phaseT = 1.4;
    }

    private afterDrop() {
        const from = this.dropFrom;
        if (!from) return;
        const scorer = from.side;
        const other: Side = scorer === 0 ? 1 : 0;
        if (this.dropOk) {
            this.score[scorer] += 3;
            this.say('DROP CONVERTIDO', '+3', 1.4);
            const kicker = this.nearestTo(scorer, from.x, from.y);
            this.note(scorer, kicker ? `Drop de ${this.nameOf(kicker)}` : "Drop", true, { slot: kicker?.i ?? 4, kind: 'drop' });
            if (this.lastPlay) {
                this.endHalf();
                return;
            }
            this.restart(other, false);
            return;
        }
        this.say('AFUERA', 'Sale jugando el rival desde su 22', 1.2);
        if (this.deadBall()) return;
        const x = other === 1 ? TRY_R - 22 : TRY_L + 22;
        const carrier = this.nearestTo(other, x, WIDTH / 2) ?? this.team(other)[3];
        this.form(other, x, WIDTH / 2, carrier, false, 12);
    }

    /** Segundos de juego transcurridos (el minuto extra suma; la muerte súbita, no). */
    elapsed(): number {
        const total = this.halfLen * 2;
        if (this.overtime) return total + (this.extra ? EXTRA_LEN : 0);
        if (this.half === 3) return total + EXTRA_LEN - Math.max(0, this.clock);
        const rem = Math.max(0, this.clock) + (this.half === 1 ? this.halfLen : 0);
        return total - rem;
    }

    /**
     * La presión crece con el reloj y con lo que te pasaste del techo de puntos.
     * El techo depende de la dificultad y crece menos que el tiempo: por eso en 7
     * minutos no metés el doble que en 3.
     */
    private updatePressure() {
        const min = this.elapsed() / 60;
        const cap = paceCap(this.cfg.difficulty, min);
        const overUser = Math.max(0, this.score[0] - cap);
        const overCpu = Math.max(0, this.score[1] - cap);
        const def = clamp(min * 0.04 + overUser * 0.07, 0, 1.6);
        const atk = clamp(min * 0.025 + overUser * 0.035 - overCpu * 0.03, -0.8, 0.9);
        this.pressure = { def, atk };
        this.D = pressured(this.baseD, def, atk);
        if (!this.warned && def >= 0.4 && this.phase === 'play') {
            this.warned = true;
            this.say('AJUSTE', 'El rival cierra la defensa', 1.4);
        }
    }

    private note(side: Side, text: string, scored: boolean, stat?: MatchEvent['stat']) {
        this.log.push({ t: this.elapsed(), side, text, score: scored ? [this.score[0], this.score[1]] : null, sim: false, ...(stat ? { stat } : {}) });
    }

    private nameOf(p: Player): string {
        return playerNames(p.side === 0 ? this.cfg.home : this.cfg.away)[p.i].short;
    }

    /* ---------------- simulación ---------------- */

    update(rawDt: number) {
        const dt = Math.min(rawDt, 1 / 20);
        this.time += dt;
        if (this.banner) {
            this.banner.t -= dt;
            if (this.banner.t <= 0) this.banner = null;
        }
        this.shake = Math.max(0, this.shake - dt * 3);
        for (const pt of this.particles) {
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.t -= dt;
        }
        this.particles = this.particles.filter((pt) => pt.t > 0);
        this.safeT = Math.max(0, this.safeT - dt);
        this.pressureTick -= dt;
        if (this.pressureTick <= 0) {
            this.pressureTick = 0.25;
            this.updatePressure();
        }

        const clockRuns =
            this.phase === 'play' || this.phase === 'ruck' || this.phase === 'scrum' || this.phase === 'lineout' || (this.phase === 'ready' && this.time > 2);
        if (clockRuns && !this.overtime && !this.lastPlay) {
            this.clock -= dt;
            if (this.clock <= 0) {
                this.clock = 0;
                this.lastPlay = true;
                this.say('CHICHARRA', 'Última jugada: sigue hasta que la pelota se muera', 1.6);
            }
        }

        for (const p of this.players) {
            p.down = Math.max(0, p.down - dt);
            if (p.down <= 0 && p.pose === 'ground' && this.phase === 'play') p.pose = 'stand';
            p.hit = Math.max(0, p.hit - dt);
            p.hitCd = Math.max(0, p.hitCd - dt);
            // El tackle en el aire solo lo consume el defensor que manejás; si dejó de serlo a mitad del vuelo, se apaga (si no, quedaba inclinado para siempre).
            if (p.lunge > 0) {
                if (p !== this.ctrl || this.phase !== "play") p.lunge = 0;
                else {
                    p.lunge -= dt;
                    if (p.lunge <= 0) {
                        // Se tiró y no agarró nada: queda en el piso.
                        p.lunge = 0;
                        p.pose = "ground";
                        p.down = 0.75;
                        p.vx = 0;
                        p.vy = 0;
                        this.puff(p.x, p.y, 5);
                    }
                }
            }
            p.juke = Math.max(0, p.juke - dt);
            p.jukeCd = Math.max(0, p.jukeCd - dt);
            p.cool = Math.max(0, p.cool - dt);
            p.passT = Math.max(0, p.passT - dt);
            p.stun = Math.max(0, p.stun - dt);
        }

        if (this.kickCharge !== null) {
            const h = this.ball.holder;
            if (this.phase !== "play" || !h || h.side !== 0 || h.down > 0) this.kickCharge = null;
            else this.kickCharge = Math.min(1, this.kickCharge + dt / 0.9);
        }
        this.phaseT -= dt;
        switch (this.phase) {
            case 'ready':
                this.moveToTargets(dt);
                if (this.phaseT <= 0) this.phase = 'play';
                break;
            case 'play':
                this.updatePlay(dt);
                break;
            case 'ruck':
                this.updateRuck(dt);
                break;
            case 'scrum':
                if (this.stepWalk(dt)) break;
                this.updateScrum(dt);
                break;
            case 'lineout':
                if (this.stepWalk(dt)) break;
                this.updateTiming(dt);
                if (this.phaseT <= 0) this.resolveLineout();
                break;
            case 'try': {
                const c = this.ball.holder;
                if (c && c.pose === 'dive') {
                    c.x += c.vx * dt;
                    c.vx *= 0.88;
                }
                for (const p of this.team(this.lastTry?.side ?? 0)) {
                    if (p !== c) {
                        p.pose = 'celebrate';
                        p.vx = 0;
                        p.vy = 0;
                    }
                }
                if (this.phaseT <= 0) {
                    if (this.overtime) this.finish();
                    else this.startConversion();
                }
                break;
            }
            case 'conv':
                if (this.stepWalk(dt)) break;
                this.updateTiming(dt);
                if (this.phaseT <= 0) this.resolveConversion();
                break;
            case 'convResult':
                if (this.phaseT <= 0) {
                    if (this.lastPlay) this.endHalf();
                    else this.restart(this.afterConv, false);
                }
                break;
            case 'drop':
                this.dropPrep -= dt;
                if (this.dropPrep > 0) break; // se acomoda para patear: el juego frena un momento
                this.updateTiming(dt);
                if (this.phaseT <= 0) this.resolveDrop();
                break;
            case 'dropResult':
                if (this.phaseT <= 0) this.afterDrop();
                break;
            case 'halftime':
                if (this.phaseT <= 0) {
                    this.half = 2;
                    this.clock = this.halfLen;
                    this.restart(this.starter === 0 ? 1 : 0, false);
                    this.say('SEGUNDO TIEMPO', null, 1.4);
                }
                break;
            case 'end':
                break;
        }

        // Nadie sale del recinto en ninguna fase. Si alguien quedaba detrás de la línea
        // de pelota muerta, el límite de la jugada lo traía de golpe: eso era un "teletransporte".
        for (const p of this.players) {
            p.x = clamp(p.x, 0.5, 119.5);
            p.y = clamp(p.y, -1, WIDTH + 1);
        }
        // La pelota en mano va con el que la lleva, en todas las fases.
        const holding = this.ball.holder;
        if (holding && !this.ball.flight) {
            this.ball.x = holding.x;
            this.ball.y = holding.y;
        }

        // Cámara: sigue la pelota, un poco adelantada hacia donde se ataca.
        const holder = this.ball.holder ?? this.ball.flight?.to ?? null;
        const att: Side = holder ? holder.side : 0;
        let focus = this.ball.x + this.dir(att) * 8;
        if ((this.phase === 'conv' || this.phase === 'convResult') && this.lastTry) focus = this.lastTry.side === 0 ? TRY_R - 12 : TRY_L + 12;
        const viewM = this.viewW / PXM;
        const want = clamp(focus - viewM / 2, -6, 126 - viewM);
        this.camX += (want - this.camX) * Math.min(1, dt * 4);
    }

    private moveToTargets(dt: number) {
        for (const [p, t] of this.targets) {
            const dx = t.x - p.x;
            const dy = t.y - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.05) {
                const sp = Math.min(dist / dt, this.moveSpeed);
                p.vx = (dx / dist) * sp;
                p.vy = (dy / dist) * sp;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.anim += dt * 9;
                // Mira hacia donde camina: nadie se desplaza de espaldas.
                if (Math.abs(p.vx) > 0.5) p.facing = p.vx > 0 ? 1 : -1;
            } else {
                p.vx = 0;
                p.vy = 0;
            }
        }
        const h = this.ball.holder;
        if (h) {
            this.ball.x = h.x;
            this.ball.y = h.y;
        }
    }

    /**
     * Adónde correr para cruzarse con `q` yendo a `speed`: el punto donde se
     * encuentran si `q` sigue con la misma velocidad (intercepción).
     */
    private leadPoint(p: Player, q: Player, speed: number): { x: number; y: number } {
        const rx = q.x - p.x;
        const ry = q.y - p.y;
        const a = q.vx * q.vx + q.vy * q.vy - speed * speed;
        const b = 2 * (rx * q.vx + ry * q.vy);
        const c = rx * rx + ry * ry;
        let t = 1.5;
        if (Math.abs(a) < 1e-6) {
            if (b < 0) t = -c / b;
        } else {
            const disc = b * b - 4 * a * c;
            if (disc >= 0) {
                const s = Math.sqrt(disc);
                const roots = [(-b - s) / (2 * a), (-b + s) / (2 * a)].filter((r) => r > 0);
                if (roots.length) t = Math.min(...roots);
            }
        }
        t = clamp(t, 0, 3);
        return { x: clamp(q.x + q.vx * t, 0.5, 119.5), y: clamp(q.y + q.vy * t, 1, WIDTH - 1) };
    }

    /**
     * Si el defensor está cerca de la línea del pase y llega antes que la
     * pelota, devuelve el punto donde cortarla.
     */
    private laneCut(p: Player, fl: Flight): { x: number; y: number } | null {
        const remaining = fl.dur - fl.t;
        if (remaining < 0.12) return null;
        const ax = this.ball.x;
        const ay = this.ball.y;
        const bx = fl.to.x;
        const by = fl.to.y;
        const lx = bx - ax;
        const ly = by - ay;
        const len2 = lx * lx + ly * ly || 1;
        const u = clamp(((p.x - ax) * lx + (p.y - ay) * ly) / len2, 0.15, 0.95);
        const cx = ax + lx * u;
        const cy = ay + ly * u;
        const dist = Math.hypot(p.x - cx, p.y - cy);
        const ballTime = remaining * u;
        // Solo sale si está cerca y le da el tiempo (corriendo a ~8 m/s).
        if (dist > 6 || dist / 8 > ballTime + 0.15) return null;
        return { x: cx, y: cy };
    }

    private step(p: Player, tx: number, ty: number, speed: number) {
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.1) {
            p.vx *= 0.5;
            p.vy *= 0.5;
            return;
        }
        const sp = Math.min(speed * (this.phase === 'play' ? this.fSpd(p) : 1), dist * 4);
        p.vx = (dx / dist) * sp;
        p.vy = (dy / dist) * sp;
    }

    private updatePlay(dt: number) {
        const D = this.D;
        const fl = this.ball.flight;
        const carrier = this.ball.holder;
        const attSide: Side = carrier ? carrier.side : fl ? fl.from.side : 0;
        const d = this.dir(attSide);
        if (!carrier && !fl && this.ball.loose) {
            this.updateLoose(dt);
            return;
        }
        if (!carrier && !fl && this.pickup) {
            const pk = this.pickup;
            pk.t += dt;
            const p = pk.p;
            const dx = this.ball.x - p.x;
            const dy = this.ball.y - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 0.45 || pk.t > 0.7) {
                this.pickup = null;
                this.turnoverInPlay(p);
                this.safeT = SAFE_EXIT;
                this.targets.clear();
                if (p.side === 0) this.ctrl = null;
                return;
            }
            const sp = Math.min(9 * this.fSpd(p), dist / dt);
            p.vx = (dx / dist) * sp;
            p.vy = (dy / dist) * sp;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.anim += dt * 9;
            if (Math.abs(p.vx) > 0.4) p.facing = p.vx > 0 ? 1 : -1;
            return;
        }
        const focus = carrier ?? fl?.to ?? null;
        if (!focus) return;
        if (fl?.kick) {
            this.updateKick(dt, fl, fl.kick);
            return;
        }

        // ---- portador ----
        if (carrier && carrier.down <= 0) {
            if (carrier.side === 0) {
                const f = this.fSpd(carrier);
                const burst = (carrier.hit > 0 ? 9.2 : 7.2) * f;
                carrier.vx = carrier.stun > 0 ? 3.5 : burst;
                let vy = ((this.input.down ? 1 : 0) - (this.input.up ? 1 : 0)) * 6 * f;
                if (carrier.juke > 0.14) vy = carrier.jukeDir * 10;
                carrier.vy = vy;
            } else {
                this.cpuCarrier(carrier, dt);
            }
        }

        // ---- apoyos del que ataca ----
        for (const p of this.team(attSide)) {
            if (p === carrier || p.down > 0) continue;
            if (fl && p === fl.to) {
                // El receptor sigue su carrera hacia adelante.
                p.vx = d * (attSide === 0 ? 6.8 : D.cpuRun * 0.95) * this.fSpd(p);
                p.vy *= 0.8;
                continue;
            }
            const ty = clamp(focus.y + p.oy, 3, WIDTH - 3);
            const tx = focus.x - d * (3.5 + Math.abs(p.oy) * 0.22);
            this.step(p, tx, ty, 8.2);
        }

        // ---- defensa ----
        const defSide: Side = attSide === 0 ? 1 : 0;
        const defs = this.team(defSide);
        let pursuer: Player | null = null;
        let pd = Infinity;
        for (const p of defs) {
            if (p.down > 0 || p === this.ctrl || p.fb) continue;
            const dd = Math.hypot(p.x - focus.x, p.y - focus.y);
            if (dd < pd) {
                pd = dd;
                pursuer = p;
            }
        }
        // La defensa rival suma puntos de velocidad PERSONAL según la dificultad (cada uno sobre su propio
        // nivel: un equipo flojo sigue siendo más lento que el tuyo). Los 0,028 son lo que vale un punto en fSpd.
        const defSpeed = defSide === 1 ? D.cpuDefRun * (1 + CPU_DEF_SPD_PTS[this.cfg.difficulty] * 0.028) : 7.0;
        for (const p of defs) {
            if (p.down > 0) {
                p.vx = 0;
                p.vy = 0;
                continue;
            }
            if (p === this.ctrl) {
                this.userDefender(p, focus);
                continue;
            }
            if (p.fb) {
                // Fullback: se queda al fondo hasta que rompen la línea o el portador se le viene
                // encima. Entonces sale a cortarlo adonde VA a estar, no adonde estaba.
                const lineBroken = !defs.some((o) => o !== p && o.down <= 0 && (o.x - focus.x) * d > -1 && Math.abs(o.y - focus.y) < 8);
                const close = Math.hypot(p.x - focus.x, p.y - focus.y) < 9;
                if (lineBroken || close) {
                    const sp = defSpeed * 0.97;
                    const aim = this.leadPoint(p, focus, sp);
                    this.step(p, aim.x, aim.y, sp);
                } else {
                    // Al fondo, corriéndose hacia donde apunta el portador.
                    const ahead = focus.y + focus.vy * 1.2;
                    this.step(p, clamp(focus.x + d * 20, TRY_L - 5, TRY_R + 5), clamp((ahead + WIDTH / 2) / 2, 6, WIDTH - 6), defSpeed * 0.9);
                }
                continue;
            }
            // Leer el pase: el que está cerca de la línea de la pelota sale a cortarla.
            if (fl && !fl.kick && p !== pursuer) {
                const cut = this.laneCut(p, fl);
                if (cut) {
                    this.step(p, cut.x, cut.y, defSpeed + 0.6);
                    continue;
                }
            }
            const chase = p === pursuer || (p.mark === focus && pd > 3 && this.cfg.difficulty !== 'muy-facil');
            if (chase) {
                const sp = defSide === 0 ? 6.4 : defSpeed;
                const aim = this.leadPoint(p, focus, sp);
                this.step(p, aim.x, aim.y, sp);
            } else {
                const mk = p.mark && p.mark.down <= 0 ? p.mark : focus;
                const lineX = focus.x + d * Math.max(3, 7 - Math.abs(mk.y - focus.y) * 0.05);
                this.step(p, lineX, mk.y, defSpeed * 0.85);
            }
        }

        // ---- integrar ----
        for (const p of this.players) {
            if (p.down > 0 || p.pose !== 'stand') continue;
            p.x = clamp(p.x + p.vx * dt, 0.5, 119.5);
            p.y = clamp(p.y + p.vy * dt, p === carrier ? -1 : 1, p === carrier ? WIDTH + 1 : WIDTH - 1);
            const sp = Math.hypot(p.vx, p.vy);
            if (sp > 0.6) p.anim += dt * (4 + sp * 1.1);
            if (Math.abs(p.vx) > 0.4) p.facing = p.vx > 0 ? 1 : -1;
        }

        // ---- pelota en el aire ----
        if (fl) {
            fl.t += dt;
            const k = Math.min(1, fl.t / fl.dur);
            this.ball.x = fl.sx + (fl.to.x - fl.sx) * k;
            this.ball.y = fl.sy + (fl.to.y - fl.sy) * k;
            // Pases largos y salteos se leen más fácil.
            const long = Math.hypot(fl.to.x - fl.sx, fl.to.y - fl.sy) > 14 ? 1.3 : 1;
            const intercept = ((fl.from.side === 0 ? D.intercept : 0.14) * (fl.skip ? 1.8 : 1) * long) / this.fHands(fl.from) ** 2;
            for (const o of this.team(fl.from.side === 0 ? 1 : 0)) {
                // En la gracia de la salida, el primer pase no se corta: los rivales todavía están en el ruck.
                if (this.safeT > 0 || o.down > 0 || fl.tried.has(o)) continue;
                if (Math.hypot(o.x - this.ball.x, o.y - this.ball.y) < 1.5) {
                    fl.tried.add(o);
                    if (rnd() < intercept) {
                        this.say('INTERCEPCIÓN', null, 1.1);
                        this.turnoverInPlay(o);
                        return;
                    }
                }
            }
            if (k >= 1) {
                const rec = fl.to;
                if (((fl.toX0 ?? rec.x) - fl.releaseX) * d > 1.2) {
                    this.startScrum(rec.side === 0 ? 1 : 0, rec.x, rec.y, 'PASE ADELANTADO');
                    return;
                }
                // Knock-on: raro, y más raro cuanto mejor es el equipo (Nueva Zelanda casi nunca; Malta, cada tanto).
                const team = rec.side === 0 ? this.cfg.home : this.cfg.away;
                const knock = (clamp(0.022 - (((team.rating ?? 70) - 40) / 55) * 0.018, 0.003, 0.022) * (fl.skip ? 1.5 : 1)) / (this.fHands(rec) * this.fHands(fl.from)) ** 1.5;
                if (this.safeT <= 0 && rnd() < knock) {
                    this.puff(rec.x, rec.y, 5);
                    this.startScrum(rec.side === 0 ? 1 : 0, rec.x, rec.y, 'KNOCK-ON');
                    return;
                }
                this.catchBall(rec);
            }
            return;
        }

        if (!carrier) return;
        this.ball.x = carrier.x;
        this.ball.y = carrier.y;

        // ---- try: llegando al in-goal se tira sí o sí ----
        if ((carrier.side === 0 && carrier.x >= TRY_R) || (carrier.side === 1 && carrier.x <= TRY_L)) {
            this.scoreTry(carrier);
            return;
        }

        // ---- afuera ----
        if (carrier.y <= 0.2 || carrier.y >= WIDTH - 0.2) {
            this.startLineout(carrier.side === 0 ? 1 : 0, carrier.x, carrier.y);
            return;
        }

        // ---- choques ---- (salvo en la gracia de la salida: ahí nadie lo tacklea)
        for (const df of this.safeT > 0 ? [] : defs) {
            if (df.down > 0 || df.cool > 0) continue;
            const reach = df.lunge > 0 ? 1.9 : 1.35;
            if (Math.hypot(df.x - carrier.x, (df.y - carrier.y) * 1.2) > reach) continue;
            this.contact(df, carrier);
            return;
        }

        // Si el usuario defiende y su jugador quedó lejos, cambia solo al más cercano.
        if (carrier.side === 1 && this.ctrl) {
            const near = this.nearestTo(0, carrier.x, carrier.y);
            const mine = this.ctrl;
            if (
                near && near !== mine && mine.lunge <= 0 &&
                (mine.down > 0 || Math.hypot(mine.x - carrier.x, mine.y - carrier.y) > Math.hypot(near.x - carrier.x, near.y - carrier.y) + 7)
            ) {
                this.ctrl = near;
            }
        }
    }

    /**
     * Todos corren hacia la pelota (en el aire o suelta): los dos más cerca de
     * cada lado y el fullback van a buscarla; el resto acompaña sin amontonarse.
     */
    private chaseBall(dt: number, bx: number, by: number, kicker: Side) {
        const d = this.dir(kicker);
        // Los tuyos corren a 8 m/s; los rivales, según la dificultad. Y cada uno con su velocidad.
        const base = (side: Side) => (side === 0 ? 8 : CPU_CHASE[this.cfg.difficulty]);
        for (const side of [kicker, kicker === 0 ? 1 : 0] as Side[]) {
            const chasers = this.team(side)
                .filter((p) => p.down <= 0)
                .sort((a, b) => Math.hypot(a.x - bx, a.y - by) - Math.hypot(b.x - bx, b.y - by));
            chasers.forEach((p, i) => {
                if (i < 2 || p.fb) this.step(p, bx, by, (base(side) + (side === kicker ? 0.4 : 0)) * this.fSpd(p));
                else this.step(p, bx - d * (side === kicker ? 8 : -6), clamp(p.y, 4, WIDTH - 4), 6 * this.fSpd(p));
            });
        }
        for (const p of this.players) {
            if (p.down > 0 || p.pose !== 'stand') continue;
            p.x = clamp(p.x + p.vx * dt, 0.5, 119.5);
            p.y = clamp(p.y + p.vy * dt, 1, WIDTH - 1);
            const sp = Math.hypot(p.vx, p.vy);
            if (sp > 0.6) p.anim += dt * (4 + sp * 1.1);
            if (Math.abs(p.vx) > 0.4) p.facing = p.vx > 0 ? 1 : -1;
        }
    }

    /** La pelota en el aire después de una patada: todos van a donde va a caer. */
    private updateKick(dt: number, fl: Flight, kick: { tx: number; ty: number }) {
        fl.t += dt;
        const k = Math.min(1, fl.t / fl.dur);
        this.ball.x = fl.sx + (kick.tx - fl.sx) * k;
        this.ball.y = fl.sy + (kick.ty - fl.sy) * k;
        const att = fl.from.side;
        this.chaseBall(dt, kick.tx, kick.ty, att);
        if (k < 1) return;
        // Patada fuerte que pasó entre los palos: es drop.
        if (fl.goal) {
            this.ball.flight = null;
            this.dropFrom = { x: fl.sx, y: fl.sy, side: att };
            this.dropOk = true;
            this.afterDrop();
            return;
        }
        // Pica y queda suelta, rodando un poco para adelante.
        this.ball.flight = null;
        this.ball.loose = { vx: this.dir(att) * (3 + rnd() * 3), vy: (rnd() - 0.5) * 3, t: 0, kicker: att };
        this.puff(this.ball.x, this.ball.y, 4);
    }

    /** Pelota suelta en el piso: la levanta el primero que llega, sin teletransportes. */
    private updateLoose(dt: number) {
        const lb = this.ball.loose;
        if (!lb) return;
        lb.t += dt;
        this.ball.x = clamp(this.ball.x + lb.vx * dt, 0.5, 119.5);
        this.ball.y += lb.vy * dt;
        const drag = Math.max(0, 1 - 1.8 * dt);
        lb.vx *= drag;
        lb.vy *= drag;
        // El pique de la ovalada: cada tanto cambia de dirección.
        if (rnd() < 2 * dt && Math.hypot(lb.vx, lb.vy) > 1) lb.vy += (rnd() - 0.5) * 4;

        if (this.ball.y <= 0.2 || this.ball.y >= WIDTH - 0.2) {
            this.say('AFUERA', null, 0.9);
            this.startLineout(lb.kicker === 0 ? 1 : 0, this.ball.x, this.ball.y);
            return;
        }

        this.chaseBall(dt, this.ball.x, this.ball.y, lb.kicker);

        let who: Player | null = null;
        let best = 0.65;
        for (const p of this.players) {
            if (p.down > 0 || p.pose !== 'stand') continue;
            const dist = Math.hypot(p.x - this.ball.x, p.y - this.ball.y);
            if (dist < best) {
                best = dist;
                who = p;
            }
        }
        if (!who) return;
        // Si hay uno del otro lado encima también, se la disputan: manos de cada uno y la dificultad.
        const first: Player = who;
        const rival = this.players.find((p) => p.side !== first.side && p.down <= 0 && p.pose === 'stand' && Math.hypot(p.x - this.ball.x, p.y - this.ball.y) < 1.2);
        if (rival) {
            const user = first.side === 0 ? first : rival;
            const cpu = first.side === 0 ? rival : first;
            const cpuOdds = clamp(CPU_GRAB[this.cfg.difficulty] * (this.fHands(cpu) / this.fHands(user)) ** 2, 0.1, 0.9);
            who = rnd() < cpuOdds ? cpu : user;
        }
        this.ball.loose = null;
        const att = lb.kicker;
        const inGoal = att === 0 ? this.ball.x >= TRY_R : this.ball.x <= TRY_L;
        if (who.side === att) {
            this.catchBall(who);
            if (inGoal) this.scoreTry(who);
            else this.say('LA RECUPERA', null, 0.8);
            return;
        }
        this.say(who.fb ? 'LA AGARRA EL FULLBACK' : 'LA AGARRA EL RIVAL', null, 0.9);
        this.turnoverInPlay(who);
    }

    private userDefender(p: Player, focus: Player) {
        if (p.lunge > 0) {
            // El vuelo lo descuenta el bucle general; acá solo se dirige al portador.
            const dx = focus.x - p.x;
            const dy = focus.y - p.y;
            const dist = Math.hypot(dx, dy) || 1;
            p.vx = (dx / dist) * 11;
            p.vy = (dy / dist) * 11;
            return;
        }
        const dx = focus.x + focus.vx * 0.2 - p.x;
        const f = this.fSpd(p);
        p.vx = Math.sign(dx) * Math.min(Math.abs(dx) * 3, 7.4 * f);
        let vy = ((this.input.down ? 1 : 0) - (this.input.up ? 1 : 0)) * 6.6 * f;
        if (this.cfg.difficulty === 'muy-facil' && vy === 0) vy = clamp((focus.y - p.y) * 2, -4, 4);
        p.vy = vy;
    }

    private cpuCarrier(c: Player, dt: number) {
        const D = this.D;
        c.vx = c.stun > 0 ? -3 : -D.cpuRun * this.fSpd(c);
        let threat: Player | null = null;
        let td = Infinity;
        for (const o of this.team(0)) {
            if (o.down > 0) continue;
            const ahead = c.x - o.x;
            if (ahead < -1 || ahead > 11) continue;
            const dd = Math.hypot(ahead, o.y - c.y);
            if (dd < td) {
                td = dd;
                threat = o;
            }
        }
        let vy = 0;
        if (threat) {
            const away: 1 | -1 = c.y >= threat.y ? 1 : -1;
            vy = away * DODGE_VY[this.cfg.difficulty];
            if (td < 4.5 && rnd() < D.cpuPassIQ * dt) {
                const opt = this.passTarget(c, away) ?? this.bestOption(c);
                if (opt && Math.abs(opt.y - threat.y) > 3) {
                    this.throwPass(c, opt);
                    return;
                }
            }
        }
        // Apurado y lejos del try: a veces la patea al fondo en vez de comerse el tackle.
        // Cerca de los palos y apurado: a veces prueba el drop.
        if (threat && td < 7 && c.x - TRY_L < 32 && Math.abs(c.y - WIDTH / 2) < 18 && this.cfg.difficulty !== "muy-facil" && rnd() < 0.12 * dt) {
            this.cpuDrop(c);
            return;
        }
        if (threat && td < 6 && c.x > 45 && rnd() < 0.3 * dt) {
            this.throwKick(c, 0.35 + rnd() * 0.45);
            return;
        }
        if (c.y < 7) vy = Math.max(vy, 3);
        if (c.y > WIDTH - 7) vy = Math.min(vy, -3);
        c.vy = vy;
    }

    private contact(df: Player, c: Player) {
        const D = this.D;
        let tackled: boolean;
        let label = 'TACKLE';
        // Las skills mueven las chances: el tackle del que defiende contra la potencia (choque) o la velocidad (amague) del portador.
        const pr = (v: number) => clamp(v, 0.02, 0.98);
        const edge = this.fTkl(df) / this.fTkl(c);
        if (c.side === 0) {
            if (c.hit > 0) {
                tackled = rnd() >= pr(D.breakHit / edge);
                if (!tackled) label = 'QUIEBRE';
            } else if (c.juke > 0) {
                tackled = rnd() >= pr(D.dodge * (this.fSpd(c) / this.fSpd(df)) ** 2);
                if (!tackled) label = 'AMAGUE';
            } else {
                tackled = rnd() < pr(D.cpuTackle * edge);
                if (!tackled) label = 'SE SOLTÓ';
            }
        } else {
            const p = df === this.ctrl ? (df.lunge > 0 ? D.userTackle : 0.55) : 0.45;
            tackled = rnd() < pr(p * (1 - D.cpuBreak * 0.6) * edge);
            if (!tackled) label = 'SE SOLTÓ';
        }

        if (!tackled) {
            df.pose = 'ground';
            df.down = label === 'QUIEBRE' ? 1.3 : 0.8;
            df.lunge = 0;
            df.cool = 1.5;
            df.vx = 0;
            df.vy = 0;
            c.stun = label === 'QUIEBRE' ? 0.18 : 0;
            this.puff(df.x, df.y, 6);
            this.shake = label === 'QUIEBRE' ? 0.8 : 0.3;
            this.say(label, null, 0.8);
            return;
        }

        // Tackle: los dos al piso y se arma el ruck.
        this.shake = 0.9;
        this.puff(c.x, c.y, 12);
        c.pose = 'ground';
        df.pose = 'ground';
        c.down = 99;
        df.down = 99;
        df.lunge = 0;
        c.vx = 0;
        c.vy = 0;
        df.vx = 0;
        df.vy = 0;
        this.ruckAt = { x: c.x, y: clamp(c.y, 2, WIDTH - 2), side: c.side };
        this.ruckCarrier = c;
        this.offloadTried = false;
        this.ball.x = c.x - this.dir(c.side) * 0.8;
        this.ball.y = c.y;
        this.phase = 'ruck';
        this.phaseT = 1.3;
        this.mg = { kind: 'ruck', mash: 0 };
        this.ruckRoll = rnd();
        this.say('TACKLE', null, 0.8);
        // Se anota el tackle del defensor (puesto = df.i): alimenta las estadísticas del torneo.
        this.log.push({ t: this.elapsed(), side: df.side, text: '', score: null, sim: false, stat: { slot: df.i, kind: 'tackle' } });
        this.buildRuck(c, df);
    }

    /**
     * Arma el ruck de verdad: dos de cada lado llegan, se agachan y empujan
     * sobre la pelota; el resto se reacomoda para la próxima jugada mientras
     * se disputa.
     */
    private buildRuck(c: Player, df: Player) {
        this.ruckFirst = null;
        const d = this.dir(c.side);
        this.planFormation(c.side, c.x - d * 3, c.y, c);
        this.targets.delete(c);
        this.targets.delete(df);
        for (const side of [c.side, c.side === 0 ? 1 : 0] as Side[]) {
            const sd = side === c.side ? -d : d; // de qué lado de la pelota se paran
            const near = this.team(side)
                .filter((p) => p !== c && p !== df && p.down <= 0 && !p.fb)
                .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))
                .slice(0, 2);
            near.forEach((p, k) => {
                p.rucking = true;
                this.targets.set(p, { x: c.x + sd * 1.5, y: clamp(c.y + (k ? 1.2 : -1.2), 1, WIDTH - 1) });
            });
        }
    }

    /**
     * Probabilidad de que retenga el ruck el que tenía la pelota, con los toques por
     * segundo del usuario. Es la cuenta de verdad: la barra de pelea y el desenlace
     * salen de acá, así que la barra no puede prometer más de lo que se juega.
     */
    private ruckKeep(userRate: number): { keep: number; alone: boolean; jackal: boolean } {
        const { side } = this.ruckAt;
        const other: Side = side === 0 ? 1 : 0;
        const inRuck = (s: Side) => this.players.filter((p) => p.side === s && p.rucking && p.pose === 'scrum');
        const own = inRuck(side);
        const opp = inRuck(other);
        const contest = clamp((userRate - this.D.ruckRate) / 4, -1, 1); // + = el usuario empuja más que el rival
        const power = (ps: Player[]) => (ps.length ? ps.reduce((a, p) => a + this.fTkl(p) * (this.kgOf(p) / 95), 0) / ps.length : 0.9);
        let keep = side === 0 ? this.D.ruckKeep + contest * 0.1 : this.D.cpuRuckKeep - contest * 0.16;
        keep += (own.length - opp.length) * 0.05;
        keep += (power(own) - power(opp)) * 0.25;
        const alone = own.length === 0;
        const jackal = this.ruckFirst !== null && this.ruckFirst !== side;
        if (alone) keep -= 0.2;
        if (jackal) keep -= 0.12;
        return { keep: clamp(keep, 0.3, 0.98), alone, jackal };
    }

    /**
     * La raya que tu lado de la barra tiene que cruzar para quedarse con la pelota (0 a 1).
     * Sale del sorteo fijado al armarse el ruck: si tenías la pelota gana el que supera
     * `roll`; si la tenía el rival, el que supera `1 - roll`.
     */
    private ruckLine(): number {
        return this.ruckAt.side === 0 ? this.ruckRoll : 1 - this.ruckRoll;
    }

    private updateRuck(dt: number) {
        const mash = this.mg?.kind === 'ruck' ? this.mg.mash : 0;
        // Los que llegan al ruck corren y se agachan; el resto va a su lugar.
        for (const [p, t] of this.targets) {
            if (p.down > 0) continue;
            const dist = Math.hypot(t.x - p.x, t.y - p.y);
            if (p.rucking && (p.pose === 'scrum' || dist < 0.6)) {
                // Ya está metido en el ruck: agachado, empujando. El empuje lo
                // corre de a poco (nunca de golpe) hacia donde lo lleva la pelea.
                if (p.pose !== 'scrum' && this.ruckFirst === null) this.ruckFirst = p.side;
                p.pose = 'scrum';
                p.facing = t.x > this.ruckAt.x ? -1 : 1;
                const push = clamp((p.side === 0 ? mash * 0.04 : -mash * 0.04) * this.dir(0), -0.8, 0.8);
                const gx = t.x + push;
                const step = clamp(gx - p.x, -2 * dt, 2 * dt);
                const stepY = clamp(t.y - p.y, -2 * dt, 2 * dt);
                p.x += step;
                p.y += stepY;
                p.vx = 0;
                p.vy = 0;
                continue;
            }
            const sp = Math.min(dist / dt, p.rucking ? 12 : 9);
            if (dist > 0.05) {
                p.vx = ((t.x - p.x) / dist) * sp;
                p.vy = ((t.y - p.y) / dist) * sp;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.anim += dt * 9;
                if (Math.abs(p.vx) > 0.4) p.facing = p.vx > 0 ? 1 : -1;
            } else {
                p.vx = 0;
                p.vy = 0;
            }
        }
        if (this.phaseT > 0) return;

        const { x, y, side } = this.ruckAt;
        /*
         * El ruck casi siempre lo retiene el que tenía la pelota. Se pierde
         * cuando: el portador quedó solo (nadie llegó a apoyar), el rival se
         * metió primero sobre la pelota (jackal), el rival tiene más gente
         * encima o empuja más fuerte. Los toques del usuario son su empuje y
         * se comparan contra el ritmo del rival, que sube con la dificultad.
         */
        const other: Side = side === 0 ? 1 : 0;
        const { keep, alone, jackal } = this.ruckKeep(mash / 1.3);
        // Gana el que cruza la raya de la barra: el mismo sorteo que se ve (ruckLine), sin tirar otro al final.
        const userWin = side === 0 ? keep : 1 - keep;
        const winner: Side = userWin > this.ruckLine() ? 0 : 1;
        this.mg = null;
        if (winner !== side) {
            const why = alone ? 'Quedó solo: nadie llegó a apoyar' : jackal ? 'Llegaron primero sobre la pelota' : side === 0 ? 'Empujaron más: tocá más rápido' : 'Empujaste más y la ganaste';
            this.say(winner === 0 ? 'RUCK GANADO' : jackal ? 'JACKAL' : 'PELOTA ROBADA', why, 1.2);
            if (this.deadBall()) return;
        } else if (side === 0) this.say('PELOTA ASEGURADA', null, 0.5);
        else this.say('RUCK PERDIDO', 'El rival aseguró la pelota', 0.8);
        // La levanta el más cercano a la pelota del que la ganó, y se sigue jugando.
        this.quickRelease(winner, x, y, null);
    }

    /** Offload: soltar la pelota en el contacto, antes de que se arme el ruck. */
    private tryOffload(dir: -1 | 1 | 0) {
        const c = this.ruckCarrier;
        if (!c || this.offloadTried) return;
        this.offloadTried = true;
        // Solo a uno que viene de atrás o a la par: el offload también es pase y no puede ir adelante.
        const back = this.dir(c.side);
        const mates = this.team(c.side).filter((p) => p !== c && p.down <= 0 && !p.rucking && (p.x - c.x) * back <= 0.5 && Math.hypot(p.x - c.x, p.y - c.y) < 9);
        const target =
            mates.filter((p) => dir === 0 || Math.sign(p.y - c.y) === dir).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0] ??
            null;
        if (!target || rnd() > 0.6) {
            this.say('NO SALIÓ EL OFFLOAD', null, 0.8);
            return;
        }
        // El tackleado se levanta en un rato; la jugada sigue sin ruck.
        for (const p of this.players) {
            if (p.down > 90) p.down = 1.1;
            if (p.rucking) {
                p.rucking = false;
                p.pose = 'stand';
            }
        }
        this.mg = null;
        this.phase = 'play';
        this.ball.holder = c;
        this.throwPass(c, target);
        this.say('OFFLOAD', null, 0.9);
    }

    private updateScrum(dt: number) {
        const mg = this.mg;
        if (!mg || mg.kind !== 'scrum') return;
        mg.cpu += (this.D.scrumCpu * dt * (0.7 + rnd() * 0.6)) / this.packRatio() ** 2;
        const bal = clamp((mg.user - mg.cpu) / 40, -1, 1);
        for (const p of this.players) {
            if (p.pose === 'scrum') p.x += bal * dt * 0.8;
        }
        if (this.phaseT > 0) return;
        const winner: Side = mg.user >= mg.cpu ? 0 : 1;
        this.say(winner === 0 ? 'SCRUM GANADO' : 'SCRUM PERDIDO', null, 1);
        // Sale por atrás del pack: el último del scrum se la da al medio que espera en la base.
        const pack = this.team(winner).filter((p) => p.pose === 'scrum');
        const d = this.dir(winner);
        const back = pack.sort((a, b) => (a.x - b.x) * d)[0] ?? null;
        this.quickRelease(winner, this.ball.x, this.ball.y, back);
    }

    private updateTiming(dt: number) {
        const mg = this.mg;
        if (!mg || mg.kind !== 'timing' || mg.done) return;
        mg.cursor += mg.dir * mg.speed * dt;
        if (mg.cursor >= 1) {
            mg.cursor = 1;
            mg.dir = -1;
        } else if (mg.cursor <= 0) {
            mg.cursor = 0;
            mg.dir = 1;
        }
    }

    private resolveLineout() {
        const mg = this.mg;
        const lo = this.lineout;
        if (!lo || !mg || mg.kind !== 'timing') return;
        // Saque tuyo: lo ganás si acertaste. Saque rival: lo robás si acertaste.
        const userHit = mg.done && mg.win;
        const winner: Side = userHit ? 0 : 1;
        this.say(winner === lo.thrower ? 'LINE LIMPIO' : 'LINE ROBADO', null, 1);
        // Atrapa el saltador que está en la hilera; después se la da al medio.
        const catchY = lo.y === 0 ? 10 : WIDTH - 10;
        const jumper =
            this.team(winner)
                .filter((p) => p.down <= 0)
                .sort((a, b) => Math.hypot(a.x - lo.x, a.y - catchY) - Math.hypot(b.x - lo.x, b.y - catchY))[0] ?? this.team(winner)[0];
        this.quickRelease(winner, lo.x, catchY, jumper);
    }

    private resolveConversion() {
        const mg = this.mg;
        const lt = this.lastTry;
        if (!mg || mg.kind !== 'timing' || !lt) return;
        const ok = mg.userActs ? mg.done && mg.win : mg.win;
        if (ok) this.score[lt.side] += 2;
        this.note(lt.side, ok ? 'Conversión' : 'Conversión errada', ok, { slot: this.convKicker, kind: ok ? 'conv' : 'miss' });
        this.mg = null;
        this.say(ok ? 'CONVERTIDO' : 'AFUERA', ok ? '+2' : null, 1.3);
        this.phase = 'convResult';
        this.phaseT = 1.3;
    }

    /* ---------------- HUD ---------------- */

    hud(): Hud {
        const c = this.ball.holder ?? this.ball.flight?.to ?? null;
        const mg = this.mg;
        let hint: string | null = null;
        if (this.phase === 'scrum') hint = 'Tocá ESPACIO lo más rápido que puedas';
        else if (this.phase === 'ruck') hint = this.ruckAt.side === 0 ? 'Tocá ESPACIO para asegurar el ruck' : 'Tocá ESPACIO para disputar el ruck';
        else if (this.phase === 'lineout') hint = this.lineout?.thrower === 0 ? 'ESPACIO cuando la marca pase por el verde' : 'ESPACIO en el verde para robar el line';
        else if (this.phase === 'conv' && mg?.kind === 'timing') hint = mg.userActs ? 'ESPACIO cuando la marca esté en el verde' : 'Patea el rival';
        else if (this.phase === 'drop') hint = this.dropPrep > 0 ? 'Se acomoda para el drop' : 'ESPACIO o Q cuando la marca esté en el verde';
        const s = Math.ceil(this.clock);
        return {
            home: this.cfg.home.short,
            away: this.cfg.away.short,
            homeColor: this.kits[0].shirt,
            awayColor: this.kits[1].shirt,
            sh: this.score[0],
            sa: this.score[1],
            clock: this.overtime ? 'ORO' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
            period: this.overtime ? 'Muerte súbita' : this.lastPlay ? 'Última jugada' : this.half === 1 ? '1.er tiempo' : this.half === 3 ? 'Minuto extra' : '2.º tiempo',
            banner: this.banner?.text ?? null,
            bannerSub: this.banner?.sub ?? null,
            hint,
            attacking: !!c && c.side === 0,
            phase: this.phase,
            carrier: c ? `${c.i + 1} · ${playerNames(c.side === 0 ? this.cfg.home : this.cfg.away)[c.i].short}${c.sk ? ` · ${Math.round(this.legs(c) * 100)}%` : ''}` : null,
        };
    }

    /* ---------------- dibujo ---------------- */

    private sx(x: number) {
        return Math.round((x - this.camX) * PXM);
    }

    private sy(y: number) {
        return Math.round(FIELD_TOP + y * PYM);
    }

    render(ctx: CanvasRenderingContext2D) {
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        if (this.shake > 0) ctx.translate(Math.round((rnd() - 0.5) * this.shake * 3), Math.round((rnd() - 0.5) * this.shake * 2));
        this.drawGround(ctx);

        const items: { y: number; draw: () => void }[] = [];
        for (const p of this.players) items.push({ y: p.y, draw: () => this.drawPlayer(ctx, p) });
        for (const gx of [TRY_L, TRY_R]) {
            items.push({ y: WIDTH / 2 - 2.8, draw: () => this.drawPost(ctx, gx, WIDTH / 2 - 2.8, false) });
            items.push({ y: WIDTH / 2 + 2.8, draw: () => this.drawPost(ctx, gx, WIDTH / 2 + 2.8, true) });
        }
        items.sort((a, b) => a.y - b.y);
        for (const it of items) it.draw();

        this.drawLooseBall(ctx);

        for (const pt of this.particles) {
            ctx.fillStyle = pt.c;
            ctx.fillRect(this.sx(pt.x), this.sy(pt.y) - 1, 1, 1);
        }
        ctx.restore();
        this.drawMinigame(ctx);
    }

    private drawGround(ctx: CanvasRenderingContext2D) {
        // Tribuna, con un poco de paralaje.
        ctx.fillStyle = '#1b1e29';
        ctx.fillRect(0, 0, this.viewW, FIELD_TOP);
        const par = this.camX * PXM * 0.6;
        const startCol = Math.floor(par / 3);
        for (let row = 0; row < 7; row++) {
            for (let c = 0; c < this.viewW / 3 + 2; c++) {
                const k = (startCol + c) * 7 + row * 31;
                if ((k * 13) % 5 === 0) continue;
                const bounce = this.phase === 'try' && k % 3 === 0 ? Math.round(Math.sin(this.time * 18 + k)) : 0;
                ctx.fillStyle = this.crowd[((k % 400) + 400) % 400];
                ctx.fillRect(Math.round(c * 3 - (par % 3)), 4 + row * 3 + bounce, 2, 2);
            }
        }
        // Carteles.
        const boardY = FIELD_TOP - 9;
        for (let m = Math.floor(this.camX / 12) * 12 - 12; m < this.camX + this.viewW / PXM + 12; m += 12) {
            const x0 = this.sx(m);
            ctx.fillStyle = Math.round(m / 12) % 2 === 0 ? '#1f3b73' : '#23262f';
            ctx.fillRect(x0, boardY, 12 * PXM - 1, 7);
            ctx.fillStyle = '#f0c419';
            ctx.fillRect(x0 + 4, boardY + 3, 12 * PXM - 9, 1);
        }

        // Pasto a franjas.
        const top = this.sy(-3);
        const bottom = this.sy(WIDTH + 3);
        for (let m = Math.floor(this.camX / 5) * 5; m < this.camX + this.viewW / PXM + 5; m += 5) {
            const inGoal = m < TRY_L || m >= TRY_R;
            const even = Math.round(m / 5) % 2 === 0;
            ctx.fillStyle = inGoal ? (even ? '#3a7f35' : '#357631') : even ? '#469a40' : '#3f8f3a';
            ctx.fillRect(this.sx(m), top, 5 * PXM, bottom - top);
        }
        ctx.fillStyle = '#2f3a2c';
        ctx.fillRect(0, bottom, this.viewW, VIEW_H - bottom);

        // Líneas.
        ctx.fillStyle = '#eef4e8';
        const y0 = this.sy(0);
        const y1 = this.sy(WIDTH);
        const x0 = this.sx(0);
        const x1 = this.sx(120);
        ctx.fillRect(x0, y0, x1 - x0, 1);
        ctx.fillRect(x0, y1, x1 - x0, 1);
        for (const lx of [0, TRY_L, 32, 60, 88, TRY_R, 120]) ctx.fillRect(this.sx(lx), y0, 1, y1 - y0);
        for (const lx of [50, 70]) {
            for (let yy = y0; yy < y1; yy += 6) ctx.fillRect(this.sx(lx), yy, 1, 3);
        }
        for (const ly of [5, 15, WIDTH - 15, WIDTH - 5]) {
            for (const lx of [22, 32, 50, 60, 70, 88, 98]) ctx.fillRect(this.sx(lx) - 2, this.sy(ly), 5, 1);
        }
        // Banderines.
        for (const fx of [0, TRY_L, 32, 60, 88, TRY_R, 120]) {
            for (const fy of [0, WIDTH]) {
                const px = this.sx(fx);
                const py = this.sy(fy);
                ctx.fillStyle = '#e9e4d8';
                ctx.fillRect(px, py - 6, 1, 6);
                ctx.fillStyle = fx === 60 ? '#f0c419' : '#c62828';
                ctx.fillRect(px + 1, py - 6, 3, 2);
            }
        }
    }

    /** Un poste. El de adelante también dibuja el travesaño hasta el de atrás. */
    private drawPost(ctx: CanvasRenderingContext2D, gx: number, gy: number, withBar: boolean) {
        const px = this.sx(gx);
        const py = this.sy(gy);
        if (px < -10 || px > this.viewW + 10) return;
        ctx.fillStyle = '#1f3b73';
        ctx.fillRect(px - 2, py - 6, 5, 6);
        ctx.fillStyle = '#f4f4f4';
        ctx.fillRect(px, py - 44, 1, 44);
        ctx.fillStyle = '#c9c9c9';
        ctx.fillRect(px + 1, py - 44, 1, 38);
        if (withBar) {
            const back = this.sy(gy - 5.6);
            ctx.fillStyle = '#f4f4f4';
            ctx.fillRect(px, back - 14, 2, py - back);
        }
    }

    private frameFor(p: Player): Frame {
        if (p.pose === 'celebrate') return Math.floor(this.time * 5 + p.i) % 2 === 0 ? 'celebrate' : 'idle';
        if (p.passT > 0) return 'pass';
        const still = this.phase === 'lineout' || this.phase === 'conv' || this.phase === 'convResult' || this.phase === 'drop' || this.phase === 'dropResult' || this.phase === 'halftime' || this.phase === 'end';
        if (still || Math.hypot(p.vx, p.vy) < 0.6) return 'idle';
        return (['run0', 'run1', 'run2', 'run3'] as Frame[])[Math.floor(p.anim) % 4];
    }

    /** Tirarse al try y el tackle tienen cuadro propio, horizontal; no se rotan. */
    private flyingFrame(p: Player): 'dive' | 'tackle' | null {
        if (p.pose === 'dive') return this.ball.holder === p && !this.ball.flight ? 'dive' : 'tackle';
        if (p.lunge > 0 && p.pose === 'stand') return 'tackle';
        return null;
    }

    private drawPlayer(ctx: CanvasRenderingContext2D, p: Player) {
        const kit = this.kits[p.side];
        const sx = this.sx(p.x);
        const sy = this.sy(p.y);
        if (sx < -30 || sx > this.viewW + 30) return;

        const flying = this.flyingFrame(p);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        if (flying) ctx.fillRect(sx - 13, sy - 1, 26, 2);
        else ctx.fillRect(sx - 5, sy - 1, 11, 2);

        const lying = p.pose === 'ground' || p.pose === 'dive';
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(p.facing, 1);
        if (flying) {
            ctx.drawImage(playerSprite(p.look, kit, flying), -DIVE_ANCHOR.x, -DIVE_ANCHOR.y);
        } else {
            const img = playerSprite(p.look, kit, p.pose === 'scrum' ? 'run1' : lying ? 'idle' : this.frameFor(p));
            if (lying) {
                ctx.rotate(Math.PI / 2);
                ctx.drawImage(img, -12, -12);
            } else if (p.pose === 'scrum') {
                ctx.rotate(Math.PI / 3);
                ctx.drawImage(img, -10, -SPRITE_H + 4);
            } else {
                const hop = p.pose === 'celebrate' && Math.floor(this.time * 5 + p.i) % 2 === 0 ? -2 : 0;
                ctx.drawImage(img, -8, -SPRITE_H + hop);
            }
        }
        ctx.restore();

        // Barra de potencia mientras se carga la patada (A mantenida).
        if (this.kickCharge !== null && this.ball.holder === p) {
            const bx = sx - 9;
            const by = sy + 3; // a los pies: arriba va el nombre
            ctx.fillStyle = "#141218";
            ctx.fillRect(bx - 1, by - 1, 20, 5);
            const w = Math.round(18 * this.kickCharge);
            ctx.fillStyle = this.kickCharge > 0.8 ? "#e04848" : this.kickCharge > 0.45 ? "#f0c419" : "#3fbf5a";
            ctx.fillRect(bx, by, w, 3);
        }

        // Marca del jugador que manejás.
        const mine = (this.ball.holder === p && p.side === 0) || this.ctrl === p;
        if (mine && (this.phase === 'play' || this.phase === 'ready')) {
            ctx.fillStyle = Math.floor(this.time * 6) % 2 === 0 ? '#f0c419' : '#fff3a8';
            const ay = sy - SPRITE_H - 6;
            ctx.fillRect(sx - 2, ay, 5, 1);
            ctx.fillRect(sx - 1, ay + 1, 3, 1);
            ctx.fillRect(sx, ay + 2, 1, 1);
            // Nombre del jugador que manejás, arriba de la marca.
            const name = playerNames(p.side === 0 ? this.cfg.home : this.cfg.away)[p.i].last.toUpperCase();
            ctx.font = `8px ${this.fontFamily}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            const tw = Math.ceil(ctx.measureText(name).width);
            ctx.fillStyle = "rgba(5,6,8,0.75)";
            ctx.fillRect(sx - Math.ceil(tw / 2) - 2, ay - 10, tw + 4, 9);
            ctx.fillStyle = "#f3f1ea";
            ctx.fillText(name, sx, ay - 3);
        }

        // La pelota en la mano.
        if (this.ball.holder === p && !this.ball.flight && this.phase !== 'ruck' && flying !== 'dive') {
            if (lying) drawBall(ctx, sx + p.facing * 14, sy - 4);
            else if (p.pose === 'celebrate') drawBall(ctx, sx, sy - SPRITE_H - 3);
            else drawBall(ctx, sx + p.facing * 7, sy - 10);
        }
    }

    private drawLooseBall(ctx: CanvasRenderingContext2D) {
        const fl = this.ball.flight;
        if (fl) {
            const k = Math.min(1, fl.t / fl.dur);
            const z = fl.kick ? Math.sin(Math.PI * k) * 46 + 4 : Math.sin(Math.PI * k) * 6 + 8;
            const bx = this.sx(this.ball.x);
            const by = this.sy(this.ball.y);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(bx - 2, by - 1, 5, 2);
            drawBall(ctx, bx, by - z);
            return;
        }
        if (this.phase === 'ruck' || this.phase === 'scrum' || this.ball.loose || this.pickup) {
            drawBall(ctx, this.sx(this.ball.x), this.sy(this.ball.y) - 2);
        }
        const lo = this.lineout;
        if (this.phase === 'lineout' && lo && this.mg?.kind === 'timing') {
            if (this.mg.done) {
                const t = clamp(1 - this.phaseT / 0.5, 0, 1);
                const ty = lo.y === 0 ? 10 : WIDTH - 10;
                drawBall(ctx, this.sx(lo.x), this.sy(lo.y + (ty - lo.y) * t) - 8 - Math.sin(Math.PI * t) * 18);
            } else {
                drawBall(ctx, this.sx(lo.x), this.sy(lo.y) - 12);
            }
        }
        if (this.phase === 'convResult' && this.lastTry) {
            const t = Math.min(1, clamp(1 - this.phaseT / 1.3, 0, 1) * 1.4);
            const gx = this.lastTry.side === 0 ? TRY_R : TRY_L;
            const kx = gx - this.dir(this.lastTry.side) * 18;
            const ky = this.lastTry.y;
            const bx = kx + (gx + this.dir(this.lastTry.side) * 2 - kx) * t;
            const by = ky + (WIDTH / 2 - ky) * t;
            drawBall(ctx, this.sx(bx), this.sy(by) - Math.sin(Math.PI * t) * 30 - 6);
        }
        if (this.phase === 'dropResult' && this.dropFrom) {
            // La pelota del drop vuela a los palos: si entra, pasa por el medio; si no, se abre.
            const f = this.dropFrom;
            const t = Math.min(1, clamp(1 - this.phaseT / 1.4, 0, 1) * 1.3);
            const gx = f.side === 0 ? TRY_R + 2 : TRY_L - 2;
            const gy = this.dropOk ? WIDTH / 2 : WIDTH / 2 + (f.y < WIDTH / 2 ? -7 : 7);
            const bx = f.x + (gx - f.x) * t;
            const by = f.y + (gy - f.y) * t;
            drawBall(ctx, this.sx(bx), this.sy(by) - Math.sin(Math.PI * Math.min(1, t)) * 36 - 6);
        }
    }

    private drawMinigame(ctx: CanvasRenderingContext2D) {
        const mg = this.mg;
        if (!mg) return;
        const w = 150;
        const x0 = Math.round((this.viewW - w) / 2);
        const y0 = 56;
        if (mg.kind === 'scrum') {
            const bal = clamp((mg.user - mg.cpu) / 40, -1, 1);
            const split = Math.round(w / 2 + (bal * w) / 2);
            ctx.fillStyle = '#141218';
            ctx.fillRect(x0 - 2, y0 - 2, w + 4, 14);
            ctx.fillStyle = this.kits[0].shirt;
            ctx.fillRect(x0, y0, split, 8);
            ctx.fillStyle = this.kits[1].shirt;
            ctx.fillRect(x0 + split, y0, w - split, 8);
            ctx.fillStyle = '#f0c419';
            ctx.fillRect(x0 + w / 2, y0 - 3, 1, 14);
            ctx.fillStyle = '#eef4e8';
            ctx.fillRect(x0, y0 + 10, Math.round(w * clamp(this.phaseT / 3.2, 0, 1)), 1);
            return;
        }
        if (mg.kind === 'ruck') {
            // Pelea del ruck: tus toques contra el empuje que "hace" el rival en el mismo tiempo.
            // Es la misma cuenta con la que se resuelve (userRate vs ruckRate), así que no miente.
            // La barra es la probabilidad real de quedarte con la pelota (incluye cuántos llegaron,
            // quién se metió primero y el peso), no solo los toques: el desenlace sale de esa misma cuenta.
            // Con la misma cuenta que el desenlace (toques / 1,3): sin proyecciones que después no se cumplan.
            const { keep } = this.ruckKeep(mg.mash / 1.3);
            const userWin = this.ruckAt.side === 0 ? keep : 1 - keep;
            const split = Math.round(userWin * w);
            ctx.fillStyle = '#141218';
            ctx.fillRect(x0 - 2, y0 - 2, w + 4, 14);
            ctx.fillStyle = this.kits[0].shirt;
            ctx.fillRect(x0, y0, split, 8);
            ctx.fillStyle = this.kits[1].shirt;
            ctx.fillRect(x0 + split, y0, w - split, 8);
            // La raya amarilla: hay que pasarla con tu color. Si la barra termina de tu lado, ganás.
            ctx.fillStyle = '#f0c419';
            ctx.fillRect(x0 + Math.round(this.ruckLine() * w), y0 - 3, 2, 14);
            return;
        }
        ctx.fillStyle = '#141218';
        ctx.fillRect(x0 - 2, y0 - 2, w + 4, 12);
        ctx.fillStyle = '#4b4f5c';
        ctx.fillRect(x0, y0, w, 8);
        ctx.fillStyle = '#3fbf5a';
        const zw = Math.max(3, Math.round(mg.zone * w));
        ctx.fillRect(x0 + Math.round(w / 2 - zw / 2), y0, zw, 8);
        const cx = x0 + Math.round(mg.cursor * w);
        ctx.fillStyle = mg.done ? (mg.win ? '#f0c419' : '#e04848') : '#f4f4f4';
        ctx.fillRect(cx - 1, y0 - 3, 3, 14);
    }
}
