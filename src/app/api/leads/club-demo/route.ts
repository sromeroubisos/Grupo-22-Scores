import { NextResponse, type NextRequest } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { notificarLead, type LeadNotificacion } from '@/lib/leads/notifier';
import { erroresPorCampo, leadSchema, MENSAJE_ERROR_GENERICO } from '@/lib/leads/schema';
import { consumeRateLimit } from '@/lib/rateLimit';

/**
 * El alta de un lead de "G22 para clubes".
 *
 * Lo escribe un anónimo, así que el orden importa: honeypot (gratis) → rate
 * limit (barato) → validación (barata) → base (cara). Cobrarle a la base la
 * ráfaga de un bot es exactamente lo que no queremos.
 *
 * **Nunca pierde un lead.** Si la tabla `club_leads` todavía no existe —este
 * repo tiene migraciones sin correr y la de leads se ejecuta a mano en el
 * Studio—, el endpoint NO falla: deja el lead en el log del servidor, avisa por
 * el notificador y le contesta que sí al dirigente. Un formulario que dice
 * "error" porque falta una migración nuestra es un cliente que no vuelve.
 */

const LIMITE_ENVIOS = 5;
const VENTANA_SEGUNDOS = 600;

function getClientIp(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * La tabla no existe todavía. PostgREST lo dice de dos formas según la versión
 * (PGRST205 al no encontrarla en el schema cache, 42P01 de Postgres crudo), y
 * hay instalaciones que sólo lo dejan en el mensaje.
 */
function esTablaFaltante(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    if (error.code === 'PGRST205' || error.code === '42P01') return true;
    const mensaje = (error.message ?? '').toLowerCase();
    return mensaje.includes('could not find the table') || mensaje.includes('does not exist');
}

export async function POST(request: NextRequest) {
    const cuerpo = await request.json().catch(() => null);

    if (!cuerpo || typeof cuerpo !== 'object') {
        return NextResponse.json(
            { ok: false, error: MENSAJE_ERROR_GENERICO },
            { status: 400 },
        );
    }

    // Honeypot. Le contestamos que sí para que el bot no reintente, pero no se
    // guarda nada: un 400 le enseña qué campo tiene que dejar vacío.
    if (typeof (cuerpo as Record<string, unknown>).sitioWeb === 'string'
        && (cuerpo as Record<string, string>).sitioWeb.length > 0) {
        return NextResponse.json({ ok: true, persistido: false });
    }

    const limite = await consumeRateLimit(
        `club-demo:${getClientIp(request)}`,
        LIMITE_ENVIOS,
        VENTANA_SEGUNDOS,
    );
    if (!limite.allowed) {
        return NextResponse.json(
            { ok: false, error: 'Ya recibimos tu pedido. Esperá unos minutos antes de mandar otro.' },
            { status: 429, headers: { 'Retry-After': String(limite.retryAfter ?? VENTANA_SEGUNDOS) } },
        );
    }

    const validado = leadSchema.safeParse(cuerpo);
    if (!validado.success) {
        return NextResponse.json(
            {
                ok: false,
                error: MENSAJE_ERROR_GENERICO,
                errores: erroresPorCampo(validado.error),
            },
            { status: 400 },
        );
    }

    const lead = validado.data;
    const creadoEn = new Date().toISOString();
    let persistido = false;

    try {
        const admin = createAdminClient();
        const { error } = await admin.from('club_leads').insert({
            nombre: lead.nombre,
            organizacion: lead.organizacion,
            rol: lead.rol,
            telefono: lead.telefono,
            email: lead.email || null,
            equipos: lead.equipos,
            mensaje: lead.mensaje || null,
            origen: lead.origen || null,
            referrer: lead.referrer || null,
            // El user agent ayuda a separar un dirigente real de un scraper.
            // La IP NO se guarda: sirve para el rate limit y ahí se queda.
            user_agent: request.headers.get('user-agent')?.slice(0, 400) ?? null,
        });

        if (error) {
            if (esTablaFaltante(error)) {
                console.warn(
                    '[leads] la tabla club_leads no existe todavía; el lead queda sólo en el log. ' +
                    'Corré supabase/migrations/20260822120000_club_leads.sql en el Studio.',
                );
            } else {
                console.error('[leads] no se pudo guardar el lead', error);
            }
        } else {
            persistido = true;
        }
    } catch (error) {
        // Sin service key o sin base: el lead se salva igual por el notificador.
        console.error('[leads] no se pudo escribir en la base', error);
    }

    const notificacion: LeadNotificacion = { ...lead, creadoEn, persistido };

    // `notificarLead` no tira: si el mail falla, deja el lead en el log y
    // devuelve false. Al dirigente le contestamos que sí igual, porque para él
    // el pedido entró — y entró.
    const notificado = await notificarLead(notificacion);

    return NextResponse.json({ ok: true, persistido, notificado });
}
