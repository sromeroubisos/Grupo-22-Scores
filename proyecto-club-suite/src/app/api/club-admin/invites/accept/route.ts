import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

const acceptSchema = z.object({
    token: z.string().min(1),
});

export async function POST(request: NextRequest) {
    try {
        const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return err('Token requerido', 400);
        }

        const { token } = parsed.data;

        const supabase = await createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            return err('No autenticado', 401);
        }

        const admin = createAdminClient();

        // Buscar el link de invitación
        const { data: invite, error: inviteError } = await admin
            .from('club_invite_links')
            .select('id, club_id, scope_type, scope_id, role, expires_at, max_uses, use_count')
            .eq('token', token)
            .maybeSingle();

        if (inviteError) throw inviteError;
        if (!invite) {
            return err('El link de invitacion no existe o fue revocado', 404);
        }

        // Verificar expiración
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return err('El link de invitacion expiro', 410);
        }

        // Verificar usos máximos
        if (invite.max_uses !== null && invite.max_uses !== undefined && (invite.use_count ?? 0) >= invite.max_uses) {
            return err('El link de invitacion ya alcanzo el limite de usos', 410);
        }

        // Verificar si el usuario ya tiene membership en este scope
        const { data: existingMembership, error: existingError } = await admin
            .from('memberships')
            .select('id')
            .eq('user_id', user.id)
            .eq('scope_type', invite.scope_type)
            .eq('scope_id', invite.scope_id)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existingMembership) {
            // Actualizar rol si ya existe
            const { error: updateError } = await admin
                .from('memberships')
                .update({ role: invite.role })
                .eq('id', existingMembership.id);

            if (updateError) throw updateError;
        } else {
            // Crear nueva membership
            const { error: insertError } = await admin
                .from('memberships')
                .insert({
                    user_id: user.id,
                    scope_type: invite.scope_type,
                    scope_id: invite.scope_id,
                    role: invite.role,
                });

            if (insertError) throw insertError;
        }

        // Marcar el link como usado (incrementar contador y registrar primer uso)
        const updates: Record<string, unknown> = {
            use_count: (invite.use_count ?? 0) + 1,
        };

        if ((invite.use_count ?? 0) === 0) {
            updates.used_by = user.id;
            updates.used_at = new Date().toISOString();
        }

        const { error: linkUpdateError } = await admin
            .from('club_invite_links')
            .update(updates)
            .eq('id', invite.id);

        if (linkUpdateError) throw linkUpdateError;

        return NextResponse.json({
            ok: true,
            data: {
                scopeType: invite.scope_type,
                scopeId: invite.scope_id,
                role: invite.role,
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo aceptar la invitacion';
        return err(message, 500);
    }
}
