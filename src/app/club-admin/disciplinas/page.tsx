'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { getActiveSports } from '@/lib/data/sports';
import { useDisciplinas } from '../components/DisciplinasContext';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';

const normalizeLabel = (value: string) => value
    .replace(/\u00c3\u00a1/g, '\u00e1')
    .replace(/\u00c3\u00a9/g, '\u00e9')
    .replace(/\u00c3\u00ad/g, '\u00ed')
    .replace(/\u00c3\u00b3/g, '\u00f3')
    .replace(/\u00c3\u00ba/g, '\u00fa')
    .replace(/\u00c3\u00b1/g, '\u00f1')
    .replace(/\u00c3\u0081/g, '\u00c1')
    .replace(/\u00c3\u0089/g, '\u00c9')
    .replace(/\u00c3\u008d/g, '\u00cd')
    .replace(/\u00c3\u0093/g, '\u00d3')
    .replace(/\u00c3\u009a/g, '\u00da')
    .replace(/\u00c3\u0091/g, '\u00d1')
    .replace(/\u00e2\u0080\u0094/g, '\u2014')
    .replace(/\u00e2\u0080\u00a2/g, '\u2022');

export default function ClubDisciplinasPage() {
    const { clubSports, addClubSport, removeClubSport } = useDisciplinas();
    const sports = useMemo(() => getActiveSports(), []);
    const [selectedSportId, setSelectedSportId] = useState(sports[0]?.id ?? '');
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const selectedSport = sports.find((sport: any) => sport.id === selectedSportId);
    const canAdd = Boolean(selectedSportId) && !clubSports.includes(selectedSportId);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <SectionShell
            title="Disciplinas"
            subtitle={'Gesti\u00f3n de deportes y ramas activas del club.'}
            actions={
                <>
                    <div className={styles.formField} ref={menuRef}>
                        <label className={styles.formLabel}>Agregar deporte</label>
                        <button
                            type="button"
                            className={styles.selectButton}
                            onClick={() => setOpen((prev) => !prev)}
                            aria-expanded={open}
                        >
                            <span className={styles.selectLabel}>
                                <span className={styles.selectIcon}>{selectedSport?.icon}</span>
                                {normalizeLabel(selectedSport?.nameEs || selectedSport?.name || 'Seleccionar')}
                            </span>
                            <span className={styles.selectChevron} />
                        </button>
                        {open && (
                            <div className={styles.selectMenu} role="listbox">
                                {sports.map((sport) => (
                                    <button
                                        key={sport.id}
                                        type="button"
                                        className={`${styles.selectItem} ${sport.id === selectedSportId ? styles.selectItemActive : ''}`}
                                        onClick={() => {
                                            setSelectedSportId(sport.id);
                                            setOpen(false);
                                        }}
                                        role="option"
                                        aria-selected={sport.id === selectedSportId}
                                    >
                                        <span className={styles.selectIcon}>{sport.icon}</span>
                                        {normalizeLabel(sport.nameEs || sport.name)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        className={styles.btn}
                        type="button"
                        disabled={!canAdd}
                        title={!canAdd ? 'El deporte ya est\u00e1 agregado' : undefined}
                        onClick={() => {
                            if (!canAdd) return;
                            addClubSport(selectedSportId);
                            setOpen(false);
                        }}
                    >
                        Agregar deporte
                    </button>
                </>
            }
        >
            <div className={styles.sectionGrid}>
                <div className={styles.glassCard}>
                    <h2 className={styles.cardTitle}>Listado de disciplinas</h2>
                    <p className={styles.cardMeta}>{'Rugby, Hockey, B\u00e1squet, F\u00fatbol, entre otras.'}</p>
                    <div className={styles.chipRow}>
                        {clubSports.length === 0 ? (
                            <span className={styles.emptyState}>{'A\u00fan no hay disciplinas agregadas.'}</span>
                        ) : (
                            clubSports.map((sportId: string) => {
                                const sport = sports.find((item: any) => item.id === sportId);
                                return (
                                    <span key={sportId} className={styles.chip}>
                                        <span className={styles.chipIcon}>{sport?.icon}</span>
                                        {normalizeLabel(sport?.nameEs || sport?.name || '')}
                                        <button
                                            type="button"
                                            className={styles.chipRemove}
                                            onClick={() => removeClubSport(sportId)}
                                            title="Eliminar disciplina"
                                        >
                                            ×
                                        </button>
                                    </span>
                                );
                            })
                        )}
                    </div>
                </div>
                <div className={styles.glassCard}>
                    <h2 className={styles.cardTitle}>{'Ramas y categor\u00edas'}</h2>
                    <p className={styles.cardMeta}>{'Masculino, femenino, juveniles y recreativo.'}</p>
                </div>
            </div>
        </SectionShell>
    );
}
