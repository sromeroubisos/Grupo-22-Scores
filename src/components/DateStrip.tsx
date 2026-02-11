'use client';

import { useRef, useEffect } from 'react';
import styles from './DateStrip.module.css';

interface DateStripProps {
    selectedDate: string;
    onSelectDate: (date: string) => void;
    range?: number; // Days to show before/after today
}

export default function DateStrip({ selectedDate, onSelectDate, range = 7 }: DateStripProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Generate dates
    const dates = [];
    const today = new Date();

    for (let i = -range; i <= range; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dates.push({
            dateObj: d,
            iso: d.toISOString().split('T')[0],
            dayName: d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
            dayNumber: d.getDate(),
            isToday: i === 0,
        });
    }

    // Scroll to selected date on mount
    useEffect(() => {
        if (scrollRef.current) {
            const active = scrollRef.current.querySelector(`.${styles.active}`);
            if (active) {
                active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, []); // Only runs on mount

    return (
        <div className={styles.container} ref={scrollRef}>
            {dates.map((d) => (
                <button
                    key={d.iso}
                    className={`${styles.dateBtn} ${selectedDate === d.iso ? styles.active : ''}`}
                    onClick={() => onSelectDate(d.iso)}
                >
                    {d.isToday ? (
                        <span className={styles.todayBadge}>HOY</span>
                    ) : (
                        <span className={styles.dayName}>{d.dayName}</span>
                    )}
                    <span className={styles.dayNumber}>{d.dayNumber}</span>
                </button>
            ))}
        </div>
    );
}
