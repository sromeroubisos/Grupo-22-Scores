import type { Sport, SportId } from '@/lib/types';

/**
 * Catálogo de deportes.
 *
 * `isActive` es el DEFAULT ESTÁTICO: lo que se pinta en el primer paint y lo
 * que leen los consumidores que no pasan por Supabase (crons de sync,
 * creadores de club/partido, onboarding). La visibilidad real del selector la
 * refina el super admin desde `/admin/super/deportes`, que escribe
 * `sports.is_visible` / `sports.display_order` en la base — ver `SportContext`.
 *
 * Los dos tienen que decir lo mismo. Si acá activás un deporte, la fila tiene
 * que existir en la tabla `sports` o el super admin no lo va a poder tocar
 * (`saveChanges` hace UPDATE, nunca INSERT).
 *
 * Los SEIS activos son deliberados. Cinco se juegan equipo contra equipo y
 * tienen el modelo completo (torneo → fase → partido → eventos). `motorsport`
 * es la excepción declarada: entra SOLO como deporte de lectura vía ESPN
 * (F1, IndyCar, NASCAR). No tiene catálogo de eventos ni reloj porque una
 * carrera no es un partido; ver `src/lib/services/espnMotorsport.ts`.
 */
export const SPORTS: Record<SportId, Sport> = {
    'football': {
        id: 'football',
        name: 'Football',
        nameEs: 'Fútbol',
        icon: '⚽',
        isActive: true,
        priority: 2,
        matchRules: {
            periods: 2,
            periodDurationMinutes: 45,
            breakDurationMinutes: 15,
            overtimePeriods: 2,
            overtimeDurationMinutes: 15,
        }
    },
    'tennis': {
        id: 'tennis',
        name: 'Tennis',
        nameEs: 'Tenis',
        icon: '🎾',
        isActive: false,
        priority: 10,
        groupLabel: 'Categories',
        groupLabelEs: 'Categorías',
    },
    'basketball': {
        id: 'basketball',
        name: 'Basketball',
        nameEs: 'Básquetbol',
        icon: '🏀',
        isActive: true,
        priority: 3,
        matchRules: {
            periods: 4,
            periodDurationMinutes: 12, // NBA standard, FIBA is 10
            breakDurationMinutes: 15, // Halftime
            overtimePeriods: 1, // Usually unlimited OT until winner
            overtimeDurationMinutes: 5,
        }
    },
    'hockey': {
        id: 'hockey',
        name: 'Ice Hockey',
        // 'field-hockey' se queda con el rotulo corto "Hockey" porque es el que
        // tiene todos los torneos de la plataforma; este necesita apellido para
        // que el menu no muestre dos deportes con el mismo nombre.
        nameEs: 'Hockey sobre hielo',
        icon: '🏒',
        isActive: false,
        priority: 11,
        matchRules: {
            periods: 3,
            periodDurationMinutes: 20,
            breakDurationMinutes: 15,
            overtimePeriods: 1,
            overtimeDurationMinutes: 5,
        }
    },
    'volleyball': {
        id: 'volleyball',
        name: 'Volleyball',
        nameEs: 'Vóley',
        icon: '🏐',
        isActive: false,
        priority: 12,
    },
    'handball': {
        id: 'handball',
        name: 'Handball',
        nameEs: 'Handball',
        icon: '🤾',
        isActive: false,
        priority: 13,
    },
    'baseball': {
        id: 'baseball',
        name: 'Baseball',
        nameEs: 'Béisbol',
        icon: '⚾',
        isActive: false,
        priority: 14,
    },
    'rugby': {
        id: 'rugby',
        name: 'Rugby',
        nameEs: 'Rugby',
        icon: '🏉',
        isActive: true,
        priority: 1,
        matchRules: {
            periods: 2,
            periodDurationMinutes: 40,
            breakDurationMinutes: 15,
            overtimePeriods: 2,
            overtimeDurationMinutes: 10,
        }
    },
    'american-football': {
        id: 'american-football',
        name: 'American Football',
        nameEs: 'F. Am.',
        icon: '🏈',
        isActive: true,
        priority: 5,
        matchRules: {
            periods: 4,
            periodDurationMinutes: 15,
            breakDurationMinutes: 13,
            overtimePeriods: 1,
            overtimeDurationMinutes: 10,
        }
    },
    'field-hockey': {
        id: 'field-hockey',
        name: 'Field Hockey',
        // El 100% del hockey de la plataforma es sobre cesped (sport_id
        // 'field-hockey': 23 torneos, 105 partidos; 'hockey' no tiene ninguno),
        // asi que el rotulo corto es este y no el de hielo.
        nameEs: 'Hockey',
        icon: '🏑',
        isActive: true,
        priority: 4,
        matchRules: {
            periods: 4,
            periodDurationMinutes: 15,
            breakDurationMinutes: 5, // Halftime is 5m, quarter breaks are 2m (logic needs to handle this)
            hasShootout: true,
        }
    },
    'cricket': {
        id: 'cricket',
        name: 'Cricket',
        nameEs: 'Cricket',
        icon: '🏏',
        isActive: false,
        priority: 15,
    },
    'snooker': {
        id: 'snooker',
        name: 'Snooker',
        nameEs: 'Snooker',
        icon: '🎱',
        isActive: false,
        priority: 16,
    },
    'table-tennis': {
        id: 'table-tennis',
        name: 'Table Tennis',
        nameEs: 'T. Mesa',
        icon: '🏓',
        isActive: false,
        priority: 17,
    },
    'darts': {
        id: 'darts',
        name: 'Darts',
        nameEs: 'Dardos',
        icon: '🎯',
        isActive: false,
        priority: 18,
    },
    'futsal': {
        id: 'futsal',
        name: 'Futsal',
        nameEs: 'Fútsal',
        icon: '⚽',
        isActive: false,
        priority: 19,
    },
    'esports': {
        id: 'esports',
        name: 'Esports',
        nameEs: 'Esports',
        icon: '🎮',
        isActive: false,
        priority: 20,
    },
    'golf': {
        id: 'golf',
        name: 'Golf',
        nameEs: 'Golf',
        icon: '⛳',
        isActive: false,
        priority: 21,
    },
    'floorball': {
        id: 'floorball',
        name: 'Floorball',
        nameEs: 'Floorball',
        icon: '🏑',
        isActive: false,
        priority: 22,
    },
    'bandy': {
        id: 'bandy',
        name: 'Bandy',
        nameEs: 'Bandy',
        icon: '🏒',
        isActive: false,
        priority: 23,
    },
    'rugby-union': {
        id: 'rugby-union',
        name: 'Rugby Union',
        nameEs: 'Rugby Union',
        icon: '🏉',
        isActive: false,
        priority: 24,
        groupKey: 'rugby',
        groupName: 'Rugby',
    },
    'rugby-league': {
        id: 'rugby-league',
        name: 'Rugby League',
        nameEs: 'Rugby League',
        icon: '🏉',
        isActive: false,
        priority: 25,
        groupKey: 'rugby',
        groupName: 'Rugby',
    },
    'boxing': {
        id: 'boxing',
        name: 'Boxing',
        nameEs: 'Boxeo',
        icon: '🥊',
        isActive: false,
        priority: 26,
    },
    'beach-volleyball': {
        id: 'beach-volleyball',
        name: 'Beach Volleyball',
        nameEs: 'Voleibol de Playa',
        icon: '🏐',
        isActive: false,
        priority: 27,
    },
    'aussie-rules': {
        id: 'aussie-rules',
        name: 'Australian Football',
        nameEs: 'Fútbol Australiano',
        icon: '🏈',
        isActive: false,
        priority: 28,
    },
    'badminton': {
        id: 'badminton',
        name: 'Badminton',
        nameEs: 'Bádminton',
        icon: '🏸',
        isActive: false,
        priority: 29,
    },
    'water-polo': {
        id: 'water-polo',
        name: 'Water Polo',
        nameEs: 'Waterpolo',
        icon: '🤽',
        isActive: false,
        priority: 30,
    },
    'beach-soccer': {
        id: 'beach-soccer',
        name: 'Beach Soccer',
        nameEs: 'Fútbol Playa',
        icon: '⚽',
        isActive: false,
        priority: 31,
    },
    'mma': {
        id: 'mma',
        name: 'MMA',
        nameEs: 'Artes Marciales Mixtas',
        icon: '🥋',
        isActive: false,
        priority: 32,
    },
    'netball': {
        id: 'netball',
        name: 'Netball',
        nameEs: 'Netball',
        icon: '🏀',
        isActive: false,
        priority: 33,
    },
    'pesapallo': {
        id: 'pesapallo',
        name: 'Pesäpallo',
        nameEs: 'Pesäpallo',
        icon: '⚾',
        isActive: false,
        priority: 34,
    },
    'motorsport': {
        id: 'motorsport',
        name: 'Motorsport',
        nameEs: 'Automovilismo',
        icon: '🏎️',
        // Deporte de LECTURA. No se le crean torneos locales ni se le cargan
        // eventos de partido: el modelo es carrera + parrilla, no equipo vs
        // equipo. Los datos salen de ESPN (espnMotorsport.ts).
        isActive: true,
        priority: 6,
    },
    'cycling': {
        id: 'cycling',
        name: 'Cycling',
        nameEs: 'Ciclismo',
        icon: '🚴',
        isActive: false,
        priority: 35,
    },
    'horse-racing': {
        id: 'horse-racing',
        name: 'Horse Racing',
        nameEs: 'Carreras de Caballos',
        icon: '🏇',
        isActive: false,
        priority: 36,
    },
    'winter-sports': {
        id: 'winter-sports',
        name: 'Winter Sports',
        nameEs: 'Deportes de Invierno',
        icon: '⛷️',
        isActive: false,
        priority: 37,
    },
    'kabaddi': {
        id: 'kabaddi',
        name: 'Kabaddi',
        nameEs: 'Kabaddi',
        icon: '🤸',
        isActive: false,
        priority: 38,
    },
};

export const getActiveSports = (): Sport[] => {
    return getAllSports().filter(sport => sport.isActive);
};

export const getAllSports = (): Sport[] => {
    return Object.values(SPORTS).sort((a, b) => a.priority - b.priority);
};

export const getComingSoonSports = (): Sport[] => {
    return Object.values(SPORTS)
        .filter(sport => !sport.isActive)
        .sort((a, b) => a.priority - b.priority);
};

export const getSportById = (id: SportId): Sport | undefined => {
    return SPORTS[id];
};
