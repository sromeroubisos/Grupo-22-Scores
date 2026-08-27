// El cuerpo de una noticia, dibujado desde el árbol de `richText.ts`.
// Lo usan el lector (/noticias/[id]) y la vista previa del editor: la
// misma nota se ve igual en los dos lados.
//
// Sin `dangerouslySetInnerHTML`: cada nodo es un elemento de React con
// texto adentro. Los links y las imágenes ya vienen filtrados del parser
// (solo http(s), rutas del sitio, mail y anclas).
//
// Las menciones (`@[Los Tilos](club:<id>)`) salen como link a la ficha, con
// el escudo si quien contiene el cuerpo pasó las menciones resueltas
// (`mentions`). Un partido solo en su renglón es una tarjeta con escudos y
// marcador; un video solo en su renglón, el reproductor. Sin resolver
// (todavía, o porque la entidad ya no existe) se dibujan como link pelado
// con la etiqueta escrita: la nota nunca se rompe por un dato ajeno.

import type { ReactNode } from 'react';

import { parseRichText, type BlockNode, type InlineNode } from '@/lib/news/richText';
import {
    MENTION_KIND_LABELS,
    hrefForMention,
    isSiteVideoRef,
    matchContextOf,
    matchLabelOf,
    mentionKey,
    type MentionMatch,
    type ResolvedMention,
} from '@/lib/news/mentions';
import { detectVideoProvider, stableVideoId, type MatchVideoLink } from '@/lib/matches/videoLinks';

import NewsVideoEmbed from './NewsVideoEmbed';
import styles from './NewsBody.module.css';

type NewsBodyProps = {
    content: string | null | undefined;
    /** Qué mostrar cuando el cuerpo está vacío. */
    empty?: ReactNode;
    className?: string;
    /** Las menciones resueltas contra la web, por `tipo:id`. Sin esto, cada mención es un link con su etiqueta. */
    mentions?: Record<string, ResolvedMention>;
    /** El título de la nota: va en el título accesible de un video pegado como URL suelta. */
    title?: string;
};

type Resolved = Record<string, ResolvedMention>;

function Mention({ kind, refId, label, resolved }: { kind: ResolvedMention['kind']; refId: string; label: string; resolved: Resolved }) {
    const hit = resolved[mentionKey({ kind, ref: refId })];
    const href = hit?.href ?? hrefForMention(kind, refId);
    const external = /^https?:\/\//i.test(href);
    const crest = hit && hit.kind !== 'video' && hit.kind !== 'player' ? hit.logoUrl : null;
    return (
        <a
            href={href}
            className={styles.mention}
            data-kind={kind}
            title={hit?.detail ?? MENTION_KIND_LABELS[kind]}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
            {crest && (
                // eslint-disable-next-line @next/next/no-img-element -- escudo chico por el proxy, en medio del texto.
                <img src={crest} alt="" loading="lazy" decoding="async" className={styles.mentionCrest} />
            )}
            {label || hit?.label || MENTION_KIND_LABELS[kind]}
        </a>
    );
}

function renderInline(nodes: InlineNode[], keyPrefix: string, resolved: Resolved): ReactNode[] {
    return nodes.map((node, index) => {
        const key = `${keyPrefix}-${index}`;
        switch (node.type) {
            case 'text':
                return node.text;
            case 'break':
                return <br key={key} />;
            case 'strong':
                return <strong key={key}>{renderInline(node.children, key, resolved)}</strong>;
            case 'em':
                return <em key={key}>{renderInline(node.children, key, resolved)}</em>;
            case 'link': {
                const external = /^https?:\/\//i.test(node.href);
                return (
                    <a
                        key={key}
                        href={node.href}
                        className={styles.link}
                        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                        {renderInline(node.children, key, resolved)}
                    </a>
                );
            }
            case 'mention':
                return <Mention key={key} kind={node.kind} refId={node.ref} label={node.label} resolved={resolved} />;
            default:
                return null;
        }
    });
}

function Team({ team, align }: { team: MentionMatch['home']; align: 'home' | 'away' }) {
    return (
        <span className={`${styles.matchTeam} ${align === 'away' ? styles.matchTeamAway : ''}`}>
            {team.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- escudo por el proxy, debajo del pliegue.
                <img src={team.logoUrl} alt="" loading="lazy" decoding="async" className={styles.matchCrest} />
            )}
            <span className={styles.matchTeamName}>{team.name}</span>
        </span>
    );
}

/** La tarjeta de un partido de la web: escudos, marcador (o "vs"), torneo, fecha y el link a la ficha. */
function MatchCard({ match, href }: { match: MentionMatch; href: string }) {
    const context = matchContextOf(match);
    const live = match.status === 'live' || match.status === 'in_progress';
    return (
        <a href={href} className={styles.matchCard} aria-label={`${matchLabelOf(match)}: ver la ficha del partido`}>
            {context && <span className={styles.matchContext}>{context}</span>}
            <span className={styles.matchRow}>
                <Team team={match.home} align="home" />
                {match.score ? (
                    <span className={`${styles.matchScore} ${live ? styles.matchScoreLive : ''}`}>
                        <span>{match.score.home}</span>
                        <span className={styles.matchScoreDash} aria-hidden="true">–</span>
                        <span>{match.score.away}</span>
                    </span>
                ) : (
                    <span className={styles.matchVs}>vs</span>
                )}
                <Team team={match.away} align="away" />
            </span>
            <span className={styles.matchCta}>Ver la ficha del partido →</span>
        </a>
    );
}

/** Un video pegado como URL suelta: un link con la forma que el reproductor entiende. */
function videoFromUrl(url: string, label: string | null): MatchVideoLink {
    return {
        id: stableVideoId(url),
        url,
        kind: 'clip',
        title: label,
        provider: detectVideoProvider(url),
        addedAt: '',
        thumbnailUrl: null,
    };
}

function renderEmbed(block: Extract<BlockNode, { type: 'embed' }>, key: string, resolved: Resolved, title: string | undefined): ReactNode {
    const hit = resolved[mentionKey(block)];

    if (block.kind === 'match') {
        if (hit?.match) return <MatchCard key={key} match={hit.match} href={hit.href} />;
        return (
            <p key={key}>
                <Mention kind="match" refId={block.ref} label={block.label ?? 'Ver el partido'} resolved={resolved} />
            </p>
        );
    }

    // Video: el de la web (resuelto, con portada y partido) o una URL suelta.
    if (isSiteVideoRef(block.ref)) {
        if (hit?.video && hit.match) {
            return (
                <NewsVideoEmbed
                    key={key}
                    video={hit.video}
                    matchLabel={matchLabelOf(hit.match)}
                    caption={{ text: [matchLabelOf(hit.match), hit.match.tournament?.name].filter(Boolean).join(' · '), href: hrefForMention('match', hit.match.id) }}
                />
            );
        }
        return (
            <p key={key}>
                <Mention kind="video" refId={block.ref} label={block.label ?? 'Ver el video'} resolved={resolved} />
            </p>
        );
    }

    return (
        <NewsVideoEmbed
            key={key}
            video={videoFromUrl(block.ref, block.label)}
            matchLabel={block.label ?? title ?? 'Video de la nota'}
            caption={null}
        />
    );
}

function renderBlock(block: BlockNode, index: number, isLead: boolean, resolved: Resolved, title: string | undefined): ReactNode {
    const key = `b${index}`;
    switch (block.type) {
        case 'paragraph':
            return (
                <p key={key} className={isLead ? styles.lead : undefined}>
                    {renderInline(block.children, key, resolved)}
                </p>
            );
        case 'heading':
            return block.level === 2
                ? <h2 key={key} className={styles.h2}>{renderInline(block.children, key, resolved)}</h2>
                : <h3 key={key} className={styles.h3}>{renderInline(block.children, key, resolved)}</h3>;
        case 'quote':
            return (
                <blockquote key={key} className={styles.quote}>
                    {block.paragraphs.map((paragraph, pIndex) => (
                        <p key={`${key}-${pIndex}`}>{renderInline(paragraph, `${key}-${pIndex}`, resolved)}</p>
                    ))}
                </blockquote>
            );
        case 'list':
            return block.ordered
                ? <ol key={key} className={styles.list}>{block.items.map((item, iIndex) => <li key={`${key}-${iIndex}`}>{renderInline(item, `${key}-${iIndex}`, resolved)}</li>)}</ol>
                : <ul key={key} className={styles.list}>{block.items.map((item, iIndex) => <li key={`${key}-${iIndex}`}>{renderInline(item, `${key}-${iIndex}`, resolved)}</li>)}</ul>;
        case 'image':
            return (
                <figure key={key} className={styles.figure}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagen remota elegida por quien redacta; va debajo del pliegue. */}
                    <img src={block.src} alt={block.alt} loading="lazy" decoding="async" />
                    {block.caption && <figcaption>{block.caption}</figcaption>}
                </figure>
            );
        case 'embed':
            return renderEmbed(block, key, resolved, title);
        case 'rule':
            return <hr key={key} className={styles.rule} />;
        default:
            return null;
    }
}

export default function NewsBody({ content, empty, className, mentions, title }: NewsBodyProps) {
    const blocks = parseRichText(content);
    if (blocks.length === 0) {
        return empty ? <div className={`${styles.body} ${className ?? ''}`}>{empty}</div> : null;
    }

    const resolved: Resolved = mentions ?? {};

    // El primer párrafo sale destacado, pero solo si es lo primero que se lee:
    // detrás de un subtítulo o una foto ya no es la entrada de la nota.
    const leadIndex = blocks[0].type === 'paragraph' ? 0 : -1;

    return (
        <div className={`${styles.body} ${className ?? ''}`}>
            {blocks.map((block, index) => renderBlock(block, index, index === leadIndex, resolved, title))}
        </div>
    );
}
