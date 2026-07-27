import type { AttributeKey, Injury, PlayerRole, Position } from './player.ts';
import type { LeagueStanding, TitleWon } from '../data/clubs2026/competitions2026.ts';

export type { LeagueStanding };

// Superset de estadísticas. Cada posición "llena" las que le corresponden; el
// resto queda en 0. Esto permite comparar carreras entre posiciones sin ramas.
export interface SeasonStats {
    tries: number; // tries anotados
    tackles: number; // tackles hechos
    metres: number; // metros ganados con pelota en mano
    assists: number; // asistencias de try
    lineBreaks: number; // quiebres
    turnovers: number; // pelotas robadas
    kicksAtGoal: number; // patadas a los palos intentadas
    kicksMade: number; // patadas convertidas
    lineoutsWon: number; // lines ganados (hooker/lock)
    metresKicked: number; // metros pateados (apertura/fullback)
}

/**
 * Registro REAL de una competición que el club disputó esta temporada. Separa lo
 * que antes se colapsaba: elegible ≠ inscripto ≠ campeón ≠ título del jugador.
 * Es el ledger que impide "campeón de una liga que no disputó".
 */
export interface SeasonCompetitionParticipation {
    competitionId: string;
    competitionName: string;
    role: 'primary-league' | 'domestic-cup' | 'regional-cup' | 'continental-cup';
    /** ¿El club efectivamente participó (identificado + inscripto)? */
    entered: boolean;
    /** Apariciones senior del jugador en esa competición (0 = no la disputó). */
    playerAppearances: number;
    /** Resultado del club. */
    result: 'regular-season' | 'group-stage' | 'eliminated' | 'runner-up' | 'champion';
    /** ¿El club salió campeón? */
    clubWon: boolean;
    /** ¿Se acredita el título AL JUGADOR? (club campeón + jugador con apariciones senior). */
    playerCredited: boolean;
}

export interface SeasonResult {
    seasonIndex: number;
    age: number;
    club: string;
    league: string;
    role: PlayerRole;
    position: Position;

    ovrStart: number;
    ovrEnd: number;
    effectiveOvr: number;

    matches: number;
    minutes: number;
    rating: number; // 5.0 .. 9.9

    titles: string[]; // etiquetas de títulos DEL JUGADOR (para mostrar)
    titlesWon: TitleWon[]; // títulos DEL JUGADOR (club campeón + apariciones senior)
    clubTitlesWon: TitleWon[]; // títulos DEL CLUB (institucionales; el jugador puede no sumarlos)

    leaguePosition: number; // posición final del club en su liga (1 = campeón)
    leagueTeams: number; // equipos en esa liga
    competitionsPlayed: string[]; // competiciones DISPUTADAS (no necesariamente ganadas)
    participations: SeasonCompetitionParticipation[]; // ledger real de la temporada

    capsGained: number;
    calledUp: boolean; // convocado a la selección

    injuries: Injury[]; // lesiones sufridas esta temporada
    stats: SeasonStats;

    attributeDeltas: Partial<Record<AttributeKey, number>>; // cambios por edad
    headline: string; // titular narrativo de la temporada
    eventId: string | null; // evento disparado esta temporada (si hubo)
    decisionText: string | null; // resultado de la decisión tomada
}

export function emptyStats(): SeasonStats {
    return {
        tries: 0,
        tackles: 0,
        metres: 0,
        assists: 0,
        lineBreaks: 0,
        turnovers: 0,
        kicksAtGoal: 0,
        kicksMade: 0,
        lineoutsWon: 0,
        metresKicked: 0,
    };
}
