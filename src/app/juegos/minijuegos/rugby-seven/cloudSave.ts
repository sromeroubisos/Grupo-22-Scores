/*
 * Guardado de Rugby Seven en la cuenta del usuario.
 *
 * El navegador sigue siendo el guardado principal (instantáneo, funciona sin
 * cuenta). Esto lo copia a la cuenta para seguir en otro dispositivo:
 *
 *   · Casilleros: el 0 son los equipos propios y la Copa Seven; del 1 al 3, las
 *     partidas de torneo o carrera. Se sube solo el que cambió.
 *   · Cada casillero lleva la hora en que cambió (en el navegador, bajo
 *     `g22-rugby-seven-stamps`). Al abrir el juego con sesión se comparan con
 *     los de la cuenta y gana el más nuevo, casillero por casillero.
 *   · Se sube comprimido (gzip + base64: una carrera de 200 KB queda en ~30) y
 *     agrupado: varios cambios seguidos (simular fecha tras fecha) salen en una
 *     sola subida unos segundos después, y al cerrar la pestaña se manda lo que
 *     haya quedado pendiente.
 *
 * Sin sesión, o si el navegador no sabe comprimir, no hace nada: el juego
 * guarda en el navegador como siempre.
 */

import { isTourState, type TourState } from './tours';
import { isTeam, type CupProgress, type SevenTeam } from './teams';

const GAME = 'rugby-seven';
const STAMPS_KEY = 'g22-rugby-seven-stamps';
const API = '/api/juegos/saves';
const FLUSH_MS = 4000;

export const SLOTS = 4; // 0 = equipos y copa, 1..3 = partidas

export interface Snapshot {
    customTeams: SevenTeam[];
    cup: CupProgress | null;
    tours: (TourState | null)[];
}

/** El JSON de cada casillero (null: vacío). */
export function slotJsons(s: Snapshot): (string | null)[] {
    return [JSON.stringify({ customTeams: s.customTeams, cup: s.cup }), ...s.tours.map((t) => (t ? JSON.stringify(t) : null))];
}

/* ───────── compresión ───────── */

const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function gzip(text: string): Promise<string> {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
}

async function gunzip(b64: string): Promise<string> {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
}

/* ───────── horas de cada casillero ───────── */

function readStamps(): number[] {
    try {
        const raw = JSON.parse(localStorage.getItem(STAMPS_KEY) ?? '[]');
        return Array.from({ length: SLOTS }, (_, i) => (typeof raw[i] === 'number' ? raw[i] : 0));
    } catch {
        return Array(SLOTS).fill(0);
    }
}

function writeStamps(st: number[]) {
    try {
        localStorage.setItem(STAMPS_KEY, JSON.stringify(st));
    } catch {
        // Sin acceso a localStorage: la sincronización sigue en memoria.
    }
}

/* ───────── sincronizador ───────── */

export type CloudStatus = 'off' | 'syncing' | 'saved' | 'error';

/**
 * Lleva la cuenta de qué casillero cambió y lo sube. Uno por pantalla de juego.
 * `onStatus` informa el estado para mostrarlo ("guardado en tu cuenta").
 */
export class CloudSync {
    private last: (string | null)[] = Array(SLOTS).fill(null);
    private pending = new Set<number>();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private enabled = false;
    private current: (string | null)[] = Array(SLOTS).fill(null);

    constructor(private onStatus: (s: CloudStatus) => void = () => {}) {}

    /** Lo que había en el navegador al abrir: punto de partida, sin marcarlo como cambio. */
    seed(s: Snapshot) {
        this.last = slotJsons(s);
        this.current = [...this.last];
    }

    /** El juego guardó: marca la hora de los casilleros que cambiaron y programa la subida. */
    changed(s: Snapshot) {
        const now = slotJsons(s);
        const stamps = readStamps();
        let any = false;
        now.forEach((j, i) => {
            if (j === this.last[i]) return;
            this.last[i] = j;
            stamps[i] = Date.now();
            this.pending.add(i);
            any = true;
        });
        this.current = now;
        if (!any) return;
        writeStamps(stamps);
        if (this.enabled) this.schedule();
    }

    private schedule() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
    }

    /** Sube lo pendiente. `keepalive` para cuando se cierra la pestaña. */
    async flush(keepalive = false) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        if (!this.enabled || this.pending.size === 0) return;
        const slots = [...this.pending];
        this.pending.clear();
        const stamps = readStamps();
        this.onStatus('syncing');
        try {
            for (const slot of slots) {
                const json = this.current[slot];
                const res =
                    json === null
                        ? await fetch(`${API}?game=${GAME}&slot=${slot}`, { method: 'DELETE', credentials: 'same-origin', keepalive })
                        : await fetch(API, {
                              method: 'PUT',
                              credentials: 'same-origin',
                              keepalive,
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ game: GAME, slot, data: await gzip(json), savedAt: stamps[slot] || Date.now() }),
                          });
                if (res.status === 401) {
                    // Se cerró la sesión: se deja de subir, el navegador sigue guardando.
                    this.enabled = false;
                    this.onStatus('off');
                    return;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            }
            this.onStatus('saved');
        } catch {
            for (const s of slots) this.pending.add(s);
            this.onStatus('error');
            // Sin conexión o el servidor falló: se reintenta solo.
            if (!keepalive) this.timer = setTimeout(() => void this.flush(), 20_000);
        }
    }

    /**
     * Con sesión: trae lo de la cuenta y lo junta con lo del navegador,
     * casillero por casillero, quedándose con lo más nuevo. Devuelve lo que hay
     * que adoptar de la cuenta (null si no hay nada que cambiar, no hay sesión o
     * no se pudo).
     */
    async connect(local: Snapshot): Promise<Snapshot | null> {
        if (!canCompress()) return null;
        let rows: { slot: number; data: string; savedAt: number }[];
        try {
            const res = await fetch(`${API}?game=${GAME}`, { credentials: 'same-origin', cache: 'no-store' });
            if (!res.ok) return null;
            rows = ((await res.json()) as { slots?: typeof rows }).slots ?? [];
        } catch {
            return null;
        }
        this.enabled = true;
        const stamps = readStamps();
        const next: Snapshot = { customTeams: local.customTeams, cup: local.cup, tours: [...local.tours] };
        let adopted = false;
        const localJson = slotJsons(local);
        for (let slot = 0; slot < SLOTS; slot++) {
            const row = rows.find((r) => r.slot === slot);
            if (row && row.savedAt > stamps[slot]) {
                // La cuenta tiene algo más nuevo que este navegador: se adopta.
                const value = await parseSlot(slot, row.data);
                if (value === undefined) continue; // dato roto: se queda lo del navegador
                if (slot === 0) {
                    const v = value as { customTeams: SevenTeam[]; cup: CupProgress | null };
                    next.customTeams = v.customTeams;
                    next.cup = v.cup;
                } else next.tours[slot - 1] = value as TourState;
                stamps[slot] = row.savedAt;
                adopted = true;
            } else if (localJson[slot] !== null || (row && stamps[slot] > 0)) {
                // Lo del navegador es más nuevo, o la cuenta no lo tiene, o se borró acá: se sube.
                if (slot !== 0 || localJson[0] !== slotJsons({ customTeams: [], cup: null, tours: [] })[0] || row) this.pending.add(slot);
            }
        }
        writeStamps(stamps);
        this.seed(next);
        if (this.pending.size) this.schedule();
        this.onStatus('saved');
        return adopted ? next : null;
    }
}

/** Abre y valida un casillero que vino de la cuenta (undefined si no sirve). */
async function parseSlot(slot: number, data: string): Promise<unknown> {
    try {
        const v = JSON.parse(await gunzip(data));
        if (slot === 0) {
            if (!v || typeof v !== 'object') return undefined;
            return { customTeams: Array.isArray(v.customTeams) ? v.customTeams.filter(isTeam) : [], cup: v.cup ?? null };
        }
        return isTourState(v) ? v : undefined;
    } catch {
        return undefined;
    }
}
