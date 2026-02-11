'use client';

import React, { useState } from 'react';
import styles from '../super/page.module.css';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'system_admin' | 'tournament_admin' | 'operator';
    status: 'active' | 'suspended';
}

const initialUsers: User[] = [
    { id: '1', name: 'Super Admin', email: 'master@g22.com', role: 'system_admin', status: 'active' },
    { id: '2', name: 'Admin Torneo', email: 'admin@uar.com.ar', role: 'tournament_admin', status: 'active' },
    { id: '3', name: 'Operador 1', email: 'op@union.com', role: 'operator', status: 'active' },
    { id: '4', name: 'Operador Malo', email: 'bad@union.com', role: 'operator', status: 'suspended' },
];

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>(initialUsers);

    const handleCreateUser = () => {
        const name = window.prompt('Nombre del usuario:');
        if (!name) return;
        const email = window.prompt('Email:');
        const role = window.prompt('Rol (system_admin / tournament_admin / operator):', 'operator') as any;

        // Basic validation
        if (!['system_admin', 'tournament_admin', 'operator'].includes(role)) {
            alert('Rol inválido');
            return;
        }

        setUsers([...users, { id: Date.now().toString(), name, email: email || '', role, status: 'active' }]);
    };

    const toggleStatus = (id: string) => {
        setUsers(users.map(u => {
            if (u.id === id) {
                return { ...u, status: u.status === 'active' ? 'suspended' : 'active' };
            }
            return u;
        }));
    };

    const deleteUser = (id: string) => {
        if (window.confirm('Eliminar usuario permanentemente?')) {
            setUsers(users.filter(u => u.id !== id));
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Gestión de Usuarios</h1>
                        <p className={styles.pageSubtitle}>Administración de accesos y roles</p>
                    </div>
                    <div className={styles.headerRight}>
                        <button className={styles.viewSiteBtn} onClick={handleCreateUser}>
                            + Crear Usuario
                        </button>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.card}>
                        <div className={styles.activityList}>
                            {users.map(user => (
                                <div key={user.id} className={styles.activityItem}>
                                    <div className={styles.activityIcon} style={{ background: user.role === 'system_admin' ? '#F59E0B20' : '#3B82F620', color: user.role === 'system_admin' ? '#F59E0B' : '#3B82F6' }}>
                                        {user.role === 'system_admin' ? '👑' : '👤'}
                                    </div>
                                    <div className={styles.activityContent}>
                                        <div className={styles.activityMessage}>
                                            {user.name}
                                            {user.status === 'suspended' && <span style={{ marginLeft: '10px', fontSize: '0.7em', color: 'red', border: '1px solid red', padding: '2px 4px', borderRadius: '4px' }}>SUSPENDIDO</span>}
                                        </div>
                                        <div className={styles.activityMeta}>{user.email} • {displayRole(user.role)}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button
                                            onClick={() => toggleStatus(user.id)}
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid var(--color-border)',
                                                background: 'transparent',
                                                color: user.status === 'active' ? 'orange' : 'green',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {user.status === 'active' ? 'Suspender' : 'Activar'}
                                        </button>
                                        <button
                                            onClick={() => deleteUser(user.id)}
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid var(--color-border)',
                                                background: 'transparent',
                                                color: 'red',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function displayRole(role: string) {
    if (role === 'system_admin') return 'Admin General';
    if (role === 'tournament_admin') return 'Admin Torneo';
    if (role === 'operator') return 'Operador';
    return role;
}
