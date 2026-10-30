import { NextRequest } from 'next/server';
import { z } from 'zod';

import { acceptsNominations, getAwardCategory } from '@/lib/awards/config';
import { subjectKeyFor } from '@/lib/awards/finalists';
import {
    addNomination,
    countUserNominations,
    findClub,
    findPerson,
    getEditionState,
    hasDebutedInPrimera,
} from '@/lib/server/awards';
import {
    awardsErrorResponse,
    json,
    jsonError,
    requireVerifiedParticipant,
    resolveEdition,
    UUID,
} from '@/lib/server/awardsHttp';

export const dynamic = 'force-dynamic';

/** Cuántas personas distintas puede postular una persona por categoría. */
const MAX_PER_CATEGORY = 5;

const NominationSchema = z.object({
    category: z.string().trim().min(1).max(64),
    personId: z.string().trim().regex(UUID).optional(),
    clubId: z.string().trim().min(1).max(128).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    note: z.string().trim().max(300).default(''),
});

/**
 * POST /api/awards/:edition/nominations { category, personId? | name?, clubId?, note? } → { ok }
 * Con mail verificado, solo en la etapa de postulaciones. El nombre y el club
 * de un jugador de la base salen de la base, no de lo que mande el navegador.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ edition: string }> }) {
    const config = await resolveEdition(params);
    if (!config) return jsonError('Esa edición no existe.', 404);

    const participant = await requireVerifiedParticipant();
    if (participant.ok === false) return participant.response;

    const parsed = NominationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError('Revisá los datos de la postulación.', 400);
    const body = parsed.data;

    const category = getAwardCategory(config, body.category);
    if (!category || !acceptsNominations(category.kind)) return jsonError('Esa categoría no recibe postulaciones.', 400);

    try {
        const state = await getEditionState(config);
        if (state.stage !== 'postulaciones') return jsonError('Las postulaciones están cerradas.', 409);

        let subjectName: string;
        let personId: string | null = null;
        let clubId: string | null = null;
        let clubName: string | null = null;

        if (category.kind === 'club') {
            if (!body.clubId) return jsonError('Elegí el club que querés postular.', 400);
            // Postular a un equipo: solo plantel superior, no las categorías de juveniles.
            const club = await findClub(config, body.clubId, true);
            if (!club) return jsonError('Ese club no está en esta edición o no es de plantel superior.', 400);
            subjectName = club.name;
            clubId = club.id;
            clubName = club.name;
        } else if (category.kind === 'moment') {
            // Un gol o un partido: se escribe a mano ("Ciudad vs SIC, fecha 9").
            if (!body.name) return jsonError('Contanos cuál fue: escribí el gol o el partido.', 400);
            subjectName = body.name;
        } else if (body.personId) {
            const person = await findPerson(body.personId);
            if (!person) return jsonError('No encontramos a esa persona.', 400);
            // Rugby local: el jugador tiene que ser de nuestra base y de un club de esta edición.
            if (config.playersFromDb && (!person.sport || !config.sports.includes(person.sport))) {
                return jsonError('Ese jugador no está en nuestra base de esta edición.', 400);
            }
            // Puede ser menor de edad, pero tiene que haber debutado en primera.
            if (config.requireDebut && !(await hasDebutedInPrimera(config, person.id))) {
                return jsonError('Ese jugador todavía no debutó en primera. Solo se postula a quien ya jugó en plantel superior.', 400);
            }
            subjectName = person.name;
            personId = person.id;
            clubId = person.clubId;
            clubName = person.clubName;
        } else {
            if (config.playersFromDb) {
                return jsonError('Elegí a la persona de la lista: solo se postula a jugadores que ya están en nuestra base.', 400);
            }
            if (!body.name) return jsonError('Escribí el nombre de la persona.', 400);
            subjectName = body.name;
        }

        // El club que eligió quien postula completa al jugador que no lo trae.
        if ((category.kind === 'person' || category.kind === 'xi') && !clubId && body.clubId) {
            const club = await findClub(config, body.clubId);
            if (club) {
                clubId = club.id;
                clubName = club.name;
            }
        }

        const used = await countUserNominations(config.slug, category.slug, participant.userId);
        if (used >= MAX_PER_CATEGORY) {
            return jsonError(`Ya postulaste a ${MAX_PER_CATEGORY} en esta categoría.`, 409);
        }

        const added = await addNomination({
            edition: config.slug,
            category: category.slug,
            userId: participant.userId,
            subjectKey: subjectKeyFor({ personId, clubId, name: subjectName, club: category.kind === 'club' }),
            subjectName,
            personId,
            clubId,
            clubName,
            note: body.note,
        });
        if (!added) return jsonError('Ya postulaste a esa persona en esta categoría.', 409);
        return json({ ok: true, subjectName });
    } catch (error) {
        return awardsErrorResponse(error, 'No se pudo guardar tu postulación.');
    }
}
