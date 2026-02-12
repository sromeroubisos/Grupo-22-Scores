'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import './login.css';

export default function LoginPage() {
    const { login, isAuthenticated, user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isAuthenticated && user) {
            router.push('/');
        }
    }, [isAuthenticated, user, router]);


    const handleLogin = (role: any) => {
        login(role);
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h1>Iniciar Sesión</h1>
                <p>Selecciona un rol para simular el inicio de sesión:</p>

                <div className="role-buttons">
                    <button onClick={() => handleLogin('fan')} className="btn btn-fan">
                        Fan (Usuario común)
                    </button>
                    <button onClick={() => handleLogin('admin_general')} className="btn btn-admin">
                        Super Administrador
                    </button>
                </div>

                <Link href="/" className="back-link">Volver al inicio</Link>
            </div>
        </div>
    );
}
