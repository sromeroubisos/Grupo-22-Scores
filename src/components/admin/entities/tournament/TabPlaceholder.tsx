'use client';

import './basalt.css';

interface TabPlaceholderProps {
    title: string;
}

export function TabPlaceholder({ title }: TabPlaceholderProps) {
    return (
        <div className="tab-content active transition-all">
            <div className="basalt-card p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-4" style={{ color: 'var(--text-dim)' }}>
                    {title}
                </h2>
                <div className="w-16 h-1 bg-accent-primary mb-8"></div>
                <p className="max-w-md text-dim leading-relaxed">
                    Esta sección está siendo rediseñada bajo el motor <span className="text-main font-bold">Monolithic Basalt</span>.
                    La lógica funcional se mantiene intacta en el backend.
                </p>
                <button
                    className="basalt-btn mt-10"
                    onClick={() => window.location.reload()}
                >
                    Recargar Módulo
                </button>
            </div>
        </div>
    );
}
