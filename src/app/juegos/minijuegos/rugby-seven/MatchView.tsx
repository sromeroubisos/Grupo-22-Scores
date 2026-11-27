'use client';

import { useEffect, useRef, useState } from 'react';
import { DRILLS, SevenMatch, VIEW_H, VIEW_W, type DrillId, type Hud, type MatchConfig, type MatchEvent } from './engine';
import styles from './seven.module.css';
import { assignKey, CONTROL_LABELS, DEFAULT_BINDINGS, keyName, loadBindings, saveBindings, type Bindings, type ControlAction } from './controls';

/** Ancho del lienzo (alto fijo 270): entre 4:3 y ~2,4:1. Más ancho o más angosto, se centra. */
const MIN_VIEW_W = 360;
const MAX_VIEW_W = 640;

interface Props {
    fontFamily?: string; // fuente pixel para el nombre sobre el jugador
    cfg: MatchConfig;
    onFinish: (score: [number, number], log: MatchEvent[]) => void;
    onQuit: () => void;
    musicSrc?: string | null;
    /** Ejercicios en vez de partido: el tutorial (una sola vez) o la práctica. */
    drill?: 'tutorial' | 'practice';
}

const DRILL_TITLE: Record<DrillId, string> = {
    move: 'Moverte',
    juke: 'Amague',
    pass: 'Pase',
    hit: 'Chocar',
    tackle: 'Tacklear',
    ruck: 'Ruck',
    kick: 'Patear',
};

/**
 * El dedo que hace la mímica del gesto en el celular (cada animación está en seven.module.css).
 * Mover y pasar cambian según el esquema: en uno se arrastra y se toca, en el otro se mantiene y se desliza.
 */
function GestureHint({ id, scheme, layerRef }: { id: DrillId; scheme: TouchScheme; layerRef: React.RefObject<HTMLDivElement | null> }) {
    const anim: Partial<Record<DrillId, string>> = {
        move: scheme === 'tap' ? 'g-move-tap' : 'g-move-swipe',
        pass: scheme === 'tap' ? 'g-pass-tap' : 'g-pass-swipe',
        hit: 'g-hit',
        tackle: 'g-tackle',
        ruck: 'g-ruck',
        kick: 'g-kick',
    };
    const a = anim[id];
    if (!a) return null;
    return (
        <div className={styles.gestureLayer} aria-hidden="true" ref={layerRef}>
            <div key={a} className={`${styles.gestureHand} ${styles[a]}`}>
                <img src="/juegos/rugby-seven/dedo.png" alt="" width={64} height={67} loading="lazy" />
            </div>
        </div>
    );
}

/**
 * Pone el dedo donde hay que tocar, en la cancha: sobre tu jugador (o el ruck) y con el gesto hacia
 * el objetivo. Escribe variables CSS que usan las animaciones: --ax/--ay (dónde apoya) y --dx/--dy
 * (hacia dónde arrastra o desliza). Las cuentas van en el marco del lienzo (offsetLeft/Top), así
 * sirven también con la cancha girada.
 */
function placeGesture(layer: HTMLDivElement, cv: HTMLCanvasElement, m: SevenMatch, scheme: TouchScheme) {
    const pts = m.drillPoints();
    const id = m.drill?.id;
    if (!pts || !id) return;
    const s = cv.clientWidth / cv.width;
    const ox = cv.offsetLeft;
    const oy = cv.offsetTop;
    const P = (p: { x: number; y: number }) => [ox + p.x * s, oy + p.y * s] as const;
    const [mx, my] = P(pts.me);
    const to = pts.to ? P(pts.to) : null;
    const midY = oy + cv.clientHeight / 2;
    const lim = (v: number, a: number) => Math.max(-a, Math.min(a, v));
    // Que siempre se note el arrastre, aunque el objetivo esté casi a la misma altura.
    const atLeast = (v: number, min: number) => (Math.abs(v) < min ? (v < 0 ? -min : min) : v);
    let ax = mx;
    let ay = my;
    let dx = 0;
    let dy = 0;
    if (id === 'move') dy = atLeast(lim(to ? to[1] - my : 40, 60), 28);
    else if (id === 'pass') {
        const up = to ? to[1] < my : true;
        dy = up ? -50 : 50;
        // Esquema B: el pase sale tocando la mitad de la pantalla de ese lado: el dedo toca al compañero.
        if (scheme === 'tap' && to) {
            ax = to[0];
            ay = up ? Math.min(to[1], midY - 24) : Math.max(to[1], midY + 24);
        }
    } else if (id === 'hit') dx = 60;
    else if (id === 'tackle') {
        dy = to ? lim(to[1] - my, 50) : 0;
        dx = to && to[0] < mx ? -60 : 60;
    } else if (id === 'kick') ax = ox + cv.clientWidth * 0.08; // la patada se carga en la franja izquierda
    const st = layer.style;
    st.setProperty('--ax', `${Math.round(ax)}px`);
    st.setProperty('--ay', `${Math.round(ay)}px`);
    st.setProperty('--dx', `${Math.round(dx)}px`);
    st.setProperty('--dy', `${Math.round(dy)}px`);
}

/** La consigna de cada ejercicio, con las teclas que tiene puestas o con los gestos del esquema elegido. */
function drillText(id: DrillId, touch: boolean, scheme: TouchScheme, b: Bindings): string {
    const k = (a: ControlAction) => keyName(b[a]);
    if (!touch) {
        const t: Record<DrillId, string> = {
            move: `Corrés solo hacia adelante. Mantené ${k('up')} o ${k('down')} para ir hacia arriba o hacia abajo y pasá por los conos.`,
            juke: `Un toque corto de ${k('up')} o ${k('down')} es un amague: un cambio de paso rápido. Hacé tres.`,
            pass: `${k('passUp')} pasa para arriba y ${k('passDown')} para abajo; mantenida, es un salteo. Moverte sigue siendo con ${k('up')} y ${k('down')}. Pasala una vez para cada lado.`,
            hit: `Te sale un defensor. Apretá ${k('hit')} justo antes del choque para romper el tackle. Rompelo dos veces.`,
            tackle: `Ahora defendés. Seguilo con ${k('up')} y ${k('down')} y, cuando lo tengas cerca, apretá ${k('hit')} para tirarte al tackle. Tacklealo dos veces.`,
            ruck: `Te tacklearon y se arma el ruck. Tocá ${k('action')} rápido para quedarte con la pelota. Ganalo dos veces.`,
            kick: `Mantené ${k('kick')}: aparece la mira y con ${k('up')} y ${k('down')} la movés. Soltá para patear. Pateá dos veces.`,
        };
        return t[id];
    }
    const tap = scheme === 'tap';
    const t: Record<DrillId, string> = {
        move: tap
            ? 'Corrés solo hacia adelante. Cada deslizamiento corto hacia arriba o hacia abajo es un paso para ese lado: cuantos más hagas, más te corrés. Pasá por los conos.'
            : 'Corrés solo hacia adelante. Mantené el dedo arriba o abajo de la mitad de la cancha para ir para ese lado. Pasá por los conos.',
        juke: 'Un amague es un cambio de paso rápido. Hacé tres.',
        pass: tap
            ? 'Tocá la cancha: arriba de la mitad, pase para arriba; abajo, para abajo. Pasala una vez para cada lado.'
            : 'Deslizá rápido hacia arriba o hacia abajo para pasar para ese lado. Pasala una vez para cada lado.',
        hit: 'Te sale un defensor. Justo antes del choque, deslizá el dedo hacia adelante (a la derecha) para romper el tackle. Rompelo dos veces.',
        tackle: tap
            ? 'Ahora defendés. Seguilo con deslizamientos cortos arriba o abajo y, cuando lo tengas cerca, deslizá rápido hacia adelante para tirarte. Tacklealo dos veces.'
            : 'Ahora defendés. Seguilo manteniendo el dedo arriba o abajo y, cuando lo tengas cerca, deslizá rápido hacia adelante para tirarte. Tacklealo dos veces.',
        ruck: 'Te tacklearon y se arma el ruck. Tocá la pantalla rápido para quedarte con la pelota. Ganalo dos veces.',
        kick: 'Apoyá el dedo en la franja izquierda y dejalo apretado, sin tocar y soltar: aparece la mira. Sin levantarlo, movelo arriba o abajo para apuntar. Soltá para patear. Pateá dos veces.',
    };
    return t[id];
}

const MUTE_KEY = 'g22-rugby-seven-mute';
/** Cuánto hay que mantener W/S para que el pase sea un salteo. */
const SKIP_HOLD_MS = 220;

/* Gestos táctiles (ver onPointerDown). Medidas en píxeles de pantalla. */
const KICK_ZONE = 0.22; // franja izquierda de la cancha donde mantener = patear
const KICK_HOLD_MS = 170; // hay que dejar el dedo esto para que empiece a cargar la patada
const SWIPE_PX = 34; // desde acá un movimiento rápido es un deslizamiento
const SWIPE_MS = 260; // y tiene que pasar en este tiempo
const HIT_PX = 40; // con la pelota: deslizar así hacia adelante es chocar (a cualquier velocidad)
const SKIP_SWIPE_PX = 170; // esquema A: un deslizamiento vertical así de largo es un salteo
const TAP_PX = 14;
const TAP_MS = 240;
const DOUBLE_TAP_MS = 320;
const TOUCH_HELP_KEY = 'g22-rugby-seven-touch-help';
const PORTRAIT_KEY = 'g22-rugby-seven-portrait';
const SCHEME_KEY = 'g22-rugby-seven-touch-scheme';
const STEP_PX = 18; // esquema B: desde acá un deslizamiento arriba o abajo es un paso de costado
const STEP_MS = 340; // cuánto dura cada paso
const STEP_SPEED = 1.25; // el paso va a 1,25 veces la velocidad de costado; el motor resta adelante lo que suma de costado
const STEP_MAX_MS = 1000; // los pasos acumulados no pasan de esto
const LONG_PASS_MS = 420; // esquema B: tocar y dejar quieto este tiempo es un salteo

/** Cómo se juega con el dedo. "tap" (B): deslizar mueve, tocar pasa. "swipe" (A): mantener mueve, deslizar pasa. */
export type TouchScheme = 'tap' | 'swipe';

interface Finger {
    kind: 'move' | 'kick' | 'swipe' | 'pending' | 'done';
    x0: number;
    y0: number;
    t0: number;
    dir: 'up' | 'down' | 'none';
    kicking: boolean;
    ry: number; // dónde tocó (0 arriba, 1 abajo): el esquema B pasa para ese lado
}

const TOUCH_GESTURES: Record<TouchScheme, [string, string][]> = {
    tap: [
        ['Moverte', 'Corrés solo hacia adelante. Cada deslizamiento corto hacia arriba o hacia abajo es un paso para ese lado: cuantos más, más te corrés.'],
        ['Pase', 'Tocá del lado derecho: arriba de la mitad, pase para arriba; abajo, para abajo.'],
        ['Salteo', 'Tocá y dejá el dedo quieto un momento.'],
        ['Chocar', 'Con la pelota, deslizá el dedo hacia adelante (a la derecha).'],
        ['Tacklear', 'Sin la pelota, deslizá rápido hacia adelante o hacia atrás.'],
        ['Patear', 'Mantené en la franja izquierda: aparece la mira. Sin soltar, deslizá el dedo hacia arriba o abajo para moverla; soltá para patear.'],
        ['Drop', 'Dos toques seguidos en la franja izquierda.'],
        ['Scrum, ruck, line y conversión', 'Tocá la pantalla.'],
        ['Defendiendo', 'Un toque cambia de jugador.'],
    ],
    swipe: [
        ['Moverte', 'Mantené el dedo arriba o abajo de la mitad de la cancha.'],
        ['Pase', 'Deslizá rápido hacia arriba o hacia abajo. Un deslizamiento muy largo es un salteo.'],
        ['Chocar', 'Con la pelota, deslizá el dedo hacia adelante (a la derecha).'],
        ['Tacklear', 'Sin la pelota, deslizá rápido hacia adelante o hacia atrás.'],
        ['Patear', 'Mantené en la franja izquierda: aparece la mira. Sin soltar, deslizá el dedo hacia arriba o abajo para moverla; soltá para patear.'],
        ['Drop', 'Dos toques seguidos.'],
        ['Scrum, ruck, line y conversión', 'Tocá la pantalla.'],
        ['Defendiendo', 'Un toque cambia de jugador.'],
    ],
};

/** Elegir el esquema de controles táctiles. */
function SchemePick({ scheme, onChange }: { scheme: TouchScheme; onChange: (s: TouchScheme) => void }) {
    return (
        <div className={styles.portraitPick} role="radiogroup" aria-label="Controles con el dedo">
            <span>Controles:</span>
            <button type="button" role="radio" aria-checked={scheme === 'tap'} className={scheme === 'tap' ? styles.keyBtnActive : styles.keyBtn} onClick={() => onChange('tap')}>
                Deslizar mueve, tocar pasa
            </button>
            <button type="button" role="radio" aria-checked={scheme === 'swipe'} className={scheme === 'swipe' ? styles.keyBtnActive : styles.keyBtn} onClick={() => onChange('swipe')}>
                Mantener mueve, deslizar pasa
            </button>
        </div>
    );
}

/** La lista de gestos del celular (en la ayuda inicial y en la pausa). */
function TouchLegend({ scheme }: { scheme: TouchScheme }) {
    return (
        <ul className={styles.controlsList}>
            {TOUCH_GESTURES[scheme].map(([label, hint]) => (
                <li key={label}>
                    <span>
                        <strong>{label}</strong>
                        <small>{hint}</small>
                    </span>
                </li>
            ))}
        </ul>
    );
}

/** Las ayudas del motor hablan del teclado; en el celular, de la pantalla. */
const touchHint = (h: string) =>
    h
        .replace(/^Tocá ESPACIO/, 'Tocá la pantalla')
        .replace(/^ESPACIO o Q cuando/, 'Tocá la pantalla cuando')
        .replace(/^ESPACIO (cuando|en)/, 'Tocá la pantalla $1');

/** Celular o tablet: sin mouse y con dedo. */
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/** Tiempo de juego transcurrido, m:ss. */
function clockOf(t: number) {
    const s = Math.floor(t);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Cada cuánto aparece una línea del relato simulado. */
const SIM_STEP_MS = 650;

interface SimRun {
    events: MatchEvent[];
    from: [number, number];
    startT: number;
    final: [number, number];
}

function hudKey(h: Hud) {
    const d = h.drill;
    return `${h.sh}|${h.sa}|${h.clock}|${h.period}|${h.banner}|${h.bannerSub}|${h.hint}|${h.attacking}|${h.phase}|${h.carrier}|${d ? `${d.id}|${d.count}|${d.done}|${d.note}` : ''}`;
}

/**
 * El partido: canvas en píxeles duros + marcador y avisos en el DOM.
 * Teclado: ↑/↓ moverse (y amagar), W/S pase, D chocar o tacklear,
 * Espacio pase al mejor ubicado / cambiar jugador / scrum / line / patada.
 */
export default function MatchView({ cfg, onFinish, onQuit, musicSrc = null, fontFamily, drill }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const matchRef = useRef<SevenMatch | null>(null);
    const keys = useRef(new Set<string>());
    const touchMove = useRef({ up: false, down: false });
    /** Esquema B: los pasos de costado que quedan por dar (dirección y hasta cuándo, en performance.now). */
    const touchStep = useRef<{ dir: 'up' | 'down' | null; until: number }>({ dir: null, until: 0 });
    const pausedRef = useRef(false);
    const passDown = useRef<{ w: number | null; s: number | null }>({ w: null, s: null });
    const finishRef = useRef(onFinish);
    const [hud, setHud] = useState<Hud | null>(null);
    const [paused, setPaused] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [hasMusic, setHasMusic] = useState(false);
    const [muted, setMuted] = useState(false);
    /** Mientras se lee el relato simulado, el final no avanza solo. */
    const holdFinish = useRef(false);
    const [sim, setSim] = useState<SimRun | null>(null);
    const [simShown, setSimShown] = useState(0);
    const bindRef = useRef<Bindings>(DEFAULT_BINDINGS);
    const [bindings, setBindings] = useState<Bindings>(DEFAULT_BINDINGS);
    const [showControls, setShowControls] = useState(false);
    /** Acción esperando que aprieten la tecla nueva. */
    const rebindRef = useRef<ControlAction | null>(null);
    const [rebinding, setRebinding] = useState<ControlAction | null>(null);
    const screenRef = useRef<HTMLDivElement>(null);
    /** La capa del dedo del tutorial: se mueve sola cada cuadro, sin pasar por React. */
    const gestureRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState({ w: VIEW_W, cssW: 0, cssH: 0 });

    useEffect(() => {
        const b = loadBindings();
        bindRef.current = b;
        setBindings(b);
    }, []);

    const updateBindings = (b: Bindings) => {
        bindRef.current = b;
        setBindings(b);
        saveBindings(b);
    };

    const startRebind = (a: ControlAction | null) => {
        rebindRef.current = a;
        setRebinding(a);
    };

    // La cancha ocupa toda la pantalla: el ancho del lienzo sigue la proporción del lugar disponible.
    useEffect(() => {
        const el = screenRef.current;
        if (!el) return;
        const fit = () => {
            const W = el.clientWidth;
            const H = el.clientHeight;
            if (!W || !H) return;
            const w = Math.round(Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, (VIEW_H * W) / H)));
            const scale = Math.min(W / w, H / VIEW_H);
            setView({ w, cssW: Math.floor(w * scale), cssH: Math.floor(VIEW_H * scale) });
            if (matchRef.current) matchRef.current.viewW = w;
        };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        finishRef.current = onFinish;
    }, [onFinish]);

    // El relato aparece de a una línea, como si se fuera jugando.
    useEffect(() => {
        if (!sim || simShown >= sim.events.length) return;
        const id = window.setTimeout(() => setSimShown((n) => n + 1), SIM_STEP_MS);
        return () => window.clearTimeout(id);
    }, [sim, simShown]);

    const startSim = () => {
        const m = matchRef.current;
        if (!m) return;
        holdFinish.current = true;
        const from: [number, number] = [m.score[0], m.score[1]];
        const startT = m.elapsed();
        const events = m.simulateRest();
        setSim({ events, from, startT, final: [m.score[0], m.score[1]] });
        setSimShown(0);
        pausedRef.current = false;
        setPaused(false);
    };

    useEffect(() => {
        try {
            setMuted(localStorage.getItem(MUTE_KEY) === '1');
        } catch {
            // Sin localStorage: la música arranca prendida.
        }
    }, []);

    // Música de fondo: suena mientras se juega, se corta en la pausa y al salir.
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !hasMusic) return;
        audio.volume = 0.45;
        if (paused || muted || hud?.phase === 'end') audio.pause();
        else audio.play().catch(() => {});
    }, [hasMusic, paused, muted, hud?.phase]);

    const toggleMute = () => {
        setMuted((m) => {
            try {
                localStorage.setItem(MUTE_KEY, m ? '0' : '1');
            } catch {
                // Sin localStorage: vale solo para este partido.
            }
            return !m;
        });
    };

    useEffect(() => {
        const match = new SevenMatch(cfg);
        if (fontFamily) match.fontFamily = fontFamily;
        if (screenRef.current) {
            const el = screenRef.current;
            match.viewW = Math.round(Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, (VIEW_H * el.clientWidth) / Math.max(1, el.clientHeight))));
        }
        matchRef.current = match;
        let finishTimer = 0;
        match.onEnd = (score) => {
            // Si se simuló, el que avanza es el botón del relato.
            if (holdFinish.current) return;
            finishTimer = window.setTimeout(() => finishRef.current(score, match.log), 2600);
        };
        const ctx = canvasRef.current?.getContext('2d');
        let raf = 0;
        let last = performance.now();
        let lastKey = '';
        const loop = (now: number) => {
            const dt = (now - last) / 1000;
            last = now;
            if (!pausedRef.current) {
                const attacking = match.hud().attacking;
                const k = keys.current;
                const b = bindRef.current;
                // Moverse. Defendiendo, las teclas de pase también mueven (no hay pase que dar).
                const st = touchStep.current;
                const stepping = st.dir !== null && now < st.until;
                const up = k.has(b.up) || (!attacking && k.has(b.passUp)) || touchMove.current.up || (stepping && st.dir === 'up');
                const down = k.has(b.down) || (!attacking && k.has(b.passDown)) || touchMove.current.down || (stepping && st.dir === 'down');
                // Solo el paso del dedo, sin tecla ni dedo apoyado: va al doble de rápido, como el juke de Retro Bowl.
                const keyed = k.has(b.up) || k.has(b.down) || k.has(b.passUp) || k.has(b.passDown) || touchMove.current.up || touchMove.current.down;
                match.setMove(up, down, stepping && !keyed ? STEP_SPEED : 1);
                match.update(dt);
            }
            if (ctx) match.render(ctx);
            if (gestureRef.current && canvasRef.current) placeGesture(gestureRef.current, canvasRef.current, match, schemeRef.current);
            const h = match.hud();
            const key = hudKey(h);
            if (key !== lastKey) {
                lastKey = key;
                setHud(h);
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(raf);
            window.clearTimeout(finishTimer);
            matchRef.current = null;
        };
    }, [cfg, fontFamily]);

    const togglePause = (value?: boolean) => {
        const next = value ?? !pausedRef.current;
        pausedRef.current = next;
        setPaused(next);
    };

    useEffect(() => {
        const onDown = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            // Reasignando un control: la próxima tecla es la nueva (Esc cancela).
            if (rebindRef.current) {
                e.preventDefault();
                const a = rebindRef.current;
                startRebind(null);
                if (k !== 'escape') updateBindings(assignKey(bindRef.current, a, k));
                return;
            }
            const m = matchRef.current;
            if (!m) return;
            const b = bindRef.current;
            const action = (Object.keys(b) as ControlAction[]).find((a) => b[a] === k);
            if (!action && k !== 'escape') return;
            e.preventDefault();
            if (k === 'escape' || action === 'pause') {
                if (!e.repeat && !holdFinish.current) togglePause();
                return;
            }
            if (pausedRef.current) return;
            const fresh = !keys.current.has(k);
            keys.current.add(k);
            if (!fresh) return;
            const attacking = m.hud().attacking;
            if (action === 'up') m.juke(-1);
            else if (action === 'down') m.juke(1);
            else if (action === 'hit') m.hit();
            else if (action === 'kick' && attacking) m.startKick();
            else if (action === 'drop') m.dropGoal();
            else if (action === 'action') m.action();
            // Pase: sale al soltar. Toque = pase corto; mantenido = salteo.
            else if (action === 'passUp' && attacking) passDown.current.w = performance.now();
            else if (action === 'passDown' && attacking) passDown.current.s = performance.now();
        };
        const onUp = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            keys.current.delete(k);
            const m = matchRef.current;
            if (!m || pausedRef.current) return;
            const b = bindRef.current;
            if (k === b.kick) m.releaseKick();
            if (k === b.passUp || k === b.passDown) {
                const slot = k === b.passUp ? 'w' : 's';
                const t0 = passDown.current[slot];
                passDown.current[slot] = null;
                if (t0 !== null) m.pass(slot === 'w' ? -1 : 1, performance.now() - t0 >= SKIP_HOLD_MS);
            }
        };
        const onBlur = () => keys.current.clear();
        const onVis = () => {
            if (document.hidden) togglePause(true);
        };
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVis);
        return () => {
            window.removeEventListener('keydown', onDown);
            window.removeEventListener('keyup', onUp);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    /*
     * ---- Táctil sobre la cancha (celular y tablet) ----
     *   · Mantener arriba o abajo de la mitad de la pantalla: el jugador va para ese lado.
     *   · Mantener en la franja izquierda: carga la patada; al soltar, patea.
     *   · Dos toques: drop.
     *   · Deslizar rápido hacia arriba o hacia abajo: pase para ese lado (largo = salteo).
     *   · Deslizar rápido hacia adelante o atrás: chocar / tacklear.
     *   · En scrum, ruck, line y conversiones: tocar la pantalla.
     * Cada dedo es un gesto: se puede mover con uno y pasar con otro.
     */
    const fingers = useRef(new Map<number, Finger>());
    const [scheme, setScheme] = useState<TouchScheme>('tap');
    const schemeRef = useRef<TouchScheme>('tap');
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SCHEME_KEY);
            if (saved === 'tap' || saved === 'swipe') {
                setScheme(saved);
                schemeRef.current = saved;
            }
        } catch {
            // Sin localStorage: arranca con el B.
        }
    }, []);
    const chooseScheme = (sc: TouchScheme) => {
        setScheme(sc);
        schemeRef.current = sc;
        try {
            localStorage.setItem(SCHEME_KEY, sc);
        } catch {
            // Sin localStorage: vale para este partido.
        }
    };
    const lastTap = useRef(0);
    const syncTouchMove = () => {
        let up = false;
        let down = false;
        for (const f of fingers.current.values()) {
            if (f.kind !== 'move' || f.dir === 'none') continue;
            if (f.dir === 'up') up = true;
            else down = true;
        }
        touchMove.current = { up, down };
    };
    /** Un paso de costado (esquema B). Para el mismo lado se suma al que falta; para el otro, lo reemplaza. */
    const addStep = (dir: 'up' | 'down') => {
        const now = performance.now();
        const st = touchStep.current;
        const left = st.dir === dir ? Math.max(0, st.until - now) : 0;
        touchStep.current = { dir, until: now + Math.min(STEP_MAX_MS, left + STEP_MS) };
    };
    // Con la cancha girada 90° (celular parado, modo "girar la cancha"), lo que en la pantalla es
    // abajo, en la cancha es la derecha: los gestos se rotan con ella.
    const rotatedRef = useRef(false);
    const pt = (e: React.PointerEvent) => (rotatedRef.current ? { x: e.clientY, y: -e.clientX } : { x: e.clientX, y: e.clientY });
    const zoneOf = (e: React.PointerEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (rotatedRef.current) return { rx: (e.clientY - r.top) / r.height, ry: 1 - (e.clientX - r.left) / r.width };
        return { rx: (e.clientX - r.left) / r.width, ry: (e.clientY - r.top) / r.height };
    };
    const onPointerDown = (e: React.PointerEvent) => {
        const m = matchRef.current;
        if (!m || pausedRef.current) return;
        e.preventDefault();
        try {
            // Que el dedo siga siendo de la cancha aunque se vaya del borde.
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
            // Algunos navegadores no lo permiten para ese puntero: el gesto sigue igual.
        }
        const h = m.hud();
        // Scrum, ruck, line, conversión y drop: cada toque cuenta.
        if (h.phase === 'scrum' || h.phase === 'ruck' || h.phase === 'lineout' || h.phase === 'conv' || h.phase === 'drop') {
            m.action();
            fingers.current.set(e.pointerId, { kind: 'done', x0: pt(e).x, y0: pt(e).y, t0: performance.now(), dir: 'none', kicking: false, ry: 0.5 });
            return;
        }
        const { rx, ry } = zoneOf(e);
        const tapScheme = schemeRef.current === 'tap';
        // En la franja izquierda se patea (y en el B ahí va el drop). Esquema A: el dedo apoyado ya mueve.
        // Esquema B: hasta saber si es toque (pase), dedo quieto (salteo) o arrastre (moverse), queda pendiente.
        const kind: Finger['kind'] = rx < KICK_ZONE && h.attacking ? 'kick' : tapScheme ? 'pending' : 'move';
        fingers.current.set(e.pointerId, { kind, x0: pt(e).x, y0: pt(e).y, t0: performance.now(), dir: tapScheme ? 'none' : ry < 0.5 ? 'up' : 'down', kicking: false, ry });
        if (kind === 'pending') {
            window.setTimeout(() => {
                const f = fingers.current.get(e.pointerId);
                const mm = matchRef.current;
                // Dedo quieto en el mismo lugar: salteo para ese lado.
                if (f && f.kind === 'pending' && mm && !pausedRef.current && mm.hud().attacking) {
                    f.kind = 'done';
                    mm.pass(f.ry < 0.5 ? -1 : 1, true);
                }
            }, LONG_PASS_MS);
        }
        if (kind === 'kick') {
            // La patada se empieza a cargar recién si el dedo se queda: un toque rápido puede ser el primero del drop.
            window.setTimeout(() => {
                const f = fingers.current.get(e.pointerId);
                if (f && f.kind === 'kick' && !pausedRef.current) {
                    f.kicking = true;
                    matchRef.current?.startKick();
                }
            }, KICK_HOLD_MS);
        }
        syncTouchMove();
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const f = fingers.current.get(e.pointerId);
        if (!f || f.kind === 'done' || f.kind === 'swipe') return;
        // Cargando la patada: el dedo mueve la zona (la altura del dedo es el costado adonde va).
        if (f.kicking) {
            matchRef.current?.setAimFromScreen(zoneOf(e).ry);
            return;
        }
        const dx = pt(e).x - f.x0;
        const dy = pt(e).y - f.y0;
        // Con la pelota, deslizar hacia adelante (aunque sea despacio, y también desde la franja de patear) es chocar.
        const mm = matchRef.current;
        if (mm && !f.kicking && dx > HIT_PX && Math.abs(dx) > Math.abs(dy) * 1.3 && mm.hud().attacking) {
            f.kind = 'done';
            syncTouchMove();
            mm.hit();
            return;
        }
        if (schemeRef.current === 'tap' && (f.kind === 'pending' || f.kind === 'move')) {
            // Esquema B. Un golpe rápido de costado: chocar o tacklear.
            if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - f.t0 < SWIPE_MS) {
                f.kind = 'done';
                syncTouchMove();
                matchRef.current?.hit();
                return;
            }
            // Como en Retro Bowl: cada deslizamiento corto arriba o abajo es un paso de costado.
            // Un dedo da un paso; para correrse más, más deslizamientos (se acumulan).
            if (Math.abs(dy) > STEP_PX && Math.abs(dy) > Math.abs(dx)) {
                f.kind = 'done';
                addStep(dy < 0 ? 'up' : 'down');
            }
            return;
        }
        // Movimiento rápido y largo: es un deslizamiento, ese dedo deja de mover al jugador.
        if (Math.hypot(dx, dy) > SWIPE_PX && performance.now() - f.t0 < SWIPE_MS && !f.kicking) {
            f.kind = 'swipe';
            syncTouchMove();
            return;
        }
        if (f.kind === 'move') {
            const { ry } = zoneOf(e);
            const dir = ry < 0.5 ? 'up' : 'down';
            if (dir !== f.dir) {
                f.dir = dir;
                syncTouchMove();
            }
        }
    };
    const onPointerEnd = (e: React.PointerEvent) => {
        const f = fingers.current.get(e.pointerId);
        fingers.current.delete(e.pointerId);
        syncTouchMove();
        const m = matchRef.current;
        if (!f || !m || pausedRef.current || f.kind === 'done') return;
        if (f.kicking) {
            m.releaseKick();
            return;
        }
        if (e.type === 'pointercancel') return;
        const dx = pt(e).x - f.x0;
        const dy = pt(e).y - f.y0;
        const dt = performance.now() - f.t0;
        const dist = Math.hypot(dx, dy);
        if (schemeRef.current === 'tap') {
            // Esquema B: tocar es pase (o cambiar de jugador defendiendo); el drop, dos toques a la izquierda.
            if (f.kind === 'kick' && dist < TAP_PX && dt < TAP_MS) {
                const now = performance.now();
                if (now - lastTap.current < DOUBLE_TAP_MS) {
                    lastTap.current = 0;
                    m.dropGoal();
                } else lastTap.current = now;
                return;
            }
            if (f.kind === 'pending') {
                if (m.hud().attacking) m.pass(f.ry < 0.5 ? -1 : 1, false);
                else m.action();
            }
            return;
        }
        if (dist > SWIPE_PX && dt < SWIPE_MS + 200) {
            if (Math.abs(dy) > Math.abs(dx)) {
                // Arriba o abajo: pase para ese lado; un deslizamiento largo es salteo. Defendiendo, amague.
                if (m.hud().attacking) m.pass(dy < 0 ? -1 : 1, Math.abs(dy) > SKIP_SWIPE_PX);
                else m.juke(dy < 0 ? -1 : 1);
            } else m.hit();
            return;
        }
        if (dist < TAP_PX && dt < TAP_MS) {
            const now = performance.now();
            if (now - lastTap.current < DOUBLE_TAP_MS) {
                lastTap.current = 0;
                if (m.hud().attacking) m.dropGoal();
                return;
            }
            lastTap.current = now;
            // Defendiendo, un toque cambia de jugador.
            if (!m.hud().attacking) m.action();
        }
    };

    // En celular: la ayuda de los gestos se muestra la primera vez (con el partido en pausa).
    const [touch, setTouch] = useState(false);
    const [touchHelp, setTouchHelp] = useState(false);
    useEffect(() => {
        if (!isTouchDevice()) return;
        setTouch(true);
        // En los ejercicios cada gesto se enseña en su paso: la lista entera no hace falta.
        if (drill) {
            if (drill === 'tutorial') {
                try {
                    localStorage.setItem(TOUCH_HELP_KEY, '1');
                } catch {
                    // Sin localStorage: el primer partido la vuelve a mostrar.
                }
            }
            return;
        }
        let seen = false;
        try {
            seen = localStorage.getItem(TOUCH_HELP_KEY) === '1';
        } catch {
            // Sin localStorage: se muestra igual.
        }
        if (!seen) {
            setTouchHelp(true);
            pausedRef.current = true;
        }
    }, []);
    // Celular parado: "force" pide girarlo (y pausa); "fit" gira la cancha para que ocupe el alto.
    const [portrait, setPortrait] = useState(false);
    const [portraitMode, setPortraitMode] = useState<'force' | 'fit'>('force');
    useEffect(() => {
        if (!isTouchDevice()) return;
        try {
            const saved = localStorage.getItem(PORTRAIT_KEY);
            if (saved === 'fit' || saved === 'force') setPortraitMode(saved);
        } catch {
            // Sin localStorage: arranca pidiendo girar.
        }
        const mq = window.matchMedia('(orientation: portrait)');
        const on = () => setPortrait(mq.matches);
        on();
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    const choosePortraitMode = (m: 'force' | 'fit') => {
        setPortraitMode(m);
        try {
            localStorage.setItem(PORTRAIT_KEY, m);
        } catch {
            // Sin localStorage: vale para este partido.
        }
    };
    const rotated = touch && portrait && portraitMode === 'fit';
    const blockPortrait = touch && portrait && portraitMode === 'force';
    useEffect(() => {
        rotatedRef.current = rotated;
    }, [rotated]);
    // Pausado si lo pausó el usuario, si está la ayuda o si hay que girar el celular.
    useEffect(() => {
        pausedRef.current = paused || touchHelp || blockPortrait;
    }, [paused, touchHelp, blockPortrait]);

    const closeTouchHelp = () => {
        setTouchHelp(false);
        pausedRef.current = paused;
        try {
            localStorage.setItem(TOUCH_HELP_KEY, '1');
        } catch {
            // Sin localStorage: la próxima vez se vuelve a mostrar.
        }
    };

    /*
     * ---- Tutorial y práctica ----
     * El tutorial pasa por todos los ejercicios en orden y, al terminar, ofrece seguir practicando.
     * La práctica deja elegir uno y lo repite. En el celular no está el amague: no tiene gesto propio.
     */
    const [drillKind, setDrillKind] = useState<'tutorial' | 'practice' | null>(drill ?? null);
    const [tutorialDone, setTutorialDone] = useState(false);
    const drillList = touch ? DRILLS.filter((d) => d !== 'juke') : DRILLS;
    const hd = hud?.drill ?? null;
    // El amague no va en el celular: si arrancó ahí, salta al siguiente.
    useEffect(() => {
        if (touch && hd?.id === 'juke') matchRef.current?.startDrill('pass');
    }, [touch, hd?.id]);
    useEffect(() => {
        if (!hd?.done || !drillKind) return;
        const id = window.setTimeout(() => {
            const m = matchRef.current;
            if (!m) return;
            const next = drillList[drillList.indexOf(hd.id) + 1];
            // Práctica: pasa solo al siguiente y, después del último, vuelve a empezar.
            if (drillKind === 'practice') {
                m.startDrill(next ?? drillList[0]);
                return;
            }
            if (next) m.startDrill(next);
            else {
                setTutorialDone(true);
                pausedRef.current = true;
            }
        }, 2200); // lo que dura el cartel de "Bien hecho"
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hd?.done, hd?.id, drillKind]);
    /*
     * Cartel de cada ejercicio: al arrancar uno (o con el "?"), el juego se frena, aparece en el medio
     * qué hay que hacer, el dedo lo muestra sobre la cancha y una cuenta 3, 2, 1 lo saca.
     */
    const INTRO_FROM = 3;
    const [intro, setIntro] = useState<{ id: DrillId; left: number } | null>(null);
    const lastDrillId = useRef<DrillId | null>(null);
    useEffect(() => {
        if (!drillKind || !hd || tutorialDone) return;
        if (hd.id === lastDrillId.current) return;
        if (touch && hd.id === 'juke') return; // en el celular salta solo al pase
        lastDrillId.current = hd.id;
        setIntro({ id: hd.id, left: INTRO_FROM });
    }, [drillKind, hd?.id, tutorialDone, touch]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        // La cuenta no corre mientras el partido está en pausa o hay que girar el celular.
        if (!intro || paused || blockPortrait) return;
        const id = window.setTimeout(() => setIntro((v) => (v ? (v.left > 1 ? { ...v, left: v.left - 1 } : null) : null)), intro.left === INTRO_FROM ? 2200 : 1000);
        return () => window.clearTimeout(id);
    }, [intro, paused, blockPortrait]);
    const showIntro = () => {
        if (hd) setIntro({ id: hd.id, left: INTRO_FROM });
    };
    // Frenado mientras está el cartel del ejercicio o el de "terminaste el tutorial".
    useEffect(() => {
        pausedRef.current = paused || touchHelp || blockPortrait || tutorialDone || !!intro;
    }, [tutorialDone, intro, paused, touchHelp, blockPortrait]);
    const goPractice = (id: DrillId = drillList[0]) => {
        setTutorialDone(false);
        setDrillKind('practice');
        pausedRef.current = paused;
        matchRef.current?.startDrill(id);
    };

    // Pantalla fija mientras se juega: sin zoom con dos dedos (Safari) ni rebote al deslizar.
    useEffect(() => {
        const stop = (e: Event) => e.preventDefault();
        const html = document.documentElement;
        const prev = html.style.overscrollBehavior;
        html.style.overscrollBehavior = 'none';
        document.addEventListener('gesturestart', stop);
        document.addEventListener('gesturechange', stop);
        return () => {
            html.style.overscrollBehavior = prev;
            document.removeEventListener('gesturestart', stop);
            document.removeEventListener('gesturechange', stop);
        };
    }, []);

    return (
        <div className={rotated ? `${styles.matchWrap} ${styles.rotated}` : styles.matchWrap}>
            <div className={styles.screen} ref={screenRef}>
                <canvas
                    ref={canvasRef}
                    width={view.w}
                    height={VIEW_H}
                    className={styles.canvas}
                    style={view.cssW ? { width: view.cssW, height: view.cssH } : undefined}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerEnd}
                    onPointerCancel={onPointerEnd}
                    onContextMenu={(e) => e.preventDefault()}
                    role="img"
                    aria-label={`Partido ${cfg.home.name} contra ${cfg.away.name}`}
                />
                {/* El dedo se queda mostrando el gesto, sobre la cancha, hasta que completás el ejercicio. */}
                {drillKind && hd && touch && !hd.done && !tutorialDone && <GestureHint id={hd.id} scheme={scheme} layerRef={gestureRef} />}
                {/* Ejercicio completo: la felicitación en el medio y qué viene, mientras se arma el siguiente. */}
                {drillKind && hd?.done && !tutorialDone && !intro && (
                    <div className={`${styles.drillIntro} ${styles.drillDone}`} role="status" aria-live="polite">
                        <strong>Bien hecho</strong>
                        <p className={styles.drillText}>
                            {(() => {
                                const next = drillList[drillList.indexOf(hd.id) + 1];
                                if (drillKind === 'tutorial' && !next) return 'Completaste el último ejercicio.';
                                return `Ahora vamos con el siguiente: ${DRILL_TITLE[next ?? drillList[0]]}.`;
                            })()}
                        </p>
                    </div>
                )}
                {drillKind && intro && !tutorialDone && (
                    <div className={styles.drillIntro} role="dialog" aria-label={DRILL_TITLE[intro.id]} onClick={() => setIntro(null)}>
                        <span className={styles.drillStep}>{drillKind === 'tutorial' ? `Tutorial · ${drillList.indexOf(intro.id) + 1} de ${drillList.length}` : 'Práctica'}</span>
                        <strong>{DRILL_TITLE[intro.id]}</strong>
                        <p className={styles.drillText}>{drillText(intro.id, touch, scheme, bindings)}</p>
                        <span className={styles.drillCount} key={intro.left} aria-live="polite">
                            {intro.left}
                        </span>
                        <button type="button" className={styles.drillSkip} onClick={() => setIntro(null)}>
                            Ya entendí
                        </button>
                    </div>
                )}
                {drillKind && hd && (
                    <div className={styles.drillPanel}>
                        <span className={styles.drillStep}>{drillKind === 'tutorial' ? `Tutorial · ${drillList.indexOf(hd.id) + 1} de ${drillList.length}` : 'Práctica'}</span>
                        <strong>{DRILL_TITLE[hd.id]}</strong>
                        <div className={styles.drillDots} role="img" aria-label={`${hd.count} de ${hd.goal}`}>
                            {Array.from({ length: hd.goal }, (_, i) => (
                                <i key={i} data-on={i < hd.count ? '1' : '0'} />
                            ))}
                        </div>
                        {!hd.done && hd.note && <p className={styles.drillNote}>{hd.note}</p>}
                        {drillKind === 'practice' && (
                            <div className={styles.drillPick} role="radiogroup" aria-label="Ejercicio">
                                {drillList.map((id) => (
                                    <button key={id} type="button" role="radio" aria-checked={hd.id === id} className={hd.id === id ? styles.keyBtnActive : styles.keyBtn} onClick={() => matchRef.current?.startDrill(id)}>
                                        {DRILL_TITLE[id]}
                                    </button>
                                ))}
                            </div>
                        )}
                        {drillKind === 'tutorial' && !tutorialDone && (
                            <button type="button" className={styles.drillSkip} onClick={() => setTutorialDone(true)}>
                                Saltar el tutorial
                            </button>
                        )}
                    </div>
                )}
                {tutorialDone && (
                    <div className={styles.pauseLayer} role="dialog" aria-label="Tutorial terminado">
                        <strong>Bien hecho</strong>
                        <p className={styles.drillText}>Completaste el tutorial. Ya sabés lo básico; cuando quieras repasar algo, está la Práctica en el menú.</p>
                        <button type="button" className={styles.btnPrimary} onClick={onQuit}>
                            Ir a jugar
                        </button>
                        <button type="button" className={styles.btnGhost} onClick={() => goPractice()}>
                            Seguir practicando
                        </button>
                    </div>
                )}
                {/* Marcador y reloj arriba a la izquierda, sobre la tribuna. */}
                {!drillKind && (
                <div className={styles.hudLeft}>
                    <span className={styles.sbTeam}>
                        <i style={{ background: hud?.homeColor }} aria-hidden="true" />
                        {hud?.home}
                    </span>
                    <span className={styles.sbScore} aria-live="polite">
                        {hud?.sh ?? 0} - {hud?.sa ?? 0}
                    </span>
                    <span className={styles.sbTeam}>
                        {hud?.away}
                        <i style={{ background: hud?.awayColor }} aria-hidden="true" />
                    </span>
                    <span className={styles.sbClock}>
                        {hud?.clock} <small>{hud?.period}</small>
                    </span>
                    {hud?.carrier && <small className={styles.sbCarrier}>{hud.carrier}</small>}
                </div>
                )}
                {/* Pausa, música y controles arriba a la derecha. */}
                <div className={styles.hudRight}>
                    <span className={styles.sbHelp}>{keyName(bindings.pause)} · pausa y controles</span>
                    {drillKind && hd && !tutorialDone && (
                        <button type="button" className={styles.pauseBtn} onClick={showIntro} aria-label="Ver de nuevo cómo se hace">
                            ?
                        </button>
                    )}
                    {hasMusic && (
                        <button type="button" className={styles.pauseBtn} onClick={toggleMute} aria-label={muted ? 'Prender la música' : 'Silenciar la música'} aria-pressed={!muted}>
                            {muted ? '×♪' : '♪'}
                        </button>
                    )}
                    {/* La pausa, en la esquina derecha: chica, pero con su nombre y en dorado para que se encuentre. */}
                    <button type="button" className={`${styles.pauseBtn} ${styles.pauseMain}`} onClick={() => togglePause()} aria-label={paused ? 'Seguir' : 'Pausa'}>
                        {paused ? '▶ Seguir' : 'II Pausa'}
                    </button>
                </div>
                {musicSrc && <audio ref={audioRef} src={musicSrc} loop preload="auto" onCanPlay={() => setHasMusic(true)} onError={() => setHasMusic(false)} />}
                {hud?.banner && !sim && (
                    <div className={styles.banner} key={hud.banner + (hud.bannerSub ?? '')}>
                        <strong>{hud.banner}</strong>
                        {hud.bannerSub && <span>{hud.bannerSub}</span>}
                    </div>
                )}
                {hud?.hint && <div className={styles.hint}>{touch ? touchHint(hud.hint) : hud.hint}</div>}
                {blockPortrait && !touchHelp && (
                    <div className={styles.portraitBlock} role="dialog" aria-label="Girá el celular">
                        <span className={styles.portraitIcon} aria-hidden="true">⟳</span>
                        <strong>Girá el celular</strong>
                        <small>La cancha se juega acostada. El partido queda en pausa hasta que lo gires.</small>
                        <button type="button" className={styles.btnGhost} onClick={() => choosePortraitMode('fit')}>
                            Jugar así, con la cancha girada
                        </button>
                    </div>
                )}
                {paused && (
                    <div className={styles.pauseLayer}>
                        <strong>Pausa</strong>
                        <button type="button" className={styles.btnPrimary} onClick={() => togglePause(false)}>
                            Seguir
                        </button>
                        {hud?.phase !== 'end' && !drillKind && (
                            <button
                                type="button"
                                className={styles.btnGhost}
                                onClick={startSim}
                            >
                                Simular el resto
                            </button>
                        )}
                        <button type="button" className={styles.btnGhost} onClick={onQuit}>
                            {drillKind === 'tutorial' ? 'Salir del tutorial' : drillKind ? 'Salir de la práctica' : 'Abandonar partido'}
                        </button>
                        <button type="button" className={styles.btnGhost} onClick={() => setShowControls((v) => !v)} aria-expanded={showControls}>
                            {showControls ? 'Ocultar controles' : 'Controles'}
                        </button>
                        {showControls && touch && (
                            <div className={styles.controlsPanel}>
                                <SchemePick scheme={scheme} onChange={chooseScheme} />
                                <TouchLegend scheme={scheme} />
                                <div className={styles.portraitPick} role="radiogroup" aria-label="Con el celular parado">
                                    <span>Con el celular parado:</span>
                                    <button type="button" role="radio" aria-checked={portraitMode === 'force'} className={portraitMode === 'force' ? styles.keyBtnActive : styles.keyBtn} onClick={() => choosePortraitMode('force')}>
                                        Pedir que lo gire
                                    </button>
                                    <button type="button" role="radio" aria-checked={portraitMode === 'fit'} className={portraitMode === 'fit' ? styles.keyBtnActive : styles.keyBtn} onClick={() => choosePortraitMode('fit')}>
                                        Girar la cancha
                                    </button>
                                </div>
                            </div>
                        )}
                        {showControls && !touch && (
                            <div className={styles.controlsPanel}>
                                <ul className={styles.controlsList}>
                                    {CONTROL_LABELS.map((c) => (
                                        <li key={c.id}>
                                            <span>
                                                <strong>{c.label}</strong>
                                                <small>{c.hint}</small>
                                            </span>
                                            <button
                                                type="button"
                                                className={rebinding === c.id ? styles.keyBtnActive : styles.keyBtn}
                                                onClick={() => startRebind(rebinding === c.id ? null : c.id)}
                                                aria-label={`${c.label}: ${keyName(bindings[c.id])}. Cambiar tecla`}
                                            >
                                                {rebinding === c.id ? 'Apretá una tecla' : keyName(bindings[c.id])}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                <p className={styles.controlsNote}>
                                    Si elegís una tecla que ya usa otra acción, se intercambian. Recién tackleado, las de pase sueltan un offload.
                                </p>
                                <button type="button" className={styles.btnGhost} onClick={() => updateBindings({ ...DEFAULT_BINDINGS })}>
                                    Volver a los de fábrica
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {touchHelp && (
                    <div className={`${styles.pauseLayer} ${styles.touchHelp}`} role="dialog" aria-label="Cómo se juega en el celular">
                        <strong>Cómo se juega con el dedo</strong>
                        <SchemePick scheme={scheme} onChange={chooseScheme} />
                        <div className={styles.controlsPanel}>
                            <TouchLegend scheme={scheme} />
                        </div>
                        <button type="button" className={styles.btnPrimary} onClick={closeTouchHelp}>
                            Entendido, a jugar
                        </button>
                    </div>
                )}
                {sim && (
                    <div className={styles.simLayer} role="dialog" aria-label="Así se jugó el resto">
                        <div className={styles.simHead}>
                            <strong>Así se jugó el resto</strong>
                            <span>
                                Desde el {clockOf(sim.startT)} · {cfg.home.short} {sim.from[0]} - {sim.from[1]} {cfg.away.short}
                            </span>
                        </div>
                        <ol className={styles.simList} aria-live="polite">
                            {sim.events.length === 0 && simShown === 0 && <li>No pasó nada más: el partido se fue en tackles y rucks.</li>}
                            {sim.events.slice(0, simShown).map((ev, i) => {
                                const team = ev.side === 0 ? cfg.home : cfg.away;
                                const color = ev.side === 0 ? hud?.homeColor : hud?.awayColor;
                                return (
                                    <li key={i} className={ev.score ? styles.simScored : undefined}>
                                        <time>{clockOf(ev.t)}</time>
                                        <span className={styles.simTeam}>
                                            <i style={{ background: color }} aria-hidden="true" />
                                            {team.short}
                                        </span>
                                        <span>{ev.text}</span>
                                        <span className={styles.simScore}>{ev.score ? `${ev.score[0]} - ${ev.score[1]}` : ''}</span>
                                    </li>
                                );
                            })}
                        </ol>
                        <div className={styles.simFoot}>
                            {simShown < sim.events.length ? (
                                <button type="button" className={styles.btnGhost} onClick={() => setSimShown(sim.events.length)}>
                                    Ver todo
                                </button>
                            ) : (
                                <button type="button" className={styles.btnPrimary} onClick={() => finishRef.current(sim.final, matchRef.current?.log ?? [])}>
                                    Final: {cfg.home.short} {sim.final[0]} - {sim.final[1]} {cfg.away.short} · Seguir
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
