import type { Sport, SportId } from '@/lib/types';

export const SPORTS: Record<SportId, Sport> = {
    'football': {
        id: 'football',
        name: 'Football',
        nameEs: 'Fútbol',
        icon: '⚽',
        isActive: true,
        priority: 10,
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
        isActive: true,
        priority: 2,
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
        nameEs: 'Hockey',
        icon: '🏒',
        isActive: true,
        priority: 4,
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
        isActive: true,
        priority: 5,
    },
    'handball': {
        id: 'handball',
        name: 'Handball',
        nameEs: 'Handball',
        icon: '🤾',
        isActive: true,
        priority: 6,
    },
    'baseball': {
        id: 'baseball',
        name: 'Baseball',
        nameEs: 'Béisbol',
        icon: '⚾',
        isActive: true,
        priority: 7,
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
        priority: 9,
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
        priority: 10,
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
        isActive: true,
        priority: 11,
    },
    'snooker': {
        id: 'snooker',
        name: 'Snooker',
        nameEs: 'Snooker',
        icon: '🎱',
        isActive: true,
        priority: 12,
    },
    'table-tennis': {
        id: 'table-tennis',
        name: 'Table Tennis',
        nameEs: 'T. Mesa',
        icon: '🏓',
        isActive: true,
        priority: 13,
    },
    'darts': {
        id: 'darts',
        name: 'Darts',
        nameEs: 'Dardos',
        icon: '🎯',
        isActive: true,
        priority: 14,
    },
    'futsal': {
        id: 'futsal',
        name: 'Futsal',
        nameEs: 'Fútsal',
        icon: '⚽',
        isActive: true,
        priority: 15,
    },
    'esports': {
        id: 'esports',
        name: 'Esports',
        nameEs: 'Esports',
        icon: '🎮',
        isActive: true,
        priority: 16,
    },
    'golf': {
        id: 'golf',
        name: 'Golf',
        nameEs: 'Golf',
        icon: '⛳',
        isActive: false,
        priority: 17,
    },
    'floorball': {
        id: 'floorball',
        name: 'Floorball',
        nameEs: 'Floorball',
        icon: '🏑',
        isActive: false,
        priority: 18,
    },
    'bandy': {
        id: 'bandy',
        name: 'Bandy',
        nameEs: 'Bandy',
        icon: '🏒',
        isActive: false,
        priority: 19,
    },
    'rugby-union': {
        id: 'rugby-union',
        name: 'Rugby Union',
        nameEs: 'Rugby Union',
        icon: '🏉',
        isActive: false,
        priority: 20,
        groupKey: 'rugby',
        groupName: 'Rugby',
    },
    'rugby-league': {
        id: 'rugby-league',
        name: 'Rugby League',
        nameEs: 'Rugby League',
        icon: '🏉',
        isActive: false,
        priority: 21,
        groupKey: 'rugby',
        groupName: 'Rugby',
    },
    'boxing': {
        id: 'boxing',
        name: 'Boxing',
        nameEs: 'Boxeo',
        icon: '🥊',
        isActive: false,
        priority: 22,
    },
    'beach-volleyball': {
        id: 'beach-volleyball',
        name: 'Beach Volleyball',
        nameEs: 'Voleibol de Playa',
        icon: '🏐',
        isActive: false,
        priority: 23,
    },
    'aussie-rules': {
        id: 'aussie-rules',
        name: 'Australian Football',
        nameEs: 'Fútbol Australiano',
        icon: '🏈',
        isActive: false,
        priority: 24,
    },
    'badminton': {
        id: 'badminton',
        name: 'Badminton',
        nameEs: 'Bádminton',
        icon: '🏸',
        isActive: false,
        priority: 25,
    },
    'water-polo': {
        id: 'water-polo',
        name: 'Water Polo',
        nameEs: 'Waterpolo',
        icon: '🤽',
        isActive: false,
        priority: 26,
    },
    'beach-soccer': {
        id: 'beach-soccer',
        name: 'Beach Soccer',
        nameEs: 'Fútbol Playa',
        icon: '⚽',
        isActive: false,
        priority: 27,
    },
    'mma': {
        id: 'mma',
        name: 'MMA',
        nameEs: 'Artes Marciales Mixtas',
        icon: '🥋',
        isActive: false,
        priority: 28,
    },
    'netball': {
        id: 'netball',
        name: 'Netball',
        nameEs: 'Netball',
        icon: '🏀',
        isActive: false,
        priority: 29,
    },
    'pesapallo': {
        id: 'pesapallo',
        name: 'Pesäpallo',
        nameEs: 'Pesäpallo',
        icon: '⚾',
        isActive: false,
        priority: 30,
    },
    'motorsport': {
        id: 'motorsport',
        name: 'Motorsport',
        nameEs: 'Automovilismo',
        icon: '🏎️',
        isActive: false,
        priority: 31,
    },
    'cycling': {
        id: 'cycling',
        name: 'Cycling',
        nameEs: 'Ciclismo',
        icon: '🚴',
        isActive: false,
        priority: 32,
    },
    'horse-racing': {
        id: 'horse-racing',
        name: 'Horse Racing',
        nameEs: 'Carreras de Caballos',
        icon: '🏇',
        isActive: false,
        priority: 33,
    },
    'winter-sports': {
        id: 'winter-sports',
        name: 'Winter Sports',
        nameEs: 'Deportes de Invierno',
        icon: '⛷️',
        isActive: false,
        priority: 34,
    },
    'kabaddi': {
        id: 'kabaddi',
        name: 'Kabaddi',
        nameEs: 'Kabaddi',
        icon: '🤸',
        isActive: false,
        priority: 35,
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
