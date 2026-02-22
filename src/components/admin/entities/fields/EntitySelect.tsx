'use client';

import React, { useState, useEffect, useRef } from 'react';

export interface EntityOption {
    id: string;
    label: string;
    meta?: string;
}

interface EntitySelectProps {
    label: string;
    value: string | null;
    onChange: (value: string | null) => void;
    fetcher: (q: string, limit: number) => Promise<EntityOption[]>;
    placeholder?: string;
    allowNull?: boolean;
    disabled?: boolean;
    error?: string;
}

export function EntitySelect({
    label,
    value,
    onChange,
    fetcher,
    placeholder = 'Buscar...',
    allowNull = false,
    disabled = false,
    error
}: EntitySelectProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<EntityOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [displayLabel, setDisplayLabel] = useState(value || '');

    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<NodeJS.Timeout>(null);

    useEffect(() => {
        // If external value changes and we don't have it loaded, we update displayLabel
        if (value && value !== displayLabel) {
            // Find in current options if possible to get a better label
            const match = options.find(o => o.id === value);
            if (match) {
                setDisplayLabel(match.label);
            } else {
                setDisplayLabel(value); // fallback to ID
            }
        } else if (!value) {
            setDisplayLabel('');
        }
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Revert query to current display label
                setQuery(displayLabel);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [displayLabel]);

    // Handle fetching
    const executeFetch = async (q: string) => {
        setIsLoading(true);
        try {
            const results = await fetcher(q, 10);
            setOptions(results);
        } catch (error) {
            console.error('Failed to fetch options for EntitySelect:', error);
            setOptions([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);
        setIsOpen(true);
        setSelectedIndex(-1);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            executeFetch(val);
        }, 300);
    };

    const handleFocus = () => {
        setQuery('');
        setIsOpen(true);
        executeFetch(''); // Initial load
    };

    const handleSelect = (option: EntityOption | null) => {
        if (option) {
            setDisplayLabel(option.label);
            setQuery(option.label);
            onChange(option.id);
        } else {
            setDisplayLabel('');
            setQuery('');
            onChange(null);
        }
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                e.preventDefault();
                setIsOpen(true);
                executeFetch(query);
            }
            return;
        }

        const maxIndex = allowNull ? options.length : options.length - 1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < maxIndex ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (allowNull && selectedIndex === 0) {
                handleSelect(null);
            } else {
                const optIndex = allowNull ? selectedIndex - 1 : selectedIndex;
                if (optIndex >= 0 && optIndex < options.length) {
                    handleSelect(options[optIndex]);
                }
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setQuery(displayLabel);
        }
    };

    return (
        <div ref={containerRef} className="space-y-1.5 relative">
            <label className="block text-sm font-medium text-system-secondary">{label}</label>
            <div className="relative">
                <input
                    type="text"
                    value={isOpen ? query : displayLabel}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={placeholder}
                    className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-blue transition-colors disabled:opacity-50"
                    autoComplete="off"
                />
                {!isOpen && !disabled && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-system-secondary">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                )}
            </div>
            {error && <p className="text-xs font-medium text-red-500 mt-1">{error}</p>}

            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-surface border border-divider rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {isLoading && options.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-system-secondary text-center">Buscando...</div>
                    ) : (
                        <ul className="py-1">
                            {allowNull && (
                                <li
                                    onClick={() => handleSelect(null)}
                                    className={`px-4 py-2 text-sm cursor-pointer transition-colors ${selectedIndex === 0
                                            ? 'bg-accent-blue/10 text-accent-blue'
                                            : 'text-foreground hover:bg-surface-hover'
                                        }`}
                                >
                                    <span className="italic opacity-70">Ninguno (Dejar vacío)</span>
                                </li>
                            )}
                            {options.map((opt, i) => {
                                const index = allowNull ? i + 1 : i;
                                const isSelected = selectedIndex === index;
                                return (
                                    <li
                                        key={opt.id}
                                        onClick={() => handleSelect(opt)}
                                        className={`px-4 py-2 text-sm cursor-pointer flex flex-col transition-colors ${isSelected
                                                ? 'bg-accent-blue/10 text-accent-blue'
                                                : 'text-foreground hover:bg-surface-hover'
                                            }`}
                                    >
                                        <span className="font-medium text-foreground">{opt.label}</span>
                                        <span className="text-xs text-system-secondary mt-0.5">
                                            {opt.meta || opt.id.split('-')[0] + '...'}
                                        </span>
                                    </li>
                                );
                            })}
                            {!isLoading && options.length === 0 && (
                                <li className="px-4 py-3 text-sm text-system-secondary text-center">
                                    No se encontraron resultados
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
