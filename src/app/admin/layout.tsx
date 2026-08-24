import type { Metadata } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRequestUserAccessContext, requireRequestUserAccessContext } from '@/lib/auth/permissions';
import { resolveAdminGuardRedirect } from '@/lib/auth/adminGuardRedirect';
import { hasEditorialAccess, hasFederationAdminAccess, resolveAdminPanel } from '@/lib/auth/roles';
import { assertMfaSatisfied } from '@/lib/auth/mfa';
import AdminWrapper from './AdminWrapper';
import { AdminConsoleProvider } from './AdminContext';

export const metadata: Metadata = {
    title: 'Admin Panel - G22 Scores',
    description: 'Panel de administración para gestión de torneos y partidos',
};

/**
 * El rol se chequea acá, en el servidor. Antes vivía solo en AdminWrapper, que
 * es un componente de cliente: el proxy exigía sesión sobre `/admin`, pero
 * cualquier usuario logueado —un fan— recibía igual el payload RSC de estas
 * páginas y el "ACCESS DENIED" era una pantalla pintada encima de datos que ya
 * habían viajado.
 *
 * `/admin/super` y `/admin/torneo` traen ademas su propio guard, mas estricto.
 * Este es el piso comun.
 */
async function resolveAdminAccess() {
    const context = await requireRequestUserAccessContext();

    // El pathname lo reenvia updateSession() en lib/supabase/proxy.ts, y todo
    // `/admin/*` pasa por ahi. Si faltara, `isEditorialRoute` queda en false y
    // el guard pide admin de federacion: falla cerrado, no abierto.
    const pathname = (await headers()).get('x-pathname') || '';
    const isEditorialRoute = pathname === '/admin';

    const allowed =
        hasFederationAdminAccess(context.role, context.memberships) ||
        (isEditorialRoute && hasEditorialAccess(context.role, context.memberships));

    if (!allowed) {
        throw new Error('Forbidden');
    }

    // Recien despues de aprobar el rol: a quien no tiene permiso no hay que
    // pedirle un segundo factor, hay que rebotarlo.
    await assertMfaSatisfied(context.role);
}

/**
 * A donde mandar a alguien que tiene sesion pero no rol para `/admin`.
 *
 * El guard vivia en el cliente y pintaba una tarjeta "ACCESS DENIED" con un
 * boton al panel que SI le corresponde. Al mover el chequeo al servidor esa
 * pantalla ya no se renderiza, asi que el destino se resuelve acá: un
 * admin_club que entra a `/admin` por error termina en `/club-admin`, no
 * tirado en la home sin explicacion. El contexto ya esta memoizado, o sea que
 * este segundo pedido no cuesta nada.
 */
async function resolveDeniedRedirect(error: unknown): Promise<string> {
    const generico = await resolveAdminGuardRedirect(error);

    if (generico !== '/') {
        return generico;
    }

    const context = await getRequestUserAccessContext();
    const panel = resolveAdminPanel(context?.role, context?.memberships)?.href;

    // Solo paneles FUERA de `/admin`. Adentro hay dos trampas: `/admin` a secas
    // se redirige a si mismo (loop), y `/admin/editorial` —el panel que
    // resolveAdminPanel le da a un redactor— no existe como pagina, asi que
    // seria cambiar un rebote por un 404. Quien tiene panel dentro de `/admin`
    // ya paso el guard y nunca llega hasta acá.
    return panel && !panel.startsWith('/admin') ? panel : '/';
}

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    let destino: string | null = null;

    try {
        await resolveAdminAccess();
    } catch (error) {
        // `redirect()` lanza NEXT_REDIRECT: fuera del try, para no atraparlo.
        destino = await resolveDeniedRedirect(error);
    }

    if (destino) {
        redirect(destino);
    }

    return (
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-system-secondary">Cargando...</div>}>
            <AdminConsoleProvider>
                <AdminWrapper>
                    {children}
                </AdminWrapper>
            </AdminConsoleProvider>
        </Suspense>
    );
}
