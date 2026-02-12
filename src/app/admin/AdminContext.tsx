'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type UserRole = 'admin_general' | 'admin_union' | 'admin_torneo' | 'operador' | 'fan' | 'system_admin' | 'tournament_admin' | 'operator' | null;

interface User {
    name: string;
    role: UserRole;
    email: string;
    avatarUrl?: string;
}

interface AdminContextType {
    user: User | null;
    login: (role: UserRole) => void;
    logout: () => void;
    isLoading: boolean;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const login = (role: UserRole) => {
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            let mockUser: User;
            switch (role) {
                case 'admin_general':
                case 'system_admin':
                    mockUser = { name: 'Super Admin', role: 'admin_general', email: 'master@g22.com' };
                    break;
                case 'admin_union':
                    mockUser = { name: 'Admin Unión', role: 'admin_union', email: 'union@uar.com.ar' };
                    break;
                case 'admin_torneo':
                case 'tournament_admin':
                    mockUser = { name: 'Admin Torneo', role: 'admin_torneo', email: 'admin@uar.com.ar' };
                    break;
                case 'operador':
                case 'operator':
                    mockUser = { name: 'Operador Unión', role: 'operador', email: 'operador@union.com' };
                    break;
                case 'fan':
                default:
                    mockUser = { name: 'Fan User', role: 'fan', email: 'fan@public.com' };
                    break;
            }
            setUser(mockUser);
            setIsLoading(false);
        }, 500);
    };

    const logout = () => {
        setUser(null);
    };

    return (
        <AdminContext.Provider value={{ user, login, logout, isLoading }}>
            {children}
        </AdminContext.Provider>
    );
}

export function useAdmin() {
    const context = useContext(AdminContext);
    if (context === undefined) {
        throw new Error('useAdmin must be used within an AdminProvider');
    }
    return context;
}
