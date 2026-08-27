'use client';

// El panel que se abre al escribir `@` en el cuerpo de la nota: busca en la
// web lo que se puede etiquetar —clubes, jugadores, torneos, partidos y
// videos— y lo escribe como mención (`@[Los Tilos](club:<id>)`).
//
// El foco NO se va del textarea: quien redacta sigue tecleando, el panel
// filtra con lo que hay después del `@`, y con ↑ ↓ Enter elige. Por eso el
// teclado entra por `handleKey` (el editor lo llama desde el textarea) y no
// por listeners propios. Los botones usan onMouseDown con preventDefault
// para no robar el foco al clickear.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { MENTION_KIND_PLURALS, MENTION_KINDS, type MentionKind, type ResolvedMention } from '@/lib/news/mentions';
import { sessionFetch } from '@/lib/supabase/freshSession';

import styles from './NewsEditor.module.css';

export interface MentionPickerHandle {
    /** true si la tecla fue del panel (y el textarea no tiene que procesarla). */
    handleKey(event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean;
}

interface Props {
    /** Lo escrito después del `@`. */
    query: string;
    /** Dónde dibujar el panel, relativo al contenedor del textarea. */
    anchor: { top: number; left: number };
    onPick(mention: ResolvedMention): void;
    onClose(): void;
}

const DEBOUNCE_MS = 180;
const MIN_QUERY = 2;

/** Las iniciales para un jugador (no hay foto en casi ninguna ficha). */
function initialsOf(label: string): string {
    return label.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
}

const MentionPicker = forwardRef<MentionPickerHandle, Props>(function MentionPicker({ query, anchor, onPick, onClose }, ref) {
    const [kind, setKind] = useState<MentionKind | null>(null);
    const [results, setResults] = useState<ResolvedMention[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [active, setActive] = useState(0);
    const listRef = useRef<HTMLUListElement | null>(null);
    const trimmed = query.trim();

    // La búsqueda, con un respiro entre teclas y cancelando la anterior.
    useEffect(() => {
        if (trimmed.length < MIN_QUERY) {
            setResults([]);
            setLoading(false);
            setError(null);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({ q: trimmed, limit: '12' });
                if (kind) params.set('kind', kind);
                const response = await sessionFetch(`/api/news/mentions?${params.toString()}`, { signal: controller.signal, cache: 'no-store' });
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.error || 'No se pudo buscar.');
                if (controller.signal.aborted) return;
                setResults(Array.isArray(payload?.data) ? payload.data : []);
                setActive(0);
            } catch (failure) {
                if (controller.signal.aborted) return;
                setError(failure instanceof Error ? failure.message : 'No se pudo buscar.');
                setResults([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, DEBOUNCE_MS);
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [trimmed, kind]);

    // El activo siempre a la vista.
    useEffect(() => {
        const list = listRef.current;
        const item = list?.children[active] as HTMLElement | undefined;
        item?.scrollIntoView({ block: 'nearest' });
    }, [active, results]);

    useImperativeHandle(ref, () => ({
        handleKey(event) {
            switch (event.key) {
                case 'ArrowDown':
                    if (results.length > 0) setActive((current) => (current + 1) % results.length);
                    return true;
                case 'ArrowUp':
                    if (results.length > 0) setActive((current) => (current - 1 + results.length) % results.length);
                    return true;
                case 'Enter':
                case 'Tab': {
                    const chosen = results[active];
                    if (!chosen) return event.key === 'Tab' ? false : true;
                    onPick(chosen);
                    return true;
                }
                case 'Escape':
                    onClose();
                    return true;
                // Alt + ← → recorre los tipos sin sacar las manos del texto.
                case 'ArrowLeft':
                case 'ArrowRight': {
                    if (!event.altKey) return false;
                    const options: Array<MentionKind | null> = [null, ...MENTION_KINDS];
                    const index = options.indexOf(kind);
                    const step = event.key === 'ArrowRight' ? 1 : -1;
                    setKind(options[(index + step + options.length) % options.length]);
                    return true;
                }
                default:
                    return false;
            }
        },
    }), [results, active, kind, onPick, onClose]);

    const status = trimmed.length < MIN_QUERY
        ? 'Seguí escribiendo para buscar un club, un jugador, un torneo, un partido o un video.'
        : loading && results.length === 0
            ? 'Buscando…'
            : error
                ? error
                : results.length === 0
                    ? `Nada con "${trimmed}"${kind ? ` en ${MENTION_KIND_PLURALS[kind].toLowerCase()}` : ''}.`
                    : null;

    return (
        <div
            className={styles.mentionPanel}
            style={{ top: anchor.top, left: anchor.left }}
            role="dialog"
            aria-label="Etiquetar en el texto"
        >
            <div className={styles.mentionKinds} role="tablist" aria-label="Qué buscar">
                {([null, ...MENTION_KINDS] as Array<MentionKind | null>).map((option) => (
                    <button
                        key={option ?? 'all'}
                        type="button"
                        role="tab"
                        aria-selected={kind === option}
                        className={`${styles.mentionKind} ${kind === option ? styles.mentionKindActive : ''}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setKind(option)}
                    >
                        {option ? MENTION_KIND_PLURALS[option] : 'Todo'}
                    </button>
                ))}
            </div>

            {status ? (
                <p className={styles.mentionEmpty} role="status" aria-live="polite">{status}</p>
            ) : (
                <ul ref={listRef} className={styles.mentionList} role="listbox" aria-label="Resultados">
                    {results.map((item, index) => (
                        <li key={`${item.kind}:${item.ref}`} role="option" aria-selected={index === active}>
                            <button
                                type="button"
                                className={`${styles.mentionItem} ${index === active ? styles.mentionItemActive : ''}`}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setActive(index)}
                                onClick={() => onPick(item)}
                            >
                                {item.kind === 'video' ? (
                                    item.logoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- portada del video, chica.
                                        <img src={item.logoUrl} alt="" className={styles.mentionThumb} loading="lazy" />
                                    ) : (
                                        <span className={`${styles.mentionAvatar} ${styles.mentionThumb}`} aria-hidden="true">▶</span>
                                    )
                                ) : item.logoUrl && item.kind !== 'player' ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- escudo por el proxy, chico.
                                    <img src={item.logoUrl} alt="" className={styles.mentionCrest} loading="lazy" />
                                ) : (
                                    <span className={styles.mentionAvatar} aria-hidden="true">{initialsOf(item.label)}</span>
                                )}
                                <span className={styles.mentionText}>
                                    <span className={styles.mentionLabel}>{item.label}</span>
                                    {item.detail && <span className={styles.mentionDetail}>{item.detail}</span>}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className={styles.mentionFoot}>
                <span><kbd className={styles.mentionKbd}>↑↓</kbd> elegir</span>
                <span><kbd className={styles.mentionKbd}>Enter</kbd> etiquetar</span>
                <span><kbd className={styles.mentionKbd}>Alt ←→</kbd> tipo</span>
                <span><kbd className={styles.mentionKbd}>Esc</kbd> cerrar</span>
            </div>
        </div>
    );
});

export default MentionPicker;
