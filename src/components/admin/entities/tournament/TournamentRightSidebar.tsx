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

    return (
        <aside className="basalt-sidebar hidden xl:block w-[320px]">
            <div className="sidebar-section basalt-rail-section mb-6">
                <div className="basalt-sidebar-section-header">
                    <span className="basalt-sidebar-title">Chequeos</span>
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

            <div className="sidebar-section basalt-rail-section mb-6">
                <div className="basalt-sidebar-section-header">
                    <span className="basalt-sidebar-title">Atajos</span>
                </div>
                <Link prefetch={false} className="basalt-shortcut-btn" href={`/admin/entities/${id}/manage?type=tournament&tab=participantes`}>
                    Editar participantes
                </Link>
                <Link prefetch={false} className="basalt-shortcut-btn" href={`/admin/entities/${id}/manage?type=tournament&tab=estructura`}>
                    Definir estructura
                </Link>
                <Link prefetch={false} className="basalt-shortcut-btn" href={`/admin/entities/${id}/manage?type=tournament&tab=operacion`}>
                    Operar fixture y tabla
                </Link>
            </div>

            {/* Se retiro el bloque "Data Integrity / GLOBAL HASH": era un hash
                inventado a partir de los primeros caracteres de campos que ya
                estan a la vista, no verificaba nada. */}

            <div className="sidebar-section">
                <button
                    className="basalt-btn basalt-btn-danger w-full justify-center"
                    onClick={onDelete}
                    type="button"
                >
                    Borrar torneo
                </button>
            </div>
        </aside>
    );
}
