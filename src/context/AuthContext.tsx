'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type UserRole = 'fan' | 'jugador' | 'entrenador' | 'admin_general' | 'admin_union' | 'admin_torneo' | 'operador' | 'admin_club';

interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    avatarUrl?: string;
    unionId?: string; // For admin_union
    tournamentId?: string; // For admin_torneo / operador
    clubId?: string; // For admin_club
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (role?: UserRole) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Persist auth (mock)
    useEffect(() => {
        const storedUser = localStorage.getItem('g22_user');
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            const allowedRoles: UserRole[] = ['fan', 'admin_general'];
            if (parsed?.role && allowedRoles.includes(parsed.role)) {
                setUser(parsed);
            } else {
                setUser(null);
                localStorage.removeItem('g22_user');
            }
        }
        setIsLoading(false);
    }, []);

    const login = (role: UserRole = 'fan') => {
        const allowedRoles: UserRole[] = ['fan', 'admin_general'];
        const safeRole: UserRole = allowedRoles.includes(role) ? role : 'fan';
        // Mock login
        const isSuperAdmin = safeRole === 'admin_general';
        const isOperator = safeRole === 'operador';

        // Match IDs with MockDB
        // u1 = Super Admin (has global admin + union admin + tournament admin)
        // u2 = Operator (has tournament operator)
        const userId = isSuperAdmin || role === 'admin_union' ? 'u1' : isOperator ? 'u2' : 'u3';

        const newUser: User = {
            id: userId,
            name: safeRole === 'fan'
                ? 'Juan Perez'
                : safeRole === 'jugador'
                    ? 'Jugador Demo'
                    : safeRole === 'entrenador'
                        ? 'Entrenador Demo'
                        : safeRole === 'admin_general'
                            ? 'Super Admin'
                            : 'Admin User',
            email: 'user@example.com',
            role: safeRole,
            avatarUrl: `https://ui-avatars.com/api/?name=${safeRole}&background=0D8ABC&color=fff`
        };

        if (safeRole === 'admin_union') {
            newUser.unionId = 'uar';
        }
        if (safeRole === 'admin_torneo' || safeRole === 'operador') {
            newUser.tournamentId = 'uar-top-12';
        }

        if (safeRole === 'admin_club' || safeRole === 'entrenador') {
            newUser.clubId = 'sic'; // San Isidro Club for mock
        }

        setUser(newUser);
        localStorage.setItem('g22_user', JSON.stringify(newUser));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('g22_user');
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
