'use client';

import { useMemo } from 'react';
import { getActiveSports } from '@/lib/data/sports';
import { useDisciplinas } from './DisciplinasContext';
import styles from '../page.module.css';

interface SportFilterProps {
    selectedSport: string;
    onSportChange: (sport: string) => void;
}

export default function SportFilter({ selectedSport, onSportChange }: SportFilterProps) {
    const { clubSports } = useDisciplinas();
    const allSports = useMemo(() => getActiveSports(), []);

    // Filter available sports based on club's registered disciplines
    const availableSports = useMemo(() => {
        const filtered = allSports.filter(s => clubSports.includes(s.id));
        return [{ id: 'all', label: 'Todos los deportes', icon: '🌐' }, ...filtered.map(s => ({
            id: s.id,
            label: s.nameEs || s.name,
            icon: s.icon
        }))];
    }, [allSports, clubSports]);

    return (
        <div className={styles.sportFilter}>
            {availableSports.map((sport) => (
                <button
                    key={sport.id}
                    className={`${styles.sportBtn} ${selectedSport === sport.id ? styles.sportBtnActive : ''}`}
                    onClick={() => onSportChange(sport.id)}
                    type="button"
                >
                    <span className={styles.sportIcon}>{sport.icon}</span>
                    <span className={styles.sportLabel}>{sport.label}</span>
                </button>
            ))}
        </div>
    );
}
