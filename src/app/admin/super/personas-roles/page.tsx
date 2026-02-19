'use client';

import { useState, useEffect } from 'react';
import styles from '../page.module.css';
import { Search, User as UserIcon, Shield, MoreVertical, Filter, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User as AppUser, UserRole } from '@/lib/types/user';

// Extended type for display
interface ExtendedUser extends AppUser {
    status?: 'active' | 'suspended';
}

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

export default function PersonasRolesPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'roles'>('all');

    // Data state
    const [users, setUsers] = useState<ExtendedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);

        // Add timeout to prevent infinite hanging due to potential RLS recursion
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 5000); // 5 seconds timeout

        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: false })
                .abortSignal(abortController.signal);

            clearTimeout(timeoutId);

            if (error) throw error;

            // Map and enhance user data (defaulting status to active for now)
            const mappedUsers: ExtendedUser[] = (data || []).map((u: any) => ({
                ...u,
                status: 'active' // In a real app field could be 'status' or 'banned_at'
            }));

            setUsers(mappedUsers);
        } catch (err: any) {
            console.error('Error fetching users:', err);
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                setError('La consulta tardó demasiado. Esto suele indicar un problema de "recursión infinita" en las políticas de seguridad de la base de datos (RLS). Por favor ejecuta el script de corrección en Supabase.');
            } else {
                setError(err.message || 'Error desconocido al cargar usuarios');
            }
        } finally {
            setLoading(false);
            console.log('Fetch users finished');
        }
    };

    // Filter logic
    const filteredUsers = users.filter(user => {
        const query = searchQuery.toLowerCase();
        return (
            user.name?.toLowerCase().includes(query) ||
            user.email?.toLowerCase().includes(query) ||
            user.role?.toLowerCase().includes(query)
        );
    });

    // Derive role assignments from users with special roles
    const derivedRoleAssignments: RoleAssignment[] = users
        .filter(u => u.role && u.role !== 'fan' && u.role !== 'user')
        .map(u => ({
            id: `role-${u.id}`,
            userId: u.id,
            userName: u.name || 'Usuario',
            email: u.email || '',
            role: u.role,
            scope: u.role === 'super_admin' ? 'Global' : 'N/A', // Simple scope logic for now
            assignedAt: u.created_at, // Using created_at as proxy
            status: 'active'
        }));

    return (
        <div style={{ paddingBottom: 40 }}>
            {/* Header */}
            <header className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>Gestion de Accesos</p>
                    <h1>Personas y Roles</h1>
                </div>
                <div className={styles.statusSync}>
                    <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => alert('Función de invitación pendiente')}>
                        <UserIcon size={16} /> Invitar Usuario
                    </button>
                </div>
            </header>

            {/* Navigation Tabs */}
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
                        Todos los Usuarios ({users.length})
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
                        Roles Especiales ({derivedRoleAssignments.length})
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
                                placeholder={activeTab === 'all' ? "Buscar usuario por nombre o email..." : "Buscar por rol..."}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button className={styles.btn}>
                            <Filter size={14} /> Filtros
                        </button>
                    </div>
                    <button className={styles.btn} onClick={fetchUsers}>
                        <Download size={14} /> Recargar
                    </button>
                </div>
            </div>

            {/* Content Lists */}
            <div className={styles.content}>
                {loading && <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Cargando usuarios...</div>}

                {error && (
                    <div style={{ padding: 20, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, marginBottom: 20 }}>
                        Error al cargar usuarios: {error}
                    </div>
                )}

                {!loading && !error && activeTab === 'all' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeaderRow} style={{ marginBottom: 16 }}>
                            <h2 className={styles.sectionTitle}>Directorio de Usuarios ({filteredUsers.length})</h2>
                        </div>
                        <div className={styles.card}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Email</th>
                                        <th>Rol</th>
                                        <th>Fecha Registro</th>
                                        <th>Ultimo Acceso</th>
                                        <th>Estado</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                                                No se encontraron usuarios
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUsers.map((user) => (
                                            <tr key={user.id} className={styles.tableRow}>
                                                <td style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: '50%',
                                                        background: 'var(--basalt-800)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 12, fontWeight: 700,
                                                        overflow: 'hidden'
                                                    }}>
                                                        {user.avatar_url ? (
                                                            <img src={user.avatar_url} alt={user.name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            (user.name || user.email || '?').substring(0, 2).toUpperCase()
                                                        )}
                                                    </div>
                                                    <span style={{ fontWeight: 600 }}>{user.name || user.email || 'Sin nombre'}</span>
                                                </td>
                                                <td style={{ color: 'var(--basalt-400)' }}>{user.email}</td>
                                                <td>
                                                    <span className={styles.badge} style={{
                                                        background: user.role === 'super_admin' ? 'var(--color-accent)' : 'var(--basalt-800)',
                                                        color: user.role === 'super_admin' ? '#000' : '#fff'
                                                    }}>
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                                <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : '-'}</td>
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
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {!loading && !error && activeTab === 'roles' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeaderRow} style={{ marginBottom: 16 }}>
                            <h2 className={styles.sectionTitle}>Usuarios con Roles Asignados ({derivedRoleAssignments.length})</h2>
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
                                    {derivedRoleAssignments.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                                                No hay roles especiales asignados
                                            </td>
                                        </tr>
                                    ) : (
                                        derivedRoleAssignments.map((assignment) => (
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
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
