'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from './LoginScreen.module.css';

type UserRole = 'admin_general' | 'fan';

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
                    <h1>Panel de Administracion</h1>
                    <p>Seleccione el rol para ingresar</p>
                </div>

                <div className={styles.options}>
                    <button className={`${styles.btn} ${styles.systemAdmin}`} onClick={() => handleLogin('admin_general')} style={{ borderLeft: '4px solid #F59E0B' }}>
                        <span className={styles.icon}>A</span>
                        <div className={styles.info}>
                            <span className={styles.role}>Super Administrador</span>
                            <span className={styles.desc}>Gestion Global</span>
                        </div>
                    </button>

                    <button className={`${styles.btn} ${styles.systemAdmin}`} onClick={() => handleLogin('fan')} style={{ borderLeft: '4px solid #10B981' }}>
                        <span className={styles.icon}>U</span>
                        <div className={styles.info}>
                            <span className={styles.role}>Usuario Normal</span>
                            <span className={styles.desc}>Acceso básico</span>
                        </div>
                    </button>

                </div>
            </div>
        </div>
    );
}
