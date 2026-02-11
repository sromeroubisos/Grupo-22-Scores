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
            if (user.role === 'entrenador') {
                router.push('/entrenador');
                return;
            }
            if (user.role === 'jugador') {
                router.push('/jugadores');
                return;
            }
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

                    <button onClick={() => handleLogin('jugador')} className="btn btn-player">
                        Jugador
                    </button>

                    <button onClick={() => handleLogin('entrenador')} className="btn btn-coach">
                        Entrenador
                    </button>

                    <button onClick={() => handleLogin('admin_general')} className="btn btn-admin">
                        Admin General
                    </button>

                    <button onClick={() => handleLogin('admin_club')} className="btn btn-club">
                        Delegado Club
                    </button>

                    <button onClick={() => handleLogin('admin_union')} className="btn btn-union">
                        Admin Unión
                    </button>

                    <button onClick={() => handleLogin('admin_torneo')} className="btn btn-torneo">
                        Admin Torneo
                    </button>

                    <button onClick={() => handleLogin('operador')} className="btn btn-operator">
                        Operador
                    </button>

                </div>

                <Link href="/" className="back-link">Volver al inicio</Link>
            </div>
        </div>
    );
}
