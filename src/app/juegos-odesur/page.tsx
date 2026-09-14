import type { Metadata } from 'next';
import {
    getOdesurAgenda,
    getOdesurLatestMedallists,
    getOdesurMedalTable,
    getOdesurMedalTablesByDiscipline,
    odesurToday,
    ODESUR_FIRST_DAY,
    ODESUR_LAST_DAY,
} from '@/lib/services/odesur2026';
import OdesurHub from './OdesurHub';
import type { OdesurAgendaView, OdesurMedalsView } from './types';

export const metadata: Metadata = {
    title: 'Juegos Suramericanos Santa Fe 2026 | G22 Scores',
    description:
        'Medallero, resultados, zonas y agenda de los Juegos Suramericanos Santa Fe 2026: 60 deportes y 15 delegaciones, del 13 al 26 de septiembre.',
    openGraph: {
        title: 'Juegos Suramericanos Santa Fe 2026 | G22 Scores',
        description: 'Medallero, resultados, zonas y agenda de los Juegos Suramericanos Santa Fe 2026.',
        type: 'website',
    },
};

type SearchParams = Promise<{ vista?: string; dia?: string; deporte?: string; rama?: string }>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** El día que se abre: el pedido si es de los Juegos, si no hoy, acotado a los Juegos. */
function resolveDay(requested: string): string {
    if (ISO_DAY.test(requested) && requested >= ODESUR_FIRST_DAY && requested <= ODESUR_LAST_DAY) return requested;
    const today = odesurToday();
    if (today < ODESUR_FIRST_DAY) return ODESUR_FIRST_DAY;
    if (today > ODESUR_LAST_DAY) return ODESUR_LAST_DAY;
    return today;
}

/**
 * La primera pintura sale del servidor con el medallero y la agenda del día,
 * que es lo que casi todos vienen a mirar. El resto (un torneo de equipo, los
 * medallistas de un deporte) lo pide el cliente al abrirlo. Si Bornan no
 * contesta, la página se pinta igual y el cliente reintenta: una fuente caída
 * no puede tumbar la pantalla.
 */
export default async function JuegosOdesurPage({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    const day = resolveDay(String(params.dia || '').trim());

    const [medals, agenda] = await Promise.all([
        (async (): Promise<OdesurMedalsView | null> => {
            try {
                const [general, byDiscipline, latest] = await Promise.all([
                    getOdesurMedalTable(),
                    getOdesurMedalTablesByDiscipline().catch(() => []),
                    getOdesurLatestMedallists().catch(() => []),
                ]);
                return { general, byDiscipline, latest };
            } catch {
                return null;
            }
        })(),
        getOdesurAgenda(day)
            .then((items): OdesurAgendaView => ({ day, items }))
            .catch(() => null),
    ]);

    return (
        <OdesurHub
            firstDay={ODESUR_FIRST_DAY}
            lastDay={ODESUR_LAST_DAY}
            today={odesurToday()}
            initialView={String(params.vista || '')}
            initialDay={day}
            initialDiscipline={String(params.deporte || '')}
            initialGender={params.rama === 'm' ? 'm' : (params.rama === 'w' ? 'w' : '')}
            initialMedals={medals}
            initialAgenda={agenda}
        />
    );
}
