'use client';

import React from 'react';

export type ParticipantStatus = 'active' | 'inactive' | 'pending' | 'disqualified';

interface ParticipantStatusBadgeProps {
    status: ParticipantStatus | string;
}

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    active: {
        label: 'Activo',
        bg: 'rgba(16, 185, 129, 0.1)',
        text: '#10b981',
        dot: '#10b981',
    },
    inactive: {
        label: 'Inactivo',
        bg: 'rgba(156, 163, 175, 0.1)',
        text: '#9ca3af',
        dot: '#9ca3af',
    },
    pending: {
        label: 'Pendiente',
        bg: 'rgba(245, 158, 11, 0.1)',
        text: '#f59e0b',
        dot: '#f59e0b',
    },
    disqualified: {
        label: 'Descalificado',
        bg: 'rgba(239, 68, 68, 0.1)',
        text: '#ef4444',
        dot: '#ef4444',
    },
};

export function ParticipantStatusBadge({ status }: ParticipantStatusBadgeProps) {
    const config = statusConfig[status.toLowerCase()] || statusConfig.inactive;

    return (
        <span
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
            style={{
                backgroundColor: config.bg,
                color: config.text,
                borderColor: `${config.text}33`, // 20% opacity of the text color
            }}
        >
            <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: config.dot }}
            />
            {config.label}
        </span>
    );
}
