import { Database } from '@/lib/database.types';

export type SquadPlayer = {
    id: string;
    squad_id: string;
    player_id: string;
    position: string;
    position_category: 'forwards' | 'backs' | 'staff';
    role: 'titular' | 'suplente' | 'desarrollo';
    jersey_number: number | null;
    status: 'disponible' | 'lesionado' | 'suspendido' | 'convocado' | 'baja';
    order: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

export type PlayerWithDetails = {
    id: string;
    name: string;
    photo_url: string | null;
    birth_date: string | null;
    height: number | null;
    weight: number | null;
    position: string;
    position_secondary: string[] | null;
    status: string;
    // Squad player specific
    squad_player_id?: string;
    jersey_number?: number | null;
    role?: 'titular' | 'suplente' | 'desarrollo';
    squad_status?: 'disponible' | 'lesionado' | 'suspendido' | 'convocado' | 'baja';
    order?: number;
    notes?: string | null;
};

export type RugbyPosition = {
    code: string;
    name: string;
    category: 'forwards' | 'backs';
    group: string;
    typical_numbers: number[];
    min_recommended: number;
    max_recommended: number;
};

export const RUGBY_POSITIONS: RugbyPosition[] = [
    // FORWARDS
    { code: 'PROP_L', name: 'Pilar Izquierdo', category: 'forwards', group: 'Primera Línea', typical_numbers: [1], min_recommended: 2, max_recommended: 3 },
    { code: 'HOOKER', name: 'Hooker', category: 'forwards', group: 'Primera Línea', typical_numbers: [2], min_recommended: 2, max_recommended: 3 },
    { code: 'PROP_R', name: 'Pilar Derecho', category: 'forwards', group: 'Primera Línea', typical_numbers: [3], min_recommended: 2, max_recommended: 3 },
    { code: 'LOCK', name: 'Segunda Línea', category: 'forwards', group: 'Segunda Línea', typical_numbers: [4, 5], min_recommended: 3, max_recommended: 5 },
    { code: 'FLANKER', name: 'Ala', category: 'forwards', group: 'Tercera Línea', typical_numbers: [6, 7], min_recommended: 3, max_recommended: 4 },
    { code: 'EIGHT', name: 'Octavo', category: 'forwards', group: 'Tercera Línea', typical_numbers: [8], min_recommended: 2, max_recommended: 3 },

    // BACKS
    { code: 'SCRUM_HALF', name: 'Medioscrum', category: 'backs', group: 'Medios', typical_numbers: [9], min_recommended: 2, max_recommended: 3 },
    { code: 'FLY_HALF', name: 'Apertura', category: 'backs', group: 'Medios', typical_numbers: [10], min_recommended: 2, max_recommended: 3 },
    { code: 'CENTER', name: 'Centro', category: 'backs', group: 'Tres Cuartos', typical_numbers: [12, 13], min_recommended: 3, max_recommended: 4 },
    { code: 'WING', name: 'Wing', category: 'backs', group: 'Tres Cuartos', typical_numbers: [11, 14], min_recommended: 3, max_recommended: 4 },
    { code: 'FULLBACK', name: 'Fullback', category: 'backs', group: 'Tres Cuartos', typical_numbers: [15], min_recommended: 2, max_recommended: 3 },
];

/**
 * El numero de la camiseta -> el puesto. Solo del 1 al 15.
 *
 * En rugby la numeracion titular ES posicional, asi que un 10 es el apertura y
 * un 2 el hooker. Del 16 al 23 NO: son el banco, y ahi el numero dice el orden
 * en que entran, no donde juegan. Un 22 puede ser apertura o centro, asi que
 * devolver algo seria inventar.
 *
 * Esto NO reemplaza a `people.position`. El numero cambia con la formacion y
 * con quien entre desde el banco; el puesto es del jugador. Se guarda el
 * puesto, y el numero se usa solo para deducirlo cuando el puesto no esta
 * cargado — que hoy es el caso de 9 de cada 10 fichas.
 */
const POSITION_BY_NUMBER: Record<number, string> = RUGBY_POSITIONS.reduce(
    (acc, position) => {
        for (const number of position.typical_numbers) acc[number] = position.code;
        return acc;
    },
    {} as Record<number, string>,
);

export function positionFromJerseyNumber(value: unknown): RugbyPosition | null {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 15) return null;
    const code = POSITION_BY_NUMBER[number];
    return RUGBY_POSITIONS.find((position) => position.code === code) || null;
}

/**
 * Como se nombra el puesto de un titular. Los dos pilares y los dos wings
 * llevan lado en el catalogo (`Pilar Izquierdo`, `Pilar Derecho`) porque el
 * plantel lo necesita para armar la primera linea; en una ficha publica el lado
 * es ruido, asi que el 1 y el 3 son los dos "Pilar".
 */
export function positionLabelFromJerseyNumber(value: unknown): string | null {
    const position = positionFromJerseyNumber(value);
    if (!position) return null;
    if (position.code === 'PROP_L' || position.code === 'PROP_R') return 'Pilar';
    return position.name;
}

export type SquadMetrics = {
    total: number;
    forwards: number;
    backs: number;
    avgAge: number;
    avgWeight: number;
    injured: number;
    suspended: number;
    available: number;
};
