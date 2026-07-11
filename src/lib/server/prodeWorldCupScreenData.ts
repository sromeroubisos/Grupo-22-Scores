import { listPublicProdeCompetitions } from '@/lib/server/prodeCompetitions';
import { getPublicCompetitionPlayView } from '@/lib/server/prodePlay';
import type { PublicProdeCompetition } from '@/lib/prode/types';

export type ProdeWorldCupNextMatch = {
    homeLabel: string;
    awayLabel: string;
    homeLogoUrl: string | null;
    awayLogoUrl: string | null;
    startsAt: string;
};

export type ProdeWorldCupScreenData = {
    playHref: string;
    competitionName: string;
    finished: boolean;
    memberCount: number;
    openEvents: number;
    incentive: { label: string | null; value: string };
    nextMatch: ProdeWorldCupNextMatch | null;
    // true si el usuario logueado ya participa de la liga (tiene predicciones o posición).
    // El popup no se muestra cuando es true.
    alreadyJoined: boolean;
};

// Identifica la competencia prode del Mundial de fútbol entre las publicadas.
// Prioriza el binding ESPN de la FIFA World Cup; cae a coincidencia por nombre/slug.
function findWorldCupCompetition(competitions: PublicProdeCompetition[]): PublicProdeCompetition | null {
    const byBinding = competitions.find((c) =>
        /fifa\.?world|world.?cup/i.test(c.sourceBinding.externalTournamentId || ''),
    );
    if (byBinding) return byBinding;

    const byName = competitions.filter(
        (c) =>
            (c.sportId === 'football' || c.sportId === null) &&
            /mundial|world\s?cup|copa del mundo|fifa/i.test(`${c.name} ${c.slug}`),
    );
    byName.sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
    return byName[0] || null;
}

/**
 * Datos reales para la pantalla/popup del Prode del Mundial. Devuelve null si todavía
 * no hay un prode del Mundial publicado (o la base no tiene el schema del prode).
 * Reutilizado por la ruta `/prode/mundial` y por el endpoint que alimenta el popup.
 */
export async function getProdeWorldCupScreenData(userId: string | null): Promise<ProdeWorldCupScreenData | null> {
    const { schemaReady, data: competitions } = await listPublicProdeCompetitions();
    const competition = schemaReady ? findWorldCupCompetition(competitions) : null;
    if (!competition) return null;

    const view = await getPublicCompetitionPlayView(competition.slug, userId);
    if (!view) return null;

    // Próximo partido = el evento abierto/programado más cercano en el futuro.
    const now = Date.now();
    const upcoming = view.events
        .filter((e) => e.status !== 'final' && e.status !== 'scored' && e.status !== 'cancelled')
        .filter((e) => new Date(e.startsAt).getTime() > now)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const next =
        upcoming[0] ||
        view.events.find((e) => e.isOpen && !Number.isNaN(new Date(e.startsAt).getTime())) ||
        null;

    const openEvents = view.events.filter((e) => e.isOpen).length;

    // "Ya participa de la liga" = usuario logueado con al menos una predicción
    // o con posición en la tabla. En ese caso el popup no debe mostrarse.
    const alreadyJoined =
        Boolean(userId) &&
        (view.personalSummary.position != null || view.events.some((e) => e.prediction != null));

    // Incentivo competitivo real: la posición del usuario si ya juega; si no, CTA social.
    const position = view.personalSummary.position;
    const incentive =
        userId && position
            ? { label: 'Tu posición', value: `#${position} en el Mundial` }
            : { label: null, value: 'Competí con tus amigos y subí en el ranking' };

    return {
        playHref: `/prode/${competition.slug}`,
        competitionName: view.competitionName,
        finished: view.isFinished,
        memberCount: view.memberCount,
        openEvents,
        incentive,
        alreadyJoined,
        nextMatch: next
            ? {
                  homeLabel: next.homeLabel,
                  awayLabel: next.awayLabel,
                  homeLogoUrl: next.homeLogoUrl,
                  awayLogoUrl: next.awayLogoUrl,
                  startsAt: next.startsAt,
              }
            : null,
    };
}
