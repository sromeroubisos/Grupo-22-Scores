'use client';

import { useEffect } from 'react';

export function useLeaveConfirm(isDirty: boolean, message = 'Tienes cambios sin guardar. ¿Estás seguro de que quieres salir?') {
    useEffect(() => {
        // Handle native window close / reload
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        };

        // Handle soft navigation clicks on any link
        const handleClick = (e: MouseEvent) => {
            if (!isDirty) return;
            const target = (e.target as Element).closest('a');
            if (target && target.href) {
                // If it's a different URL, confirm
                if (target.origin === window.location.origin) {
                    if (!window.confirm(message)) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('click', handleClick, { capture: true });

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('click', handleClick, { capture: true });
        };
    }, [isDirty, message]);
}
