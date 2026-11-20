/**
 * Controles del teclado, configurables desde la pausa. Se guardan por
 * dispositivo en localStorage; Esc siempre pausa, aunque se reasigne todo.
 */

export type ControlAction = 'up' | 'down' | 'passUp' | 'passDown' | 'hit' | 'kick' | 'drop' | 'action' | 'pause';

export type Bindings = Record<ControlAction, string>;

export const DEFAULT_BINDINGS: Bindings = {
    up: 'arrowup',
    down: 'arrowdown',
    passUp: 'w',
    passDown: 's',
    hit: 'd',
    kick: 'a',
    drop: 'q',
    action: ' ',
    pause: 'p',
};

export const CONTROL_LABELS: { id: ControlAction; label: string; hint: string }[] = [
    { id: 'up', label: 'Subir', hint: 'Un toque es un amague' },
    { id: 'down', label: 'Bajar', hint: 'Un toque es un amague' },
    { id: 'passUp', label: 'Pase arriba', hint: 'Mantené para el salteo · defendiendo, sube' },
    { id: 'passDown', label: 'Pase abajo', hint: 'Mantené para el salteo · defendiendo, baja' },
    { id: 'hit', label: 'Chocar', hint: 'Sin pelota, tacklear' },
    { id: 'kick', label: 'Patear', hint: 'Mantené para cargar, soltá para patear' },
    { id: 'drop', label: 'Drop', hint: 'A 45 m o menos de los palos' },
    { id: 'action', label: 'Acción', hint: 'Mejor pase · cambiar jugador · scrum · line' },
    { id: 'pause', label: 'Pausa', hint: 'Esc también pausa' },
];

const KEY = 'g22-rugby-seven-keys';

export function loadBindings(): Bindings {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return { ...DEFAULT_BINDINGS };
        const parsed = JSON.parse(raw) as Partial<Bindings>;
        const out = { ...DEFAULT_BINDINGS };
        for (const { id } of CONTROL_LABELS) {
            const v = parsed[id];
            if (typeof v === 'string' && v.length > 0 && v !== 'escape') out[id] = v;
        }
        return out;
    } catch {
        return { ...DEFAULT_BINDINGS };
    }
}

export function saveBindings(b: Bindings) {
    try {
        localStorage.setItem(KEY, JSON.stringify(b));
    } catch {
        // Sin localStorage: los controles valen para esta partida.
    }
}

/** Asigna una tecla; si ya la usaba otra acción, intercambian. */
export function assignKey(b: Bindings, action: ControlAction, key: string): Bindings {
    const next = { ...b };
    const taken = (Object.keys(next) as ControlAction[]).find((a) => a !== action && next[a] === key);
    if (taken) next[taken] = b[action];
    next[action] = key;
    return next;
}

const NAMES: Record<string, string> = {
    ' ': 'Espacio',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    enter: 'Enter',
    shift: 'Shift',
    control: 'Ctrl',
    alt: 'Alt',
    tab: 'Tab',
    backspace: 'Borrar',
};

export function keyName(k: string): string {
    return NAMES[k] ?? (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1));
}
