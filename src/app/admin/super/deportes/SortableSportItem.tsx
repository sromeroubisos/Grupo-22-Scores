'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
import type { Sport } from '@/lib/types';
import styles from '../page.module.css';

interface SortableSportItemProps {
    sport: {
        id: string;
        name: string;
        icon: string;
        is_visible: boolean;
        display_order: number;
    };
    onToggleVisibility: () => void;
}

export function SortableSportItem({ sport, onToggleVisibility }: SortableSportItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: sport.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 100 : 1,
    };

    return (
        <div 
            ref={setNodeRef} 
            className={`${styles.cardRow} ${!sport.is_visible ? styles.rowDisabled : ''}`}
            style={{ 
                ...style,
                display: 'flex', 
                alignItems: 'center', 
                padding: '12px 16px',
                background: isDragging ? 'var(--basalt-800)' : 'var(--basalt-900)',
                border: isDragging ? '1px solid var(--magma-primary)' : '1px solid var(--surface-edge)',
                borderRadius: '4px',
                gap: '16px'
            }}
        >
            <div 
                {...attributes} 
                {...listeners} 
                style={{ cursor: 'grab', display: 'flex', color: 'var(--basalt-600)' }}
            >
                <GripVertical size={18} />
            </div>

            <div style={{ 
                width: '32px', 
                height: '32px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: 'var(--basalt-800)',
                borderRadius: '4px',
                fontSize: '18px'
            }}>
                {sport.icon}
            </div>

            <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>{sport.name}</span>
                    <span style={{ 
                        fontSize: '10px', 
                        fontFamily: 'var(--font-mono)', 
                        color: 'var(--basalt-600)',
                        textTransform: 'uppercase'
                    }}>
                        {sport.id}
                    </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--basalt-400)' }}>
                    Orden: {sport.display_order} • {sport.is_visible ? 'Visible' : 'Oculto'}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                    onClick={onToggleVisibility}
                    className={styles.btn}
                    style={{ 
                        padding: '6px', 
                        background: sport.is_visible ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: sport.is_visible ? '#10b981' : '#ef4444',
                        border: '1px solid currentColor'
                    }}
                    title={sport.is_visible ? 'Ocultar deporte' : 'Mostrar deporte'}
                >
                    {sport.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
            </div>
        </div>
    );
}
