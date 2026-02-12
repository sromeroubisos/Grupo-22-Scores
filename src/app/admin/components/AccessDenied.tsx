'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function AccessDenied() {
    const { logout } = useAuth();

    return (
        <div style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f3f4f6',
            flexDirection: 'column',
            gap: '1.5rem',
            textAlign: 'center',
            padding: '1rem'
        }}>
            <div style={{ fontSize: '4rem' }}>??</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>Acceso Restringido</h1>
            <p style={{ color: '#4b5563', maxWidth: '400px' }}>
                Tu perfil de usuario no tiene permisos para acceder al panel de administracion.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
                <Link href="/" style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    borderRadius: '0.5rem',
                    textDecoration: 'none',
                    fontWeight: '500'
                }}>
                    Volver al Inicio
                </Link>
                <button onClick={logout} style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    color: '#374151',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '500'
                }}>
                    Cambiar Usuario
                </button>
            </div>
        </div>
    );
}
