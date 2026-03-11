'use client';

import { Terminal } from 'lucide-react';

interface TabPlaceholderProps {
    name: string;
}

export function TabPlaceholder({ name }: TabPlaceholderProps) {
    return (
        <div className="basalt-card border-dashed py-32 flex flex-col items-center justify-center text-center opacity-60">
            <div className="w-12 h-12 rounded-lg bg-[#0a0a0c] border border-basalt flex items-center justify-center mb-6">
                <Terminal className="w-6 h-6 text-[#3b82f6]" />
            </div>
            <h2 className="text-[18px] font-black text-white uppercase tracking-tighter mb-2">Módulo: {name}</h2>
            <p className="meta-text max-w-xs uppercase">
                Este módulo está siendo procesado por el core de Tournament OS.
            </p>
            <div className="mt-8 flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full animate-pulse"></div>
                <div className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full animate-pulse [animation-delay:0.2s]"></div>
                <div className="w-1.5 h-1.5 bg-[#3b82f6] rounded-full animate-pulse [animation-delay:0.4s]"></div>
            </div>
        </div>
    );
}
