'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SectionShell from '../components/SectionShell';
import SportFilter from '../components/SportFilter';
import styles from '../page.module.css';
import { useDisciplinas } from '../components/DisciplinasContext';
import { useAuth } from '@/context/AuthContext';

const INITIAL_STAFF = [
    { id: 1, name: 'Pablo Bouza', sport: 'rugby', role: 'Head Coach', division: 'Primera', email: 'pbouza@sic.com.ar', status: 'active' },
    { id: 2, name: 'Marcelo Gallardo', sport: 'football', role: 'Manager', division: 'Primera A', email: 'doll@club.com', status: 'active' },
    { id: 3, name: 'Chapa Retegui', sport: 'hockey', role: 'Entrenador asistente', division: 'Pro-A', email: 'chapa@club.com', status: 'active' },
    { id: 4, name: 'Andrea Pellegrini', sport: 'rugby', role: 'Coordinador ofensivo', division: 'Todas', email: 'apellegrini@sic.com.ar', status: 'active' },
    { id: 5, name: 'Juan Perez', sport: 'football', role: 'Preparador Fisico', division: 'Reserva A', email: 'jp@club.com', status: 'inactive' },
    { id: 6, name: 'Lucia Soto', sport: 'rugby', role: 'Coordinador defensivo', division: 'M19', email: 'lsoto@sic.com.ar', status: 'active' },
    { id: 7, name: 'Martin Vega', sport: 'football', role: 'Utilero', division: 'Primera', email: 'mvega@club.com', status: 'active' },
];

export default function ClubStaffPage() {
    const router = useRouter();
    const { login } = useAuth();
    const { clubSports } = useDisciplinas();
    const [staff, setStaff] = useState(INITIAL_STAFF);
    const [selectedSport, setSelectedSport] = useState('all');
    const [search, setSearch] = useState('');

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState<any>(null);

    const filtered = staff.filter((s) => {
        const matchSport = selectedSport === 'all' || s.sport === selectedSport;
        const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase());
        return matchSport && matchSearch;
    });

    const handleEditClick = (member: any) => {
        setEditingStaff({ ...member });
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = () => {
        setStaff(prev => prev.map(s => s.id === editingStaff.id ? editingStaff : s));
        setIsEditModalOpen(false);
        setEditingStaff(null);
    };

    const handleDelete = (id: number) => {
        if (confirm('¿Estás seguro de que deseas quitar a este integrante del staff?')) {
            setStaff(prev => prev.filter(s => s.id !== id));
        }
    };

    const handleStartAs = (mode: 'coach' | 'player') => {
        if (mode === 'coach') {
            login('entrenador');
            router.push('/entrenador');
            return;
        }
        login('jugador');
        window.location.href = '/jugadores';
    };

    return (
        <SectionShell
            title="Staff"
            subtitle="Cuerpo técnico de entrenadores y staff operativo."
            actions={
                <Link href="/club-admin/staff/nuevo" className={styles.btn}>
                    + Agregar cuerpo técnico
                </Link>
            }
        >
            <SportFilter
                selectedSport={selectedSport}
                onSportChange={setSelectedSport}
            />

            <div className={styles.callout} style={{ marginBottom: 16 }}>
                <span className={styles.calloutTitle}>Inicio rápido</span>
                <p>Simulá el acceso como entrenador o jugador para revisar permisos y vistas.</p>
                <div className={styles.detailActions} style={{ marginTop: 12 }}>
                    <button className={styles.btn} type="button" onClick={() => handleStartAs('coach')}>
                        Iniciar como entrenador
                    </button>
                    <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => handleStartAs('player')}>
                        Iniciar como jugador
                    </button>
                </div>
            </div>

            <div className={styles.searchBar}>
                <input
                    className={styles.searchInput}
                    placeholder="Buscar por nombre o rol..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className={styles.glassCard}>
                <table className={styles.table}>
                    <thead>
                        <tr><th>Nombre</th><th>Deporte</th><th>Rol</th><th>División</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                        {filtered.map((s) => (
                            <tr key={s.id}>
                                <td>
                                    <div className={styles.personRow}>
                                        <div className={styles.avatar}>{s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                                    </div>
                                </td>
                                <td>
                                    <span className={`${styles.badge} ${styles.badgeNeutral}`}>
                                        {s.sport.charAt(0).toUpperCase() + s.sport.slice(1)}
                                    </span>
                                </td>
                                <td>{s.role}</td>
                                <td>{s.division}</td>
                                <td><span className={`${styles.badge} ${s.status === 'active' ? styles.badgeSuccess : styles.badgeNeutral}`}>{s.status === 'active' ? 'Activo' : 'Inactivo'}</span></td>
                                <td>
                                    <div className={styles.listItemActions}>
                                        <button
                                            className={styles.btnSmall}
                                            type="button"
                                            onClick={() => handleEditClick(s)}
                                        >
                                            Editar
                                        </button>
                                        <button
                                            className={`${styles.btnSmall} ${styles.btnDanger}`}
                                            type="button"
                                            onClick={() => handleDelete(s.id)}
                                        >
                                            Quitar
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && <div className={styles.emptyPlaceholder}><p>No se encontró staff con esos criterios</p></div>}
            </div>

            {/* EDIT MODAL */}
            {isEditModalOpen && editingStaff && (
                <div className={styles.modalOverlay} onClick={() => setIsEditModalOpen(false)}>
                    <div className={styles.modalCard} style={{ width: '600px' }} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 className={styles.cardTitle}>Editar Staff</h2>
                                <p className={styles.cardMeta}>Modifica los datos de {editingStaff.name}</p>
                            </div>
                            <button className={styles.btnGhost} onClick={() => setIsEditModalOpen(false)}>Cerrar</button>
                        </div>

                        <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Nombre Completo</label>
                                <input
                                    className={styles.formInput}
                                    value={editingStaff.name}
                                    onChange={e => setEditingStaff({ ...editingStaff, name: e.target.value })}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Email</label>
                                <input
                                    className={styles.formInput}
                                    value={editingStaff.email}
                                    onChange={e => setEditingStaff({ ...editingStaff, email: e.target.value })}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Deporte</label>
                                <select
                                    className={styles.formInput}
                                    value={editingStaff.sport}
                                    onChange={e => setEditingStaff({ ...editingStaff, sport: e.target.value })}
                                >
                                    {clubSports.map(sport => (
                                        <option key={sport} value={sport}>{sport.charAt(0).toUpperCase() + sport.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Rol</label>
                                <input
                                    className={styles.formInput}
                                    value={editingStaff.role}
                                    onChange={e => setEditingStaff({ ...editingStaff, role: e.target.value })}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>División</label>
                                <input
                                    className={styles.formInput}
                                    value={editingStaff.division}
                                    onChange={e => setEditingStaff({ ...editingStaff, division: e.target.value })}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Estado</label>
                                <select
                                    className={styles.formInput}
                                    value={editingStaff.status}
                                    onChange={e => setEditingStaff({ ...editingStaff, status: e.target.value })}
                                >
                                    <option value="active">Activo</option>
                                    <option value="inactive">Inactivo</option>
                                </select>
                            </div>
                        </div>

                        <div className={styles.modalFooter} style={{ marginTop: '24px' }}>
                            <button
                                className={`${styles.btnSmall} ${styles.btnGhost}`}
                                onClick={() => setIsEditModalOpen(false)}
                            >
                                Cancelar
                            </button>
                            <button className={styles.btn} onClick={handleSaveEdit}>
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SectionShell>
    );
}
