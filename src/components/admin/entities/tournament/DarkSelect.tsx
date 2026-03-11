'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DarkSelectOption {
    value: string;
    label: string;
    sublabel?: string;
    disabled?: boolean;
}

interface DarkSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: DarkSelectOption[];
    placeholder?: string;
    error?: boolean;
    disabled?: boolean;
    id?: string;
}

export function DarkSelect({
    value,
    onChange,
    options,
    placeholder = 'Seleccionar...',
    error = false,
    disabled = false,
    id,
}: DarkSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [focusIndex, setFocusIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find((o) => o.value === value);

    // Close on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Scroll focused item into view
    useEffect(() => {
        if (isOpen && focusIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll('[data-dkopt]');
            items[focusIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [focusIndex, isOpen]);

    const toggle = useCallback(() => {
        if (disabled) return;
        setIsOpen((prev) => {
            if (!prev) {
                // When opening, focus the currently selected item
                const idx = options.findIndex((o) => o.value === value);
                setFocusIndex(idx >= 0 ? idx : 0);
            }
            return !prev;
        });
    }, [disabled, options, value]);

    const select = useCallback(
        (val: string) => {
            onChange(val);
            setIsOpen(false);
        },
        [onChange]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (disabled) return;

            switch (e.key) {
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (isOpen && focusIndex >= 0 && !options[focusIndex]?.disabled) {
                        select(options[focusIndex].value);
                    } else {
                        toggle();
                    }
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (!isOpen) {
                        toggle();
                    } else {
                        setFocusIndex((prev) => {
                            let next = prev + 1;
                            while (next < options.length && options[next]?.disabled) next++;
                            return next < options.length ? next : prev;
                        });
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (isOpen) {
                        setFocusIndex((prev) => {
                            let next = prev - 1;
                            while (next >= 0 && options[next]?.disabled) next--;
                            return next >= 0 ? next : prev;
                        });
                    }
                    break;
                case 'Escape':
                    setIsOpen(false);
                    break;
            }
        },
        [disabled, isOpen, focusIndex, options, select, toggle]
    );

    return (
        <div
            ref={containerRef}
            className={`dk-select ${isOpen ? 'dk-select--open' : ''} ${error ? 'dk-select--error' : ''} ${disabled ? 'dk-select--disabled' : ''}`}
            id={id}
        >
            {/* Trigger button */}
            <button
                type="button"
                className="dk-select__trigger"
                onClick={toggle}
                onKeyDown={handleKeyDown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                disabled={disabled}
            >
                <span className={`dk-select__value ${!selectedOption ? 'dk-select__placeholder' : ''}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={16} className={`dk-select__caret ${isOpen ? 'dk-select__caret--up' : ''}`} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="dk-select__dropdown" ref={listRef} role="listbox">
                    {options.length === 0 ? (
                        <div className="dk-select__empty">Sin opciones disponibles</div>
                    ) : (
                        options.map((opt, i) => (
                            <div
                                key={opt.value}
                                data-dkopt
                                role="option"
                                aria-selected={opt.value === value}
                                className={`dk-select__option ${opt.value === value ? 'dk-select__option--selected' : ''} ${i === focusIndex ? 'dk-select__option--focused' : ''} ${opt.disabled ? 'dk-select__option--disabled' : ''}`}
                                onClick={() => {
                                    if (!opt.disabled) select(opt.value);
                                }}
                                onMouseEnter={() => setFocusIndex(i)}
                            >
                                <div className="dk-select__option-content">
                                    <span className="dk-select__option-label">{opt.label}</span>
                                    {opt.sublabel && <span className="dk-select__option-sub">{opt.sublabel}</span>}
                                </div>
                                {opt.value === value && <Check size={14} className="dk-select__check" />}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
