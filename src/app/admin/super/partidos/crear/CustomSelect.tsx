'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
    value: string;
    label: string;
}

// El catalogo de clubes pasa los 2.000: pintar todo de una traba el desplegable.
// Se pintan los primeros y el resto se alcanza escribiendo, con el contador a la
// vista para que nadie crea que la lista termina ahi.
const RENDER_CAP = 200;

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    style?: React.CSSProperties;
    searchable?: boolean;
    searchPlaceholder?: string;
}

export function CustomSelect({
    value,
    onChange,
    options,
    placeholder = 'Seleccionar...',
    disabled,
    style,
    searchable = false,
    searchPlaceholder = 'Escribir para buscar...',
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find((opt) => opt.value === value);
    const filteredOptions = useMemo(() => {
        if (!searchable || !searchTerm.trim()) return options;

        const normalizedSearch = searchTerm.trim().toLowerCase();
        return options.filter((option) => option.label.toLowerCase().includes(normalizedSearch));
    }, [options, searchTerm, searchable]);

    const visibleOptions = useMemo(
        () => (filteredOptions.length > RENDER_CAP ? filteredOptions.slice(0, RENDER_CAP) : filteredOptions),
        [filteredOptions]
    );
    const hiddenCount = filteredOptions.length - visibleOptions.length;

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
            return;
        }

        if (searchable) {
            const timeoutId = window.setTimeout(() => searchInputRef.current?.focus(), 0);
            return () => window.clearTimeout(timeoutId);
        }
    }, [isOpen, searchable]);

    return (
        <div
            className={`scifi-select ${disabled ? 'disabled' : ''} ${isOpen ? 'open' : ''}`}
            ref={containerRef}
        >
            <div
                className="scifi-select-trigger"
                style={style}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span className={!selectedOption && placeholder ? 'placeholder' : ''}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={16} className={`scifi-select-icon ${isOpen ? 'open' : ''}`} />
            </div>

            {isOpen && (
                <div className="scifi-select-dropdown">
                    {searchable && (
                        <div className="scifi-select-search">
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                placeholder={searchPlaceholder}
                                className="scifi-select-search-input"
                            />
                        </div>
                    )}
                    {filteredOptions.length === 0 ? (
                        <div className="scifi-select-empty">Sin opciones</div>
                    ) : (
                        <>
                            {visibleOptions.map((option) => (
                                <div
                                    key={option.value}
                                    className={`scifi-select-item ${option.value === value ? 'selected' : ''}`}
                                    onClick={() => {
                                        onChange(option.value);
                                        setIsOpen(false);
                                    }}
                                >
                                    {option.label}
                                </div>
                            ))}
                            {hiddenCount > 0 && (
                                <div className="scifi-select-empty">
                                    {searchable
                                        ? `${hiddenCount} opciones más: escribí para encontrarlas.`
                                        : `${hiddenCount} opciones más.`}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
