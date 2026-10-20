'use client';

/**
 * Decide si la home le ofrece el asistente de preferencias a este visitante.
 *
 * Reemplaza a FirstVisitSportPicker (que solo preguntaba el deporte) con las
 * mismas reglas de "no molestar":
 *  - solo en `/`, solo sin sesión (quien tiene cuenta pasa por /onboarding);
 *  - una vez por dispositivo: cerrarlo, salearlo o terminarlo cuenta como respuesta;
 *  - quien ya había elegido deporte con la invitación anterior no se interrumpe:
 *    puede completar el resto desde "Personalizar" en la portada;
 *  - no aparece si entró con ?sport= (dominio satélite);
 *  - recién después de un respiro, para que vea el sitio primero;
 *  - /?sportPicker=1 lo fuerza (QA).
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import PreferencesWizard from '@/components/PreferencesWizard';
import { useAuth } from '@/context/AuthContext';
import { dismissDeviceSportPrompt, shouldPromptForDeviceSport } from '@/lib/deviceSportPreference';
import { hasCompletedLocalOnboarding } from '@/lib/localPreferences';

const APPEAR_DELAY_MS = 1100;

export default function PreferencesGate() {
    const pathname = usePathname();
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const [open, setOpen] = useState(false);
    const onHome = pathname === '/';

    useEffect(() => {
        if (!onHome || authLoading || isAuthenticated) return;

        let forced = false;
        try {
            const params = new URLSearchParams(window.location.search);
            forced = params.get('sportPicker') === '1';
            if (!forced && params.get('sport')) return;
        } catch {
            return;
        }
        if (!forced && (hasCompletedLocalOnboarding() || !shouldPromptForDeviceSport())) return;

        const timer = window.setTimeout(() => {
            // Se pregunta UNA vez: queda anotado al mostrarse, no al responder. Si recarga sin contestar,
            // no vuelve a salir; lo puede hacer cuando quiera desde Favoritos → Editar.
            dismissDeviceSportPrompt();
            setOpen(true);
        }, APPEAR_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [onHome, authLoading, isAuthenticated]);

    // Si inicia sesión con el asistente abierto, o se va de la home, se retira solo.
    const visible = open && onHome && !isAuthenticated;
    if (!visible) return null;

    return <PreferencesWizard variant="overlay" onClose={() => setOpen(false)} />;
}
