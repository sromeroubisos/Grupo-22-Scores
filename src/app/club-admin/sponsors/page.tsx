'use client';

import { useState } from 'react';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';

type SponsorTier = 'principal' | 'oro' | 'plata' | 'colaborador';
type SponsorStatus = 'active' | 'expired' | 'pending';

const mockSponsors = [
    { id: 1, name: 'Star+', tier: 'principal' as SponsorTier, status: 'active' as SponsorStatus, contract: '2025-03 a 2027-03', placement: 'Camiseta Principal', logo: true },
    { id: 2, name: 'Banco Galicia', tier: 'oro' as SponsorTier, status: 'active' as SponsorStatus, contract: '2025-01 a 2026-12', placement: 'Manga izquierda', logo: true },
    { id: 3, name: 'Swiss Medical', tier: 'oro' as SponsorTier, status: 'active' as SponsorStatus, contract: '2025-06 a 2026-06', placement: 'Espalda', logo: true },
    { id: 4, name: 'Quilmes', tier: 'plata' as SponsorTier, status: 'active' as SponsorStatus, contract: '2026-01 a 2026-12', placement: 'Short', logo: true },
    { id: 5, name: 'Topper', tier: 'plata' as SponsorTier, status: 'active' as SponsorStatus, contract: '2025-01 a 2027-12', placement: 'Indumentaria', logo: true },
    { id: 6, name: 'Inmobiliaria Norte', tier: 'colaborador' as SponsorTier, status: 'active' as SponsorStatus, contract: '2026-01 a 2026-06', placement: 'Cartel cancha', logo: false },
    { id: 7, name: 'Cerveceria Patagonia', tier: 'plata' as SponsorTier, status: 'expired' as SponsorStatus, contract: '2024-01 a 2025-12', placement: 'Manga derecha', logo: true },
    { id: 8, name: 'Auto Lider SA', tier: 'colaborador' as SponsorTier, status: 'pending' as SponsorStatus, contract: 'Pendiente', placement: 'Por definir', logo: false },
];

const tierLabels: Record<SponsorTier, { label: string; cls: string }> = {
    principal: { label: 'Principal', cls: 'badgeDanger' },
    oro: { label: 'Oro', cls: 'badgeWarning' },
    plata: { label: 'Plata', cls: 'badgeInfo' },
    colaborador: { label: 'Colaborador', cls: 'badgeNeutral' },
};
const statusLabels: Record<SponsorStatus, { label: string; cls: string }> = {
    active: { label: 'Activo', cls: 'badgeSuccess' },
    expired: { label: 'Vencido', cls: 'badgeDanger' },
    pending: { label: 'Pendiente', cls: 'badgeWarning' },
};

export default function ClubSponsorsPage() {
    const [tab, setTab] = useState<string>('all');
    const [sponsors, setSponsors] = useState(mockSponsors);
    const [showSponsorModal, setShowSponsorModal] = useState(false);
    const [sponsorDraft, setSponsorDraft] = useState({
        id: null as number | null,
        name: '',
        tier: 'principal' as SponsorTier,
        status: 'active' as SponsorStatus,
        contract: '',
        placement: '',
        logo: false,
    });

    const filtered = sponsors.filter((s) => {
        if (tab === 'all') return true;
        if (tab === 'active' || tab === 'expired' || tab === 'pending') return s.status === tab;
        return s.tier === tab;
    });
    const activeCount = sponsors.filter(s => s.status === 'active').length;

    const openSponsorModal = (sponsor?: typeof mockSponsors[number]) => {
        if (sponsor) {
            setSponsorDraft({
                id: sponsor.id,
                name: sponsor.name,
                tier: sponsor.tier,
                status: sponsor.status,
                contract: sponsor.contract,
                placement: sponsor.placement,
                logo: sponsor.logo,
            });
        } else {
            setSponsorDraft({
                id: null,
                name: '',
                tier: 'principal',
                status: 'active',
                contract: '',
                placement: '',
                logo: false,
            });
        }
        setShowSponsorModal(true);
    };

    const handleSaveSponsor = () => {
        if (!sponsorDraft.name.trim()) {
            alert('Completá el nombre del sponsor.');
            return;
        }
        const payload = {
            id: sponsorDraft.id ?? Date.now(),
            name: sponsorDraft.name.trim(),
            tier: sponsorDraft.tier,
            status: sponsorDraft.status,
            contract: sponsorDraft.contract || 'Pendiente',
            placement: sponsorDraft.placement || 'Por definir',
            logo: sponsorDraft.logo,
        };
        setSponsors((prev) => {
            if (sponsorDraft.id) {
                return prev.map((s) => (s.id === sponsorDraft.id ? payload : s));
            }
            return [payload, ...prev];
        });
        setShowSponsorModal(false);
    };

    return (
        <SectionShell
            title="Sponsors"
            subtitle={`${activeCount} sponsors activos de ${sponsors.length} totales.`}
            actions={<button className={styles.btn} type="button" onClick={() => openSponsorModal()}>Agregar sponsor</button>}
        >
            {showSponsorModal && (
                <div className={styles.modalOverlay} onClick={() => setShowSponsorModal(false)}>
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>{sponsorDraft.id ? 'Editar sponsor' : 'Nuevo sponsor'}</h2>
                                <p className={styles.cardMeta}>Datos comerciales y visibilidad.</p>
                            </div>
                            <button className={styles.btnGhost} type="button" onClick={() => setShowSponsorModal(false)}>Cerrar</button>
                        </div>
                        <div className={styles.formGrid}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Nombre</label>
                                <input className={styles.formInput} value={sponsorDraft.name} onChange={(e) => setSponsorDraft((prev) => ({ ...prev, name: e.target.value }))} />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Nivel</label>
                                <select className={styles.formInput} value={sponsorDraft.tier} onChange={(e) => setSponsorDraft((prev) => ({ ...prev, tier: e.target.value as SponsorTier }))}>
                                    <option value="principal">Principal</option>
                                    <option value="oro">Oro</option>
                                    <option value="plata">Plata</option>
                                    <option value="colaborador">Colaborador</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Estado</label>
                                <select className={styles.formInput} value={sponsorDraft.status} onChange={(e) => setSponsorDraft((prev) => ({ ...prev, status: e.target.value as SponsorStatus }))}>
                                    <option value="active">Activo</option>
                                    <option value="expired">Vencido</option>
                                    <option value="pending">Pendiente</option>
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Contrato</label>
                                <input className={styles.formInput} value={sponsorDraft.contract} onChange={(e) => setSponsorDraft((prev) => ({ ...prev, contract: e.target.value }))} placeholder="2026-01 a 2027-01" />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Ubicación</label>
                                <input className={styles.formInput} value={sponsorDraft.placement} onChange={(e) => setSponsorDraft((prev) => ({ ...prev, placement: e.target.value }))} placeholder="Camiseta / Cartel / Short" />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Logo cargado</label>
                                <label className={styles.checkboxRow}>
                                    <input
                                        type="checkbox"
                                        checked={sponsorDraft.logo}
                                        onChange={(e) => setSponsorDraft((prev) => ({ ...prev, logo: e.target.checked }))}
                                    />
                                    <span>Logo disponible</span>
                                </label>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.btnGhost} type="button" onClick={() => setShowSponsorModal(false)}>Cancelar</button>
                            <button className={styles.btn} type="button" onClick={handleSaveSponsor}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}
            <div className={styles.tabs}>
                {[['all', 'Todos'], ['active', 'Activos'], ['principal', 'Principal'], ['oro', 'Oro'], ['plata', 'Plata'], ['colaborador', 'Colaborador'], ['expired', 'Vencidos']].map(([key, label]) => (
                    <button key={key} className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`} onClick={() => setTab(key)} type="button">{label}</button>
                ))}
            </div>
            <div className={styles.glassCard}>
                <table className={styles.table}>
                    <thead><tr><th>Sponsor</th><th>Nivel</th><th>Contrato</th><th>Ubicacion</th><th>Logo</th><th>Estado</th><th></th></tr></thead>
                    <tbody>
                        {filtered.map((s) => (
                            <tr key={s.id}>
                                <td style={{ fontWeight: 600 }}>{s.name}</td>
                                <td><span className={`${styles.badge} ${styles[tierLabels[s.tier].cls as keyof typeof styles] || ''}`}>{tierLabels[s.tier].label}</span></td>
                                <td className={styles.mono} style={{ fontSize: 12 }}>{s.contract}</td>
                                <td>{s.placement}</td>
                                <td><span className={`${styles.badge} ${s.logo ? styles.badgeSuccess : styles.badgeNeutral}`}>{s.logo ? 'Cargado' : 'Falta'}</span></td>
                                <td><span className={`${styles.badge} ${styles[statusLabels[s.status].cls as keyof typeof styles] || ''}`}>{statusLabels[s.status].label}</span></td>
                                <td><button className={styles.btnSmall} type="button" onClick={() => openSponsorModal(s)}>Editar</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && <div className={styles.emptyPlaceholder}><p>No hay sponsors en esta categoria</p></div>}
            </div>
        </SectionShell>
    );
}

