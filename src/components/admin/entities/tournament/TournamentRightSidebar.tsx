'use client';

import Link from 'next/link';
import { Database } from '@/lib/database.types';
import './basalt.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

interface RightSidebarProps {
    id: string;
    data: TournamentRow;
    onDelete: () => void;
}

export function TournamentRightSidebar({ id, data, onDelete }: RightSidebarProps) {
    const validations = [
        {
            label: 'Nombre y slug sincronizados',
            ok: Boolean(data.name && data.slug),
        },
        {
            label: 'Organizador vinculado',
            ok: Boolean(data.union_id),
        },
        {
            label: 'Formato competitivo definido',
            ok: Boolean(data.format),
        },
        {
            label: 'Visibilidad publica definida',
            ok: data.is_visible !== null,
        },
    ];
    const completedValidations = validations.filter((item) => item.ok).length;
    const integrityHash = `${data.id.slice(0, 4).toUpperCase()}:${(data.slug || 'draft').slice(0, 4).toUpperCase()}:${(data.season_id || '--').slice(0, 4).toUpperCase()}:${(data.status || 'draft').slice(0, 4).toUpperCase()}`;

    return (
        <aside className="basalt-sidebar hidden xl:block w-[320px]">
            <div className="sidebar-section basalt-rail-section mb-8">
                <div className="basalt-sidebar-section-header">
                    <span className="basalt-sidebar-title">Quick Validations</span>
                    <span className="basalt-sidebar-section-value">{completedValidations}/{validations.length}</span>
                </div>
                {validations.map((item) => (
                    <div key={item.label} className="basalt-validation-item">
                        <span className={`basalt-validation-icon ${item.ok ? 'is-ok' : 'is-pending'}`}>
                            {item.ok ? '[OK]' : '[--]'}
                        </span>
                        <span>{item.label}</span>
                    </div>
                ))}
            </div>

            <div className="sidebar-section basalt-rail-section mb-8">
                <div className="basalt-sidebar-section-header">
                    <span className="basalt-sidebar-title">Operation Shortcuts</span>
                </div>
                <Link className="basalt-shortcut-btn" href={`/admin/entities/${id}/manage?type=tournament&tab=participantes`}>
                    Edit Participant List
                </Link>
                <Link className="basalt-shortcut-btn" href={`/admin/entities/${id}/manage?type=tournament&tab=estructura`}>
                    Define Competitive Structure
                </Link>
                <Link className="basalt-shortcut-btn" href={`/admin/entities/${id}/manage?type=tournament&tab=operacion`}>
                    Operate Fixture & Table
                </Link>
                <Link className="basalt-shortcut-btn" href={`/admin/entities/${id}/manage?type=tournament&tab=audit`}>
                    Review Audit Trail
                </Link>
            </div>

            <div className="sidebar-section basalt-rail-section mb-8">
                <div className="basalt-sidebar-section-header">
                    <span className="basalt-sidebar-title">Data Integrity</span>
                </div>
                <div className="basalt-integrity-box">
                    <div className="basalt-integrity-label">GLOBAL HASH</div>
                    <div className="basalt-integrity-value">{integrityHash}</div>
                </div>
            </div>

            <div className="sidebar-section basalt-rail-section">
                <div className="basalt-sidebar-section-header">
                    <span className="basalt-sidebar-title">Estado rapido</span>
                </div>
                <div className="basalt-sidebar-status">
                    <strong>{data.status?.toUpperCase() || 'DRAFT'}</strong>
                    <span>{data.is_visible ? 'Visible para publico' : 'Oculto para publico'}</span>
                </div>
            </div>

            <div className="sidebar-section mt-12">
                <button
                    className="basalt-btn basalt-btn-danger w-full justify-center"
                    onClick={onDelete}
                    type="button"
                >
                    BORRAR TORNEO
                </button>
            </div>
        </aside>
    );
}
