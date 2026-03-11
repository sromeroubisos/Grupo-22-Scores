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
