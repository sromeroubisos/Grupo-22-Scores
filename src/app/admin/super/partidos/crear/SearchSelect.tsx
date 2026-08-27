'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface SearchSelectOption {
    value: string;
    label: string;
    /** Texto corto a la derecha de la opción (temporada, estado). */
    hint?: string;
}

interface SearchSelectProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    options: SearchSelectOption[];
    placeholder?: string;
    disabled?: boolean;
    loading?: boolean;
    emptyText?: string;
    invalid?: boolean;
    describedBy?: string;
}

// Más de 200 opciones pintadas de una traban el desplegable (el catálogo de
// clubes pasa los 2.900). Se pintan las primeras y el resto se alcanza
// escribiendo, con el contador a la vista para que nadie crea que la lista
// termina ahí.
const RENDER_CAP = 200;

// Marcas combinantes (U+0300..U+036F): lo que queda de una tilde después de NFD.
const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

// Búsqueda sin tildes: "cordoba" tiene que encontrar "Córdoba".
function fold(text: string) {
    return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/**
 * Combobox con búsqueda (patrón ARIA 1.2: input role=combobox + listbox).
 *
 * Cerrado muestra la opción elegida. Al enfocar, el campo queda vacío con la
 * opción elegida como placeholder: se escribe para filtrar y la lista se abre
 * sola. Flechas, Inicio/Fin, Enter y Escape hacen lo que se espera; Tab cierra
 * sin cambiar nada.
 */
export function SearchSelect({
    id,
    value,
    onChange,
    options,
    placeholder = 'Elegir…',
    disabled = false,
    loading = false,
    emptyText = 'Sin resultados.',
    invalid = false,
    describedBy,
}: SearchSelectProps) {
    const listId = `${id}-listbox`;
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selected = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);

    const filtered = useMemo(() => {
        const needle = fold(query.trim());
        if (!needle) return options;
        return options.filter((option) =>
            fold(option.label).includes(needle) || (option.hint ? fold(option.hint).includes(needle) : false)
        );
    }, [options, query]);
    const visible = filtered.length > RENDER_CAP ? filtered.slice(0, RENDER_CAP) : filtered;
    const hidden = filtered.length - visible.length;

    const close = useCallback(() => {
        setOpen(false);
        setActiveIndex(-1);
    }, []);

    const openList = useCallback(() => {
        if (disabled || loading) return;
        setOpen(true);
        const selectedIndex = selected ? options.findIndex((option) => option.value === selected.value) : -1;
        setActiveIndex(selectedIndex >= 0 && selectedIndex < RENDER_CAP ? selectedIndex : (options.length > 0 ? 0 : -1));
    }, [disabled, loading, options, selected]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent | TouchEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('touchstart', onPointerDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('touchstart', onPointerDown);
        };
    }, [open, close]);

    useEffect(() => {
        if (!open || activeIndex < 0) return;
        const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
        item?.scrollIntoView({ block: 'nearest' });
    }, [open, activeIndex]);

    const commit = (option: SearchSelectOption) => {
        onChange(option.value);
        setQuery('');
        close();
        inputRef.current?.focus();
    };

    const clear = () => {
        onChange('');
        setQuery('');
        close();
        inputRef.current?.focus();
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (!open) openList();
                else setActiveIndex((index) => Math.min(index + 1, visible.length - 1));
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (!open) openList();
                else setActiveIndex((index) => Math.max(index - 1, 0));
                break;
            case 'Home':
                if (open) {
                    event.preventDefault();
                    setActiveIndex(visible.length > 0 ? 0 : -1);
                }
                break;
            case 'End':
                if (open) {
                    event.preventDefault();
                    setActiveIndex(visible.length - 1);
                }
                break;
            case 'Enter': {
                if (!open) break;
                event.preventDefault();
                const option = visible[activeIndex];
                if (option) commit(option);
                break;
            }
            case 'Escape':
                if (open) {
                    event.preventDefault();
                    setQuery('');
                    close();
                }
                break;
            case 'Tab':
                if (open) close();
                break;
            default:
                break;
        }
    };

    const activeId = open && activeIndex >= 0 && visible[activeIndex] ? `${id}-opt-${activeIndex}` : undefined;
    const displayValue = focused ? query : (selected?.label ?? '');
    const displayPlaceholder = loading ? 'Cargando…' : (selected ? selected.label : placeholder);
    const classes = [
        'ss',
        open ? 'is-open' : '',
        disabled || loading ? 'is-disabled' : '',
        selected ? 'has-value' : '',
    ].filter(Boolean).join(' ');

    return (
        <div ref={rootRef} className={classes}>
            <div className="ss-field">
                <input
                    ref={inputRef}
                    id={id}
                    type="text"
                    role="combobox"
                    className={`form-input ss-input${invalid ? ' is-error' : ''}`}
                    value={displayValue}
                    placeholder={displayPlaceholder}
                    disabled={disabled || loading}
                    autoComplete="off"
                    spellCheck={false}
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeId}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    aria-busy={loading || undefined}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setActiveIndex(0);
                        if (!open) setOpen(true);
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        setFocused(false);
                        setQuery('');
                        close();
                    }}
                    onClick={() => {
                        if (!open) openList();
                    }}
                    onKeyDown={onKeyDown}
                />
                {selected && !disabled && !loading && (
                    <button
                        type="button"
                        className="ss-clear"
                        aria-label="Quitar selección"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={clear}
                    >
                        <X size={14} />
                    </button>
                )}
                <button
                    type="button"
                    className="ss-toggle"
                    tabIndex={-1}
                    aria-hidden="true"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                        if (open) {
                            close();
                            return;
                        }
                        inputRef.current?.focus();
                        openList();
                    }}
                >
                    <ChevronDown size={16} />
                </button>
            </div>

            {open && (
                <ul ref={listRef} id={listId} role="listbox" className="ss-list">
                    {visible.length === 0 ? (
                        <li className="ss-empty" role="presentation">{emptyText}</li>
                    ) : (
                        visible.map((option, index) => (
                            <li
                                key={option.value}
                                id={`${id}-opt-${index}`}
                                data-index={index}
                                role="option"
                                aria-selected={option.value === value}
                                className={[
                                    'ss-option',
                                    index === activeIndex ? 'is-active' : '',
                                    option.value === value ? 'is-selected' : '',
                                ].filter(Boolean).join(' ')}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => commit(option)}
                            >
                                <span className="ss-option-label">{option.label}</span>
                                {option.hint && <span className="ss-option-hint">{option.hint}</span>}
                            </li>
                        ))
                    )}
                    {hidden > 0 && (
                        <li className="ss-empty" role="presentation">
                            {hidden} más. Seguí escribiendo para acotar.
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
