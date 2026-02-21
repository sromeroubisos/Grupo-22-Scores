import React, { ReactNode } from 'react';

export default function ManageEntityLayout({ children }: { children: ReactNode }) {
    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
            {/* Admin Header Stub */}
            <header className="px-6 py-5 border-b border-divider bg-surface shadow-sm">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Admin Workspace</h1>
                        <p className="text-system-secondary text-sm font-medium mt-1">Entity Management</p>
                    </div>
                </div>
            </header>

            {/* Tabs Placeholder */}
            <div className="px-6 border-b border-divider bg-surface/50">
                <div className="max-w-7xl mx-auto">
                    <nav className="flex gap-8">
                        <button className="py-4 border-b-2 border-accent text-accent font-semibold">
                            General
                        </button>
                        <button className="py-4 border-b-2 border-transparent text-system-secondary hover:text-system-primary transition-colors font-medium">
                            Settings
                        </button>
                        <button className="py-4 border-b-2 border-transparent text-system-secondary hover:text-system-primary transition-colors font-medium">
                            Advanced
                        </button>
                    </nav>
                </div>
            </div>

            <main className="flex-1 p-6 md:p-8">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
