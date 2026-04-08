'use client';

import './basalt.css';

interface TabPlaceholderProps {
    title: string;
}

export function TabPlaceholder({ title }: TabPlaceholderProps) {
    return (
        <div className="tab-content active transition-all">
            <div className="basalt-card basalt-placeholder-card p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
                <div className="basalt-placeholder-kicker">Operational Module</div>
                <h2 className="text-2xl font-black uppercase tracking-[0.16em] mb-4" style={{ color: 'var(--text-main)' }}>
                    {title}
                </h2>
                <div className="basalt-placeholder-rule mb-8"></div>
                <p className="max-w-md text-dim leading-relaxed">
                    Esta seccion esta siendo adaptada a la nueva consola operativa del torneo.
                    La logica funcional se mantiene intacta en el backend.
                </p>
                <button
                    className="basalt-btn mt-10"
                    onClick={() => window.location.reload()}
                    type="button"
                >
                    Recargar modulo
                </button>
            </div>
        </div>
    );
}
