'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { normalizeSearch } from '@/features/captain/data/catalogs';
import styles from './capitan.module.css';

/**
 * EL DESPLEGABLE DE LA FICHA.
 *
 * El `<select>` nativo cerrado se puede vestir, pero la lista no: en Windows
 * abre un menú gris del sistema, sin banderas ni escudos, y con doscientos
 * países es una tira sin buscador. Este lo reemplaza en la ficha de arranque.
 *
 * ── Cómo se arma ─────────────────────────────────────────────────────────────
 * Un botón que muestra lo elegido —ícono y nombre— y un `<dialog>` con la
 * lista. El `<dialog>` nativo compra lo que un modal necesita sin escribirlo a
 * mano: capa superior (no lo recorta ningún `overflow` del tablero), foco
 * atrapado y fondo inerte para el lector de pantalla. En el teléfono se apoya
 * abajo como una hoja, que es donde llega el pulgar; en escritorio flota en el
 * centro, más chico.
 *
 * ── Teclado y lector ─────────────────────────────────────────────────────────
 * La lista es un `listbox` con `aria-activedescendant`: el foco se queda en el
 * buscador y las flechas mueven la opción activa, Enter elige, Escape cierra y
 * devuelve el foco al botón. Con pocas opciones no hay buscador y el foco va a
 * la lista directamente.
 */
export interface PickerOption {
    value: string;
    label: string;
    /** Un renglón chico abajo del nombre. */
    hint?: string;
    /** Bandera, escudo o emoji. Decorativo: el nombre ya lo dice. */
    icon?: ReactNode;
    /** Encabezado de grupo; las opciones de un mismo grupo van juntas. */
    group?: string;
}

/** A partir de cuántas opciones aparece el buscador. PARÁMETRO LIBRE. */
const SEARCH_FROM = 10;

export default function PickerSelect({
    label,
    value,
    options,
    onChange,
    placeholder = 'Elegí',
    disabled = false,
}: {
    label: string;
    value: string | null;
    options: readonly PickerOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}) {
    const id = useId();
    const caja = useRef<HTMLDialogElement>(null);
    const boton = useRef<HTMLButtonElement>(null);
    const lista = useRef<HTMLUListElement>(null);
    const [abierto, setAbierto] = useState(false);
    const [query, setQuery] = useState('');
    const [activo, setActivo] = useState(0);

    const elegida = options.find((o) => o.value === value) ?? null;
    const conBuscador = options.length >= SEARCH_FROM;

    const visibles = useMemo(() => {
        const q = normalizeSearch(query);
        return q ? options.filter((o) => normalizeSearch(o.label).includes(q)) : options;
    }, [options, query]);

    // Al abrir: se muestra el modal, la activa es la elegida y se la trae a la vista.
    useEffect(() => {
        const d = caja.current;
        if (!d) return;
        if (abierto && !d.open) {
            d.showModal();
            const i = Math.max(0, visibles.findIndex((o) => o.value === value));
            setActivo(i);
            requestAnimationFrame(() => {
                lista.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({ block: 'center' });
                if (!conBuscador) lista.current?.focus();
            });
        }
        if (!abierto && d.open) d.close();
        // `visibles` y `value` se leen sólo en la apertura, a propósito.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abierto]);

    function cerrar() {
        setAbierto(false);
        setQuery('');
        boton.current?.focus();
    }

    function elegir(v: string) {
        onChange(v);
        cerrar();
    }

    function teclas(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = visibles.length;
            if (n === 0) return;
            const next = (activo + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
            setActivo(next);
            lista.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const o = visibles[activo];
            if (o) elegir(o.value);
        }
    }

    return (
        <div className={styles.pickerField}>
            <span className={styles.signupLabel} id={`${id}-label`}>{label}</span>
            <button
                ref={boton}
                type="button"
                className={styles.picker}
                aria-haspopup="listbox"
                aria-expanded={abierto}
                aria-labelledby={`${id}-label ${id}-value`}
                disabled={disabled}
                onClick={() => setAbierto(true)}
            >
                {elegida?.icon && <span className={styles.pickerIcon} aria-hidden="true">{elegida.icon}</span>}
                <span className={styles.pickerValue} id={`${id}-value`}>
                    <span className={`${styles.pickerLabel} ${elegida ? '' : styles.pickerPlaceholder}`}>
                        {elegida?.label ?? placeholder}
                    </span>
                </span>
                <svg className={styles.pickerChevron} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            <dialog
                ref={caja}
                className={styles.pickerSheet}
                aria-labelledby={`${id}-label`}
                onCancel={(e) => { e.preventDefault(); cerrar(); }}
                // Tocar el fondo cierra: el clic que cae en el propio <dialog> y no
                // en su contenido es el del velo.
                onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}
            >
                <div className={styles.pickerSheetHead}>
                    <span className={styles.pickerSheetTitle}>{label}</span>
                    <button type="button" className={styles.pickerClose} onClick={cerrar} aria-label="Cerrar">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                {conBuscador && (
                    <input
                        className={styles.pickerSearch}
                        type="search"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActivo(0); }}
                        onKeyDown={teclas}
                        placeholder="Buscar"
                        aria-label={`Buscar ${label.toLowerCase()}`}
                        aria-controls={`${id}-list`}
                        aria-activedescendant={visibles[activo] ? `${id}-opt-${activo}` : undefined}
                        autoFocus
                    />
                )}

                <ul
                    ref={lista}
                    id={`${id}-list`}
                    className={styles.pickerList}
                    role="listbox"
                    aria-labelledby={`${id}-label`}
                    tabIndex={conBuscador ? -1 : 0}
                    onKeyDown={conBuscador ? undefined : teclas}
                    aria-activedescendant={!conBuscador && visibles[activo] ? `${id}-opt-${activo}` : undefined}
                >
                    {visibles.length === 0 && <li className={styles.pickerEmpty}>No hay nada con «{query}».</li>}
                    {visibles.map((o, i) => {
                        const nuevoGrupo = o.group && o.group !== visibles[i - 1]?.group;
                        return (
                            <li key={o.value} role="presentation">
                                {nuevoGrupo && <span className={styles.pickerGroup}>{o.group}</span>}
                                <div
                                    id={`${id}-opt-${i}`}
                                    data-index={i}
                                    role="option"
                                    aria-selected={o.value === value}
                                    className={`${styles.pickerOption} ${i === activo ? styles.pickerOptionActive : ''} ${o.value === value ? styles.pickerOptionOn : ''}`}
                                    onMouseEnter={() => setActivo(i)}
                                    onClick={() => elegir(o.value)}
                                >
                                    {o.icon && <span className={styles.pickerIcon} aria-hidden="true">{o.icon}</span>}
                                    <span className={styles.pickerValue}>
                                        <span className={styles.pickerLabel}>{o.label}</span>
                                        {o.hint && <span className={styles.pickerHint}>{o.hint}</span>}
                                    </span>
                                    {o.value === value && (
                                        <svg className={styles.pickerCheck} viewBox="0 0 24 24" aria-hidden="true">
                                            <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </dialog>
        </div>
    );
}
