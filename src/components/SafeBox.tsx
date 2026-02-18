'use client';

import React from 'react';

interface SafeBoxProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface SafeBoxState {
    hasError: boolean;
}

export class SafeBox extends React.Component<SafeBoxProps, SafeBoxState> {
    constructor(props: SafeBoxProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // You can log the error to an error reporting service here
        console.error('SafeBox caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback ?? (
                <div style={{ padding: '16px', color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                    No disponible
                </div>
            );
        }

        return this.props.children;
    }
}
