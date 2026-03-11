import React, { ReactNode } from 'react';

export default function ManageEntityLayout({ children }: { children: ReactNode }) {
    return (
        <div className="w-full">
            {children}
        </div>
    );
}
