'use client';

import React from 'react';
import { Badge } from './Badge';

export type ParticipantStatus = 'active' | 'inactive' | 'pending' | 'disqualified';

interface ParticipantStatusBadgeProps {
  status: ParticipantStatus | string;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'default' | 'warning' | 'danger' }> = {
  active: { label: 'Activo', variant: 'success' },
  inactive: { label: 'Inactivo', variant: 'default' },
  pending: { label: 'Pendiente', variant: 'warning' },
  disqualified: { label: 'Descalificado', variant: 'danger' },
};

export function ParticipantStatusBadge({ status }: ParticipantStatusBadgeProps) {
  const config = statusConfig[status.toLowerCase()] || statusConfig.inactive;

  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  );
}
