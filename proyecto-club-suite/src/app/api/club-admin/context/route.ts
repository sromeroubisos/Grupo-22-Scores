import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { getManagedClubSummaries } from '@/lib/club-admin/managedClubFamily';

export async function GET() {
    try {
        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase);
        const payload = await getManagedClubSummaries(supabase as any, context.memberships);

        return NextResponse.json({
            ok: true,
            data: payload,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo resolver el contexto del club';
        const status = message === 'Unauthorized' ? 401 : 500;

        return NextResponse.json(
            {
                ok: false,
                error: message,
            },
            { status }
        );
    }
}
