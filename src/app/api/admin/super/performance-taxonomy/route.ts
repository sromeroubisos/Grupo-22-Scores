import { NextRequest, NextResponse } from 'next/server';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { DEFAULT_RUGBY_TAXONOMY, type RugbyTaxonomyItem } from '@/lib/performance/rugbyStaff';
import {
    getRugbyMatchEventTaxonomy,
    isMissingRugbyPerformanceTableError,
    saveRugbyMatchEventTaxonomy,
} from '@/lib/performance/rugbyStaffStore';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeTaxonomyItem(value: unknown): RugbyTaxonomyItem | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const moduleKey = normalizeText(candidate.moduleKey);
    const eventKey = normalizeText(candidate.eventKey);
    const label = normalizeText(candidate.label);

    if (!moduleKey || !eventKey || !label) {
        return null;
    }

    return {
        id: normalizeText(candidate.id) || `default-${moduleKey}-${eventKey}`,
        moduleKey,
        eventKey,
        label,
        description: normalizeText(candidate.description),
        enabled: candidate.enabled !== false,
        config: candidate.config && typeof candidate.config === 'object' && !Array.isArray(candidate.config)
            ? candidate.config as Record<string, unknown>
            : {},
    };
}

function missingTableResponse() {
    return NextResponse.json({
        ok: true,
        data: DEFAULT_RUGBY_TAXONOMY,
        warning: 'Falta rugby_match_event_taxonomy. Ejecuta la migracion 20260428090000_staff_performance_rugby.sql para persistir cambios.',
    });
}

export async function GET() {
    const supabase = await createClient();
    const context = await requireGlobalAdminContext(supabase).catch(() => null);
    if (!context) return err('Unauthorized', 401);

    try {
        const data = await getRugbyMatchEventTaxonomy();
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (isMissingRugbyPerformanceTableError(error)) {
            return missingTableResponse();
        }

        const message = error instanceof Error ? error.message : 'No se pudo cargar la taxonomia de eventos';
        return err(message, 500);
    }
}

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const context = await requireGlobalAdminContext(supabase).catch(() => null);
    if (!context) return err('Unauthorized', 401);

    try {
        const body = await request.json() as Record<string, unknown>;
        const items = Array.isArray(body.items)
            ? body.items.map(normalizeTaxonomyItem).filter((item): item is RugbyTaxonomyItem => Boolean(item))
            : [];

        if (items.length === 0) {
            return err('items payload required', 400);
        }

        const data = await saveRugbyMatchEventTaxonomy(items, context.userId);
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (isMissingRugbyPerformanceTableError(error)) {
            return err('Falta rugby_match_event_taxonomy. Ejecuta la migracion de rendimiento avanzado.', 503);
        }

        const message = error instanceof Error ? error.message : 'No se pudo guardar la taxonomia de eventos';
        return err(message, 500);
    }
}
