'use client';

import SectionShell from '../components/SectionShell';
import { useManagedClubContext } from '../components/ManagedClubContext';
import { ClubStaffTab } from '@/components/admin/entities/club/ClubStaffTab';
import styles from '../page.module.css';

export default function ClubStaffPage() {
    const { activeClubId, activeClub, loading, error } = useManagedClubContext();

    return (
        <SectionShell
            title="Staff"
            subtitle={activeClub ? `Cuerpo tecnico y staff operativo de ${activeClub.name}.` : 'Cuerpo tecnico y staff operativo del club activo.'}
        >
            {error && (
                <div className={styles.callout}>
                    <span className={styles.calloutTitle}>Club no disponible</span>
                    <p>{error}</p>
                </div>
            )}

            {loading && (
                <div className={styles.emptyPlaceholder}>
                    <p>Cargando club activo...</p>
                </div>
            )}

            {!loading && !activeClubId && !error && (
                <div className={styles.emptyPlaceholder}>
                    <p>No encontramos un club gestionable para cargar staff.</p>
                </div>
            )}

            {!loading && activeClubId && (
                <ClubStaffTab clubId={activeClubId} />
            )}
        </SectionShell>
    );
}
