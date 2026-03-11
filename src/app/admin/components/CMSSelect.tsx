'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import styles from '../styles/cms-ui.module.css';

interface Option {
    id: string;
    label: string;
}

interface CMSSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export const CMSSelect: React.FC<CMSSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Seleccionar...',
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedOption = options.find(opt => opt.id === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleToggle = () => {
        if (!disabled) setIsOpen(!isOpen);
    };

    const handleSelect = (optionId: string) => {
        onChange(optionId);
        setIsOpen(false);
    };

    return (
        <div className={styles.selectWrapper} ref={containerRef}>
            <div 
                className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ''} ${disabled ? styles.disabled : ''}`}
                onClick={handleToggle}
            >
                <span className={selectedOption ? styles.label : styles.placeholder}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={16} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
            </div>

            {isOpen && (
                <div className={styles.menu}>
                    {options.map((option) => (
                        <div
                            key={option.id}
                            className={`${styles.option} ${option.id === value ? styles.optionSelected : ''}`}
                            onClick={() => handleSelect(option.id)}
                        >
                            <span>{option.label}</span>
                            <Check size={14} className={styles.checkIcon} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
