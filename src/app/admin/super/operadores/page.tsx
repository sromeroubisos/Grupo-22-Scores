'use client';

import React, { useState } from 'react';
import styles from '../page.module.css';

interface Operator {
    id: string;
    name: string;
    email: string;
    assignedTournament: string;
    status: 'active' | 'inactive';
}

const initialOperators: Operator[] = [
    { id: '1', name: 'Juan Pérez', email: 'juan@casi.org.ar', assignedTournament: 'Top 12 URBA', status: 'active' },
    { id: '2', name: 'Maria Gomez', email: 'maria@sic.org.ar', assignedTournament: 'Top 12 URBA', status: 'active' },
];

export default function OperadoresPage() {
    const [operators, setOperators] = useState(initialOperators);

    const handleAdd = () => {
        const name = window.prompt('Nombre:');
        if (!name) return;
        setOperators([...operators, {
            id: Date.now().toString(),
            name,
            email: 'user@example.com',
            assignedTournament: 'Sin asignar',
            status: 'active'
        }]);
    };

    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Operadores</h1>
                        <p className={styles.pageSubtitle}>Gestión de operadores de carga para torneos</p>
                    </div>
                    <div className={styles.headerRight}>
                        <button className={styles.viewSiteBtn} onClick={handleAdd}>+ Nuevo Operador</button>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.card}>
                        <div className={styles.activityList}>
                            {operators.map(op => (
                                <div key={op.id} className={styles.activityItem}>
                                    <div className={styles.activityIcon} style={{ background: '#ecfccb', color: '#65a30d' }}>👤</div>
                                    <div className={styles.activityContent}>
                                        <div className={styles.activityMessage}>{op.name}</div>
                                        <div className={styles.activityMeta}>{op.email} • {op.assignedTournament}</div>
                                    </div>
                                    <button className={styles.btn} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>Editar</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
