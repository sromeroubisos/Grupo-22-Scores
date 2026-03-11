'use client';

import { ExternalLink, MoreVertical, Save, Loader2, Globe, Shield, ChevronRight } from 'lucide-react';
import { Database } from '@/lib/database.types';
import { clsx } from 'clsx';
import Link from 'next/link';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubManageHeaderProps {
    id: string;
    data: Partial<ClubRow>;
    isDirty: boolean;
    isSaving: boolean;
    onSave: () => void;
    unionName?: string;
}

export function ClubManageHeader({ id, data, isDirty, isSaving, onSave, unionName }: ClubManageHeaderProps) {
    return (
        <header className="main-header">
            <div className="header-left">
                <div className="club-title">
                    {data.short_name || data.name || 'NUEVO CLUB'}
                    <span className="mono" style={{ color: 'var(--accent)' }}>{new Date().getFullYear()}</span>
                </div>
                <div className="subinfo">
                    {data.categories?.length ? 'Rugby' : 'Deporte'} · {data.country || 'País'} {data.city ? `/ ${data.city}` : ''} {unionName ? `· ${unionName}` : ''}
                </div>
                <div className="badges">
                    <span className={`badge ${data.is_visible ? 'badge-visible' : 'badge-draft'}`}>
                        {data.is_visible ? 'VISIBLE' : 'DRAFT'}
                    </span>
                    <span className="badge badge-health">HEALTH: {id === 'new' ? 'PENDING' : 'OK'}</span>
                </div>
            </div>

            <div className="header-right">
                {isDirty && (
                    <div className="dirty-indicator">
                        <div className="dirty-dot"></div>
                        <span>Cambios sin guardar</span>
                    </div>
                )}

                {data.slug && (
                    <Link
                        href={`/clubs/${data.slug}`}
                        target="_blank"
                        className="btn"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Portal Público
                    </Link>
                )}

                <button
                    onClick={onSave}
                    disabled={isSaving || (!isDirty && id !== 'new')}
                    className="btn btn-primary"
                >
                    {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Save className="w-4 h-4" />
                    )}
                    {isSaving ? 'Guardando...' : 'Guardar'}
                </button>

                <button className="btn">
                    <MoreVertical className="w-4 h-4" />
                </button>
            </div>
        </header>
    );
}
