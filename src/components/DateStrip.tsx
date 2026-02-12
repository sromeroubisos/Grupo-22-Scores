'use client';

import { useRef, useEffect, useMemo } from 'react';
import styles from './DateStrip.module.css';
import { generateLocalDateKeys } from '@/lib/timezone';

interface DateStripProps {
    selectedDate: string;
    onSelectDate: (date: string) => void;
    range?: number; // Days to show before/after today
}

export default function DateStrip({ selectedDate, onSelectDate, range = 7 }: DateStripProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

    // Generate dates using timezone-aware keys
    const today = new Date();
    const entries = generateLocalDateKeys(timeZone, -range, range);
    const dates = entries.map(({ dateKey, offset }) => {
        const d = new Date(today);
        d.setDate(today.getDate() + offset);
        return {
            dateObj: d,
            iso: dateKey,
            dayName: d.toLocaleDateString('es-AR', { weekday: 'short', timeZone }).replace('.', ''),
            dayNumber: parseInt(dateKey.split('-')[2], 10),
            isToday: offset === 0,
        };
    });

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
