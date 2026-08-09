'use client';

import { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import styles from './page.module.css';

/**
 * Paginador de las consolas del superadmin.
 *
 * El problema que resuelve no es cortar la lista sino poder RECORRERLA entera.
 * Los dos extremos que había fallaban por lo mismo: partidos son 2.749 paginas y
 * solo tenia "Anterior/Siguiente" (la ultima queda a 2.748 clics), y clubes
 * dibujaba los 102 numeros de pagina en fila. Acá hay ventana con elipsis,
 * primera/ultima, salto directo a una pagina y tamaño de pagina, que es lo que
 * de verdad acorta el recorrido.
 */

export const CONSOLE_PAGE_SIZES = [20, 50, 100, 200] as const;

type ConsolePagerProps = {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
    /** Sustantivo en plural para el resumen: "clubes", "partidos". */
    itemLabel?: string;
    disabled?: boolean;
};

const GAP = 'gap' as const;

/**
 * Ventana de paginas: siempre la primera, la ultima y las vecinas de la actual.
 * Los huecos se marcan con un separador en vez de listar todo.
 */
export function buildPageWindow(page: number, totalPages: number, radius = 2): Array<number | typeof GAP> {
    if (totalPages <= 1) return [1];

    const pages = new Set<number>([1, totalPages]);
    for (let candidate = page - radius; candidate <= page + radius; candidate += 1) {
        if (candidate >= 1 && candidate <= totalPages) pages.add(candidate);
    }

    const ordered = [...pages].sort((a, b) => a - b);
    const withGaps: Array<number | typeof GAP> = [];

    ordered.forEach((value, index) => {
        const previous = ordered[index - 1];
        // Un solo numero salteado no merece elipsis: se dibuja el numero.
        if (previous !== undefined && value - previous === 2) {
            withGaps.push(previous + 1);
        } else if (previous !== undefined && value - previous > 2) {
            withGaps.push(GAP);
        }
        withGaps.push(value);
    });

    return withGaps;
}

export default function ConsolePager({
    page,
    totalPages,
    total,
    pageSize,
    onPageChange,
    onPageSizeChange,
    itemLabel = 'filas',
    disabled = false,
}: ConsolePagerProps) {
    const [jumpValue, setJumpValue] = useState('');

    useEffect(() => {
        setJumpValue('');
    }, [page]);

    const safeTotalPages = Math.max(1, totalPages);
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = total === 0 ? 0 : Math.min(page * pageSize, total);
    const window = buildPageWindow(page, safeTotalPages);

    const go = (target: number) => {
        const clamped = Math.min(Math.max(target, 1), safeTotalPages);
        if (clamped !== page) onPageChange(clamped);
    };

    const submitJump = () => {
        const parsed = Number.parseInt(jumpValue, 10);
        if (Number.isFinite(parsed)) go(parsed);
        setJumpValue('');
    };

    return (
        <div
            className={styles.filterBar}
            style={{ marginTop: 16, marginBottom: 0, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}
            onClick={(event) => event.stopPropagation()}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className={styles.filterLabel} style={{ fontSize: 11 }}>
                    Mostrando {from}-{to} de {total} {itemLabel}
                </span>

                {onPageSizeChange && (
                    <>
                        <span className={styles.filterLabel}>Por pagina</span>
                        <select
                            className={styles.filterControl}
                            value={pageSize}
                            onChange={(event) => onPageSizeChange(Number(event.target.value))}
                            disabled={disabled}
                            aria-label="Filas por pagina"
                        >
                            {CONSOLE_PAGE_SIZES.map((size) => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                    </>
                )}
            </div>

            {safeTotalPages > 1 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        className={styles.cardAction}
                        onClick={() => go(1)}
                        disabled={disabled || page === 1}
                        aria-label="Primera pagina"
                        title="Primera pagina"
                        style={{ padding: '8px 10px' }}
                    >
                        <ChevronsLeft size={14} />
                    </button>
                    <button
                        type="button"
                        className={styles.cardAction}
                        onClick={() => go(page - 1)}
                        disabled={disabled || page === 1}
                        aria-label="Pagina anterior"
                        style={{ padding: '8px 12px' }}
                    >
                        <ChevronLeft size={14} />
                    </button>

                    {window.map((entry, index) => (
                        entry === GAP ? (
                            <span
                                key={`gap-${index}`}
                                aria-hidden="true"
                                className={styles.filterLabel}
                                style={{ padding: '0 2px' }}
                            >
                                …
                            </span>
                        ) : (
                            <button
                                key={entry}
                                type="button"
                                className={styles.cardAction}
                                onClick={() => go(entry)}
                                disabled={disabled}
                                aria-current={entry === page ? 'page' : undefined}
                                aria-label={`Pagina ${entry}`}
                                style={{
                                    minWidth: 40,
                                    padding: '8px 12px',
                                    background: entry === page ? 'var(--color-accent)' : undefined,
                                    borderColor: entry === page ? 'var(--color-accent)' : undefined,
                                    color: entry === page ? '#012e1d' : undefined,
                                    fontWeight: entry === page ? 700 : undefined,
                                }}
                            >
                                {entry}
                            </button>
                        )
                    ))}

                    <button
                        type="button"
                        className={styles.cardAction}
                        onClick={() => go(page + 1)}
                        disabled={disabled || page >= safeTotalPages}
                        aria-label="Pagina siguiente"
                        style={{ padding: '8px 12px' }}
                    >
                        <ChevronRight size={14} />
                    </button>
                    <button
                        type="button"
                        className={styles.cardAction}
                        onClick={() => go(safeTotalPages)}
                        disabled={disabled || page >= safeTotalPages}
                        aria-label="Ultima pagina"
                        title="Ultima pagina"
                        style={{ padding: '8px 10px' }}
                    >
                        <ChevronsRight size={14} />
                    </button>

                    {safeTotalPages > 5 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                            <span className={styles.filterLabel}>Ir a</span>
                            <input
                                type="number"
                                min={1}
                                max={safeTotalPages}
                                inputMode="numeric"
                                className={styles.filterControl}
                                value={jumpValue}
                                placeholder={String(page)}
                                onChange={(event) => setJumpValue(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        submitJump();
                                    }
                                }}
                                onBlur={submitJump}
                                disabled={disabled}
                                aria-label={`Ir a una pagina entre 1 y ${safeTotalPages}`}
                                style={{ width: 74 }}
                            />
                            <span className={styles.filterLabel} style={{ whiteSpace: 'nowrap' }}>de {safeTotalPages}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
