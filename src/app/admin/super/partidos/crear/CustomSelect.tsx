import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
    value: string;
    label: string;
}

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    style?: React.CSSProperties;
}

export function CustomSelect({ value, onChange, options, placeholder = 'Seleccionar...', disabled, style }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find((opt) => opt.value === value);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                    {options.length === 0 ? (
                        <div className="scifi-select-empty">Sin opciones</div>
                    ) : (
                        options.map((option) => (
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
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
