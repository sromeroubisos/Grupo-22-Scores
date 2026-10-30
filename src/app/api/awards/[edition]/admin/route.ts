import { NextRequest } from 'next/server';
import { z } from 'zod';

import { getAwardCategory } from '@/lib/awards/config';
import {
    addPlay,
    AwardsRuleError,
    buildFinalistsAndOpenVoting,
    getAdminOverview,
    getEditionState,
    moderateNomination,
    moderatePlay,
    setEditorialPick,
    updateEdition,
} from '@/lib/server/awards';
import {
    awardsErrorResponse,
    cleanHttpUrl,
    json,
    jsonError,
    requireAwardsEditor,
    resolveEdition,
    UUID,
} from '@/lib/server/awardsHttp';

export const dynamic = 'force-dynamic';

const IsoOrNull = z.string().datetime({ offset: true }).nullable();

const ActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('build-finalists') }),
    z.object({ action: z.literal('set-stage'), stage: z.enum(['votacion', 'resultados']) }),
    z.object({ action: z.literal('set-dates'), nominationsCloseAt: IsoOrNull.optional(), votingCloseAt: IsoOrNull.optional() }),
    z.object({
        action: z.literal('moderate-nomination'),
        category: z.string().trim().min(1).max(64),
        subjectKey: z.string().trim().min(1).max(200),
        status: z.enum(['pending', 'rejected']),
    }),
    z.object({ action: z.literal('moderate-play'), playId: z.string().trim().regex(UUID), status: z.enum(['pending', 'approved', 'rejected']) }),
    z.object({
        action: z.literal('set-editorial'),
        category: z.string().trim().min(1).max(64),
        name: z.string().trim().min(2).max(100),
        detail: z.string().trim().max(100).default(''),
        note: z.string().trim().max(600).default(''),
    }),
    z.object({
        action: z.literal('add-email-play'),
        url: z.string().trim().min(8).max(600),
        title: z.string().trim().max(100).default(''),
        clubName: z.string().trim().max(100).default(''),
        ageGroup: z.string().trim().max(20).default(''),
        description: z.string().trim().max(400).default(''),
    }),
]);

/** GET /api/awards/:edition/admin → { edition, overview } — solo editorial. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ edition: string }> }) {
    const config = await resolveEdition(params);
    if (!config) return jsonError('Esa edición no existe.', 404);
    const editor = await requireAwardsEditor();
    if (editor.ok === false) return editor.response;

    try {
        const [edition, overview] = await Promise.all([getEditionState(config), getAdminOverview(config)]);
        return json({ edition, overview });
    } catch (error) {
        return awardsErrorResponse(error, 'No se pudo cargar el panel.');
    }
}

/**
 * POST /api/awards/:edition/admin { action, ... } — solo editorial.
 *  - build-finalists: cierra postulaciones, fija la terna con los más postulados y abre la votación.
 *  - set-stage: de votación a resultados (y de vuelta).
 *  - set-dates: fechas informativas de cierre.
 *  - moderate-nomination / moderate-play: sacar o devolver una postulación o jugada.
 *  - add-email-play: cargar una jugada que llegó por mail (queda aprobada).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ edition: string }> }) {
    const config = await resolveEdition(params);
    if (!config) return jsonError('Esa edición no existe.', 404);
    const editor = await requireAwardsEditor();
    if (editor.ok === false) return editor.response;

    const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError('Acción inválida.', 400);
    const body = parsed.data;

    try {
        switch (body.action) {
            case 'build-finalists': {
                const result = await buildFinalistsAndOpenVoting(config);
                return json({ ok: true, ...result });
            }
            case 'set-stage': {
                const state = await getEditionState(config);
                if (state.stage === 'postulaciones') {
                    throw new AwardsRuleError('Primero hay que armar la terna.');
                }
                await updateEdition(config.slug, { stage: body.stage });
                return json({ ok: true });
            }
            case 'set-dates': {
                await updateEdition(config.slug, {
                    nominationsCloseAt: body.nominationsCloseAt,
                    votingCloseAt: body.votingCloseAt,
                });
                return json({ ok: true });
            }
            case 'moderate-nomination': {
                if (!getAwardCategory(config, body.category)) return jsonError('Esa categoría no existe.', 400);
                await moderateNomination(config.slug, body.category, body.subjectKey, body.status);
                return json({ ok: true });
            }
            case 'set-editorial': {
                const category = getAwardCategory(config, body.category);
                if (!category) return jsonError('Esa categoría no existe.', 400);
                await setEditorialPick(config, category, { name: body.name, detail: body.detail, note: body.note });
                return json({ ok: true });
            }
            case 'moderate-play': {
                await moderatePlay(config.slug, body.playId, body.status);
                return json({ ok: true });
            }
            case 'add-email-play': {
                const url = cleanHttpUrl(body.url);
                if (!url) return jsonError('El link del video no es válido.', 400);
                await addPlay({
                    edition: config.slug,
                    userId: null,
                    url,
                    title: body.title,
                    clubId: null,
                    clubName: body.clubName || null,
                    ageGroup: body.ageGroup,
                    description: body.description,
                    consent: true,
                    via: 'email',
                });
                return json({ ok: true });
            }
        }
    } catch (error) {
        return awardsErrorResponse(error, 'No se pudo completar la acción.');
    }
}
