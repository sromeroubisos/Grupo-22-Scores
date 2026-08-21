'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/AuthContext';
import styles from './GuestExportInvite.module.css';

// El cartel que ve el invitado cuando la placa ya se descargo. Exportar no pide
// cuenta —cualquiera baja su placa— pero ese es el momento en que la cuenta se
// entiende sola: acaba de hacer algo suyo y todavia no tiene donde guardarlo.
//
// Aparece SOLO si no hay sesion, y nunca antes de que el archivo este bajado:
// interrumpir la descarga para pedir un registro es exactamente lo contrario.
// Para entonces el modal de exportar ya se cerro solo —handleExport lo cierra
// antes de dibujar—, asi que el cartel cae sobre la pagina, no sobre el modal.

const TITLE_ID = 'g22-guest-export-invite-title';

export function useGuestExportInvite() {
    const { isAuthenticated } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    const notifyExportFinished = useCallback(() => {
        if (isAuthenticated) return;
        setIsOpen(true);
    }, [isAuthenticated]);

    const close = useCallback(() => setIsOpen(false), []);

    return { isOpen, notifyExportFinished, close };
}

type GuestExportInviteProps = {
    isOpen: boolean;
    onClose: () => void;
};

export default function GuestExportInvite({ isOpen, onClose }: GuestExportInviteProps) {
    const { login } = useAuth();
    const [isPortalReady, setIsPortalReady] = useState(false);

    useEffect(() => {
        setIsPortalReady(true);
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !isPortalReady) return null;

    // Volver a donde estaba: el cartel sale sobre la pagina que se exporto, y
    // mandarlo al inicio despues de loguearse seria perderle el partido que miraba.
    const returnTo = `${window.location.pathname}${window.location.search}`;

    return createPortal(
        <div className={styles.overlay} onClick={onClose}>
            <div
                className={styles.card}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby={TITLE_ID}
            >
                <button className={styles.close} onClick={onClose} type="button" aria-label="Cerrar la invitacion">
                    <X size={16} />
                </button>
                <span className={styles.eyebrow}>Placa descargada</span>
                <h3 className={styles.title} id={TITLE_ID}>
                    Ya la tenes. Con cuenta te queda mejor.
                </h3>
                <p className={styles.text}>
                    Crea tu cuenta y segui a tu club, guarda tus colores y tus placas, y llevalos a cualquier
                    dispositivo. Es gratis y toma un minuto.
                </p>
                <div className={styles.actions}>
                    <Link className={styles.primary} href="/register" onClick={onClose}>
                        Crear cuenta
                    </Link>
                    <button
                        className={styles.secondary}
                        onClick={() => {
                            onClose();
                            login('fan', returnTo);
                        }}
                        type="button"
                    >
                        Ya tengo cuenta
                    </button>
                </div>
                <button className={styles.dismiss} onClick={onClose} type="button">
                    Seguir sin cuenta
                </button>
            </div>
        </div>,
        document.body,
    );
}
