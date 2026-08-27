// "En esta nota": lo que la noticia etiqueta a lo largo del texto —clubes,
// jugadores, torneos, partidos y videos—, en chips que llevan a cada ficha.
// Se dibuja desde las menciones del cuerpo (`collectMentions`) y el mapa
// resuelto (nombre y escudo actuales); lo que no se pudo resolver sale con la
// etiqueta que escribió quien redactó y el link a su ficha.

import { MENTION_KIND_LABELS, hrefForMention, isSiteVideoRef, mentionKey, type MentionRef, type ResolvedMention } from '@/lib/news/mentions';

import styles from './NewsMentionsStrip.module.css';

interface Props {
    mentions: MentionRef[];
    resolved: Record<string, ResolvedMention>;
    /** El id de la nota, para el `aria-labelledby` del grupo. */
    newsId: string;
}

export default function NewsMentionsStrip({ mentions, resolved, newsId }: Props) {
    // Una URL suelta de video no es una entidad de la web: no se lista.
    const items = mentions.filter((mention) => mention.kind !== 'video' || isSiteVideoRef(mention.ref));
    if (items.length === 0) return null;

    const headingId = `mentions-${newsId}`;

    return (
        <div className={styles.strip}>
            <span className={styles.label} id={headingId}>En esta nota</span>
            <ul className={styles.list} aria-labelledby={headingId}>
                {items.map((mention) => {
                    const hit = resolved[mentionKey(mention)];
                    const label = hit?.label || mention.label || MENTION_KIND_LABELS[mention.kind];
                    const href = hit?.href ?? hrefForMention(mention.kind, mention.ref);
                    const logo = hit?.kind === 'video' ? null : hit?.logoUrl ?? null;
                    // "Jugadora" cuando la ficha lo dice (el detalle empieza por el rol); si no, el rótulo del tipo.
                    const role = mention.kind === 'player' ? hit?.detail?.split(' · ')[0] : null;
                    const kindLabel = role && /^Jugador/i.test(role) ? role : MENTION_KIND_LABELS[mention.kind];
                    return (
                        <li key={mentionKey(mention)}>
                            <a href={href} className={styles.chip} data-kind={mention.kind}>
                                {logo ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- escudo por el proxy, chico y debajo del pliegue.
                                    <img src={logo} alt="" loading="lazy" decoding="async" className={styles.crest} />
                                ) : (
                                    <span className={styles.kindDot} aria-hidden="true" />
                                )}
                                <span className={styles.chipLabel}>{label}</span>
                                <span className={styles.chipKind}>{kindLabel}</span>
                            </a>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
