import type { PublicProdeCompetition } from '@/lib/prode/types';

/**
 * Vocabulario compartido entre el lobby y la pantalla de todas las competencias.
 *
 * El estado sale del FIXTURE, no de la columna `status` (que hoy vale 'active' en las
 * 38, incluidas las que no tienen un partido cargado). `isCompetitionActive`, en
 * lobbyOrder.ts, sigue siendo la fuente de "se puede jugar" y tiene test; acá solo se
 * le pone nombre a cada caso.
 */
export type CompetitionState = 'live' | 'open' | 'playing' | 'done' | 'idle';

export const STATE_LABEL: Record<CompetitionState, string> = {
    live: 'En vivo',
    open: 'Abierta',
    playing: 'En juego',
    done: 'Terminada',
    idle: 'Sin fixture',
};

// Un cierre a menos de dos horas cambia de color: deja de ser dato y pasa a ser aviso.
export const URGENT_WINDOW_MS = 2 * 60 * 60 * 1000;

// La fecha absoluta se formatea con una zona fija para que el servidor y el cliente
// escriban exactamente lo mismo. Sin fijarla, el primer render y la hidratación no
// coinciden en cuanto el visitante no está en el huso del servidor.
const TIME_ZONE = 'America/Argentina/Buenos_Aires';

const ABSOLUTE_FORMATTER = new Intl.DateTimeFormat('es-AR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

// Para un cierre a más de una semana la hora es ruido: alcanza el día. La hora exacta
// sigue estando en el `title` y en el `datetime` del <time>.
const DAY_FORMATTER = new Intl.DateTimeFormat('es-AR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
});

export function getCompetitionState(competition: PublicProdeCompetition): CompetitionState {
    const { live, open, total, finished } = competition.stats;

    if (live > 0) return 'live';
    if (open > 0) return 'open';
    if (total === 0) return 'idle';
    if (finished >= total) return 'done';
    return 'playing';
}

export function getSportLabel(sportId: string | null) {
    switch (sportId) {
        case 'rugby':
            return 'Rugby';
        case 'football':
            return 'Futbol';
        case 'basketball':
            return 'Basquet';
        case 'tennis':
            return 'Tenis';
        default:
            return sportId || 'General';
    }
}

export function formatAbsolute(iso: string) {
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time)) return '';
    return ABSOLUTE_FORMATTER.format(time).replace(',', '');
}

export function formatDay(iso: string) {
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time)) return '';
    return DAY_FORMATTER.format(time).replace(',', '');
}

/** Cuenta regresiva corta. Devuelve null cuando el cierre está tan lejos que la
 *  fecha dice más que el intervalo. */
export function formatCountdown(iso: string, now: number) {
    const target = new Date(iso).getTime();
    if (!Number.isFinite(target)) return null;

    const diff = target - now;
    if (diff <= 0) return 'cerrando';

    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'menos de 1 min';
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        const rest = minutes % 60;
        return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`;
    }

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} d`;

    return null;
}

export function isUrgent(iso: string, now: number) {
    const target = new Date(iso).getTime();
    if (!Number.isFinite(target)) return false;
    const diff = target - now;
    return diff > 0 && diff <= URGENT_WINDOW_MS;
}

/**
 * Orden de la portada: primero lo que se puede jugar y después lo más convocante.
 *
 * La popularidad sola no sirve como criterio único —medido sobre el catálogo real,
 * deja 3 de las 6 jugables fuera de las primeras 10 y las reemplaza por torneos
 * terminados o sin fixture—, así que entra como desempate y no como orden principal.
 */
export function compareByPlayableThenPopular(left: PublicProdeCompetition, right: PublicProdeCompetition) {
    const leftPlayable = left.stats.open > 0 || left.stats.live > 0 ? 1 : 0;
    const rightPlayable = right.stats.open > 0 || right.stats.live > 0 ? 1 : 0;
    if (leftPlayable !== rightPlayable) return rightPlayable - leftPlayable;

    if (left.members.totalMembers !== right.members.totalMembers) {
        return right.members.totalMembers - left.members.totalMembers;
    }

    return left.name.localeCompare(right.name, 'es');
}
