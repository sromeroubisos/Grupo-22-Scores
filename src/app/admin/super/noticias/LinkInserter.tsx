'use client';

// El panel de "Link o video" del cuerpo de la nota.
//
// Existe porque un link pegado y un video embebido se escriben distinto y
// hasta ahora no se veía: la barra escribía `[texto del link](url)` para
// todo, así que un tweet con un video terminaba como una palabra azul. Acá
// se pega la dirección una sola vez, el panel dice qué se va a ver, y quien
// redacta elige: el contenido adentro de la nota, o solo el link.
//
// Lo que se inserta es texto plano, como el resto de la barra:
//   · video → la URL sola en su renglón (lib/news/richText.ts la embebe)
//   · link  → `[texto](url)`

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link2, Play, X } from 'lucide-react';

import { VIDEO_PROVIDER_LABELS, parseVideoUrl } from '@/lib/matches/videoLinks';

import styles from './NewsEditor.module.css';

export type InsertMode = 'video' | 'link';

interface Props {
    /** La dirección con la que abre: lo seleccionado, si era una URL. */
    initialUrl: string;
    /** El texto del link: lo seleccionado, si no era una URL. */
    initialText: string;
    onInsert(mode: InsertMode, url: string, text: string): void;
    onClose(): void;
}

/** Las publicaciones traen el video adentro de la tarjeta de la red, no un reproductor pelado. */
const POST_PROVIDERS = new Set(['x', 'instagram', 'tiktok', 'facebook']);

interface Verdict {
    /** null mientras no haya una dirección válida. */
    label: string | null;
    /** Qué se va a ver si se elige "Mostrar el contenido". */
    detail: string;
    canEmbed: boolean;
    isUrl: boolean;
}

function verdictOf(raw: string): Verdict {
    const url = raw.trim();
    if (!url) {
        return { label: null, detail: 'Pegá el link de YouTube, X, Instagram, Facebook, ESPN, TikTok o Vimeo.', canEmbed: false, isUrl: false };
    }
    const parsed = parseVideoUrl(url);
    if (!parsed) {
        return { label: null, detail: 'Eso no es un link. Tiene que empezar con https://.', canEmbed: false, isUrl: false };
    }
    const label = VIDEO_PROVIDER_LABELS[parsed.provider];
    if (parsed.embedUrl) {
        return {
            label,
            detail: POST_PROVIDERS.has(parsed.provider)
                ? `La publicación de ${label} se ve adentro de la nota, con su video.`
                : `El reproductor de ${label} se ve adentro de la nota.`,
            canEmbed: true,
            isUrl: true,
        };
    }
    return {
        label: parsed.provider === 'other' ? parsed.host : label,
        detail: parsed.provider === 'other'
            ? 'Este sitio no deja mostrar el contenido adentro de la nota: sale como tarjeta para abrirlo afuera.'
            : `${label} no deja mostrar este contenido adentro de la nota: sale como tarjeta para abrirlo afuera.`,
        canEmbed: false,
        isUrl: true,
    };
}

export default function LinkInserter({ initialUrl, initialText, onInsert, onClose }: Props) {
    const [url, setUrl] = useState(initialUrl);
    const [text, setText] = useState(initialText);
    const [chosen, setChosen] = useState<InsertMode | null>(initialUrl && initialText ? 'link' : null);
    const urlRef = useRef<HTMLInputElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const verdict = useMemo(() => verdictOf(url), [url]);
    // Sin elección explícita manda lo que hace el link: si se puede ver, se ve.
    const mode: InsertMode = chosen ?? (verdict.canEmbed ? 'video' : 'link');

    useEffect(() => {
        urlRef.current?.focus();
        urlRef.current?.select();
    }, []);

    // Cerrar al tocar afuera: el panel se apoya sobre el textarea.
    useEffect(() => {
        function onPointerDown(event: MouseEvent) {
            if (!panelRef.current?.contains(event.target as Node)) onClose();
        }
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [onClose]);

    const missing = !verdict.isUrl
        ? (url.trim() ? 'Revisá el link: tiene que empezar con https://.' : 'Pegá un link para insertarlo.')
        : mode === 'link' && !text.trim()
            ? 'Escribí el texto que se va a leer.'
            : null;

    function submit() {
        if (missing) return;
        onInsert(mode, url.trim(), text.trim());
    }

    function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
        }
    }

    const options: Array<{ value: InsertMode; title: string; hint: string; Icon: typeof Play }> = [
        {
            value: 'video',
            title: 'Mostrar el contenido',
            hint: verdict.isUrl ? verdict.detail : 'El video se ve adentro de la nota, no hay que salir a buscarlo.',
            Icon: Play,
        },
        {
            value: 'link',
            title: 'Solo el link',
            hint: 'Una palabra del texto que lleva afuera. El lector se va de la nota para verlo.',
            Icon: Link2,
        },
    ];

    return (
        <div ref={panelRef} className={styles.insertPanel} role="dialog" aria-label="Insertar un link o un video" onKeyDown={onKeyDown}>
            <div className={styles.insertHead}>
                <strong>Link o video</strong>
                <button type="button" className={styles.insertClose} onClick={onClose} aria-label="Cerrar sin insertar">
                    <X size={15} aria-hidden="true" />
                </button>
            </div>

            <div className={styles.insertField}>
                <label htmlFor="news-insert-url" className={styles.label}>Dirección</label>
                <input
                    id="news-insert-url"
                    ref={urlRef}
                    type="url"
                    className={styles.input}
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://x.com/…"
                    spellCheck={false}
                    autoComplete="off"
                    aria-describedby="news-insert-verdict"
                />
                <p id="news-insert-verdict" className={`${styles.hint} ${url.trim() && !verdict.isUrl ? styles.hintError : ''}`}>
                    {verdict.label && <><strong className={styles.insertProvider}>{verdict.label}</strong>{' · '}</>}
                    {verdict.detail}
                </p>
            </div>

            <div className={styles.insertModes} role="radiogroup" aria-label="Qué insertar">
                {options.map(({ value, title, hint, Icon }) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={mode === value}
                        className={`${styles.insertMode} ${mode === value ? styles.insertModeActive : ''}`}
                        onClick={() => setChosen(value)}
                    >
                        <Icon size={15} aria-hidden="true" />
                        <span className={styles.insertModeText}>
                            <span className={styles.insertModeTitle}>{title}</span>
                            <span className={styles.insertModeHint}>{hint}</span>
                        </span>
                    </button>
                ))}
            </div>

            {mode === 'link' && (
                <div className={styles.insertField}>
                    <label htmlFor="news-insert-text" className={styles.label}>Texto del link</label>
                    <input
                        id="news-insert-text"
                        type="text"
                        className={styles.input}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder="la crónica del partido"
                    />
                </div>
            )}

            <div className={styles.insertActions}>
                <span className={styles.insertMissing}>{missing}</span>
                <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={onClose}>Cancelar</button>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={submit} disabled={Boolean(missing)}>
                    Insertar
                </button>
            </div>
        </div>
    );
}
