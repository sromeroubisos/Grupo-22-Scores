'use client';

import { useState } from 'react';
import styles from '../page.module.css';
import { Search, User, Shield, MoreVertical, Filter, Download } from 'lucide-react';

// Tipos para nuestros datos mockeados
type UserType = {
    id: string;
    name: string;
    email: string;
    joinDate: string;
    lastLogin: string;
    status: 'active' | 'suspended';
    avatar?: string;
};

type RoleAssignment = {
    id: string;
    userId: string;
    userName: string;
    email: string;
    role: string;
    scope: string; // e.g., 'Global', 'Torneo: URBA Top 12', 'Club: SIC'
    assignedAt: string;
    status: 'active' | 'inactive';
};

// Mock Data: Todos los usuarios de la web
const allUsers: UserType[] = [
    { id: 'u1', name: 'Juan Perez', email: 'juan@example.com', joinDate: '2025-12-10', lastLogin: 'Hace 2 horas', status: 'active' },
    { id: 'u2', name: 'Maria Lopez', email: 'maria@example.com', joinDate: '2026-01-05', lastLogin: 'Hace 1 día', status: 'active' },
    { id: 'u3', name: 'Carlos Ruiz', email: 'carlos@example.com', joinDate: '2026-01-15', lastLogin: 'Hace 5 días', status: 'active' },
    { id: 'u4', name: 'Ana Garcia', email: 'ana@example.com', joinDate: '2026-02-01', lastLogin: 'Hace 30 min', status: 'active' },
    { id: 'u5', name: 'Luis Torres', email: 'luis@example.com', joinDate: '2026-02-10', lastLogin: 'Hace 1 semana', status: 'suspended' },
];

// Mock Data: Usuarios con roles específicos
const roleAssignments: RoleAssignment[] = [
    { id: 'ra1', userId: 'u2', userName: 'Maria Lopez', email: 'maria@example.com', role: 'Admin Torneo', scope: 'UAR Top 12', assignedAt: '2026-01-10', status: 'active' },
    { id: 'ra2', userId: 'u6', userName: 'Pedro Sanchez', email: 'pedro@club.com', role: 'Prensa Club', scope: 'SIC', assignedAt: '2026-01-20', status: 'active' },
    { id: 'ra3', userId: 'u7', userName: 'Laura Diaz', email: 'laura@urba.com', role: 'Operador', scope: 'URBA', assignedAt: '2026-02-05', status: 'active' },
];

export default function PersonasRolesPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'roles'>('all');

    return (
        <div style={{ paddingBottom: 40 }}>
            {/* Header */}
            <header className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>Gestion de Accesos</p>
                    <h1>Personas y Roles</h1>
                </div>
                <div className={styles.statusSync}>
                    <button className={`${styles.btn} ${styles.btnPrimary}`}>
                        <User size={16} /> Invitar Usuario
                    </button>
                </div>
            </header>

            {/* Navigation Tabs (Optional visual separation, or just stacked lists as requested) */}
            <div className={styles.slab} style={{ marginBottom: 24, padding: '0 24px' }}>
                <div style={{ display: 'flex', gap: 24 }}>
                    <button
                        className={styles.tabInfo}
                        style={{
                            borderBottom: activeTab === 'all' ? '2px solid var(--color-accent)' : '2px solid transparent',
                            color: activeTab === 'all' ? '#fff' : 'var(--basalt-400)',
                            padding: '16px 0',
                            background: 'none',
                            cursor: 'pointer'
                        }}
                        onClick={() => setActiveTab('all')}
                    >
                        Todos los Usuarios ({allUsers.length})
                    </button>
                    <button
                        className={styles.tabInfo}
                        style={{
                            borderBottom: activeTab === 'roles' ? '2px solid var(--color-accent)' : '2px solid transparent',
                            color: activeTab === 'roles' ? '#fff' : 'var(--basalt-400)',
                            padding: '16px 0',
                            background: 'none',
                            cursor: 'pointer'
                        }}
                        onClick={() => setActiveTab('roles')}
                    >
                        Roles Especiales ({roleAssignments.length})
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.slab} style={{ marginBottom: 24 }}>
                <div className={styles.slabHeader} style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className={styles.filterInput} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', width: 300 }}>
                            <Search size={16} style={{ color: '#666', marginRight: 8 }} />
                            <input
                                style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100%' }}
                                placeholder={activeTab === 'all' ? "Buscar usuario por nombre o email..." : "Buscar por rol o scope..."}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button className={styles.btn}>
                            <Filter size={14} /> Filtros
                        </button>
                    </div>
                    <button className={styles.btn}>
                        <Download size={14} /> Exportar CSV
                    </button>
                </div>
            </div>

            {/* Content Lists */}
            <div className={styles.content}>

                {activeTab === 'all' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeaderRow} style={{ marginBottom: 16 }}>
                            <h2 className={styles.sectionTitle}>Directorio de Usuarios Web</h2>
                        </div>
                        <div className={styles.card}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Email</th>
                                        <th>Fecha Registro</th>
                                        <th>Ultimo Acceso</th>
                                        <th>Estado</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allUsers.map((user) => (
                                        <tr key={user.id} className={styles.tableRow}>
                                            <td style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--basalt-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                                                    {user.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <span style={{ fontWeight: 600 }}>{user.name}</span>
                                            </td>
                                            <td style={{ color: 'var(--basalt-400)' }}>{user.email}</td>
                                            <td>{new Date(user.joinDate).toLocaleDateString()}</td>
                                            <td>{user.lastLogin}</td>
                                            <td>
                                                <span
                                                    className={styles.pill}
                                                    style={{
                                                        background: user.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                        color: user.status === 'active' ? '#34d399' : '#f87171',
                                                        border: `1px solid ${user.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                                                    }}
                                                >
                                                    {user.status === 'active' ? 'Activo' : 'Suspendido'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className={styles.btn} style={{ padding: 8 }}>
                                                    <MoreVertical size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {activeTab === 'roles' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeaderRow} style={{ marginBottom: 16 }}>
                            <h2 className={styles.sectionTitle}>Usuarios con Roles Asignados</h2>
                        </div>
                        <div className={styles.card}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Rol Asignado</th>
                                        <th>Alcance (Scope)</th>
                                        <th>Desde</th>
                                        <th>Estado</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {roleAssignments.map((assignment) => (
                                        <tr key={assignment.id} className={styles.tableRow}>
                                            <td style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--basalt-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}>
                                                    {assignment.userName.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{assignment.userName}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--basalt-400)' }}>{assignment.email}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <Shield size={14} color="var(--color-accent)" />
                                                    {assignment.role}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={styles.badge} style={{ background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)', padding: '2px 8px' }}>
                                                    {assignment.scope}
                                                </span>
                                            </td>
                                            <td>{new Date(assignment.assignedAt).toLocaleDateString()}</td>
                                            <td>
                                                <span className={`${styles.pill} ${styles.pillSuccess}`}>ACTIVO</span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ fontSize: 11, padding: '4px 8px', height: 28 }}>
                                                    Editar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
