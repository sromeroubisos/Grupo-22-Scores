import { NextResponse } from 'next/server'

/**
 * Retirado. Era un GET con efectos que creaba o reseteaba la cuenta de super
 * admin (contraseña incluida), y lo podia disparar cualquier admin —no solo
 * uno global—, ademas de cualquier link o <img> que un admin abriera con la
 * sesion puesta. El alta del super admin sale del allowlist por email
 * (SUPER_ADMIN_ROLE_EMAILS) y las cuentas de trabajo se crean desde
 * /admin/super/personas-roles/crear.
 *
 * Se deja la ruta contestando 410 en vez de borrarla para que un marcador o un
 * script viejo reciba un "esto ya no existe" claro y no un 404 ambiguo.
 */
function gone() {
    return NextResponse.json(
        { error: 'Este endpoint fue retirado. Las cuentas se gestionan desde /admin/super/personas-roles.' },
        { status: 410 },
    )
}

export const GET = gone
export const POST = gone
