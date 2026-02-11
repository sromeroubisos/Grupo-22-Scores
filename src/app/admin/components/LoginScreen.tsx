'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from './LoginScreen.module.css';

type UserRole = 'admin_general' | 'admin_union' | 'admin_torneo' | 'operador' | 'fan' | 'admin_club';

export default function LoginScreen() {
    const { login } = useAuth();
    // AuthContext login is sync for mock

    const handleLogin = (role: UserRole) => {
        login(role);
    };

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <div className={styles.logo}>G22 SCORES</div>
                    <h1>Panel de Administración</h1>
                    <p>Seleccione un rol para ingresar (Simulación)</p>
                </div>

                <div className={styles.options}>
                    <button className={`${styles.btn} ${styles.systemAdmin}`} onClick={() => handleLogin('admin_general')} style={{ borderLeft: '4px solid #F59E0B' }}>
                        <span className={styles.icon}>👑</span>
                        <div className={styles.info}>
                            <span className={styles.role}>Admin General</span>
                            <span className={styles.desc}>Gestión Global</span>
                        </div>
                    </button>

                    <button className={`${styles.btn} ${styles.unionAdmin}`} onClick={() => handleLogin('admin_union')} style={{ borderLeft: '4px solid var(--color-accent)' }}>
                        <span className={styles.icon}>🏢</span>
                        <div className={styles.info}>
                            <span className={styles.role}>Admin Unión</span>
                            <span className={styles.desc}>Gestión de Unión</span>
                        </div>
                    </button>

                    <button className={`${styles.btn} ${styles.admin}`} onClick={() => handleLogin('admin_torneo')}>
                        <span className={styles.icon}>🏆</span>
                        <div className={styles.info}>
                            <span className={styles.role}>Admin Torneo</span>
                            <span className={styles.desc}>Gestión de Torneo</span>
                        </div>
                    </button>

                    <button className={`${styles.btn} ${styles.operator}`} onClick={() => handleLogin('operador')}>
                        <span className={styles.icon}>📝</span>
                        <div className={styles.info}>
                            <span className={styles.role}>Operador</span>
                            <span className={styles.desc}>Carga de datos</span>
                        </div>
                    </button>

                    <button className={`${styles.btn} ${styles.clubAdmin}`} onClick={() => handleLogin('admin_club')} style={{ borderLeft: '4px solid #3B82F6' }}>
                        <span className={styles.icon}>🛡️</span>
                        <div className={styles.info}>
                            <span className={styles.role}>Delegado Club</span>
                            <span className={styles.desc}>Gestión de Club</span>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
