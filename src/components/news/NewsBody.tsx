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

import { Fragment, type ReactNode } from 'react';

import { parseRichText, type BlockNode, type InlineNode } from '@/lib/news/richText';
import {
    MENTION_KIND_LABELS,
    hrefForMention,
    isSiteVideoRef,
    matchDateLabel,
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

/** Una mención en medio de una frase: texto con el nombre, sin escudo ni píldora. */
function Mention({ kind, refId, label, resolved }: { kind: ResolvedMention['kind']; refId: string; label: string; resolved: Resolved }) {
    const hit = resolved[mentionKey({ kind, ref: refId })];
    const href = hit?.href ?? hrefForMention(kind, refId);
    const external = /^https?:\/\//i.test(href);
    return (
        <a
            href={href}
            className={styles.mention}
            data-kind={kind}
            title={hit?.detail ?? MENTION_KIND_LABELS[kind]}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
            {label || hit?.label || MENTION_KIND_LABELS[kind]}
        </a>
    );
}

type MentionNode = Extract<InlineNode, { type: 'mention' }>;

/**
 * Las menciones que cierran un párrafo o un subtítulo no van en medio de una
 * frase: son un bloque (la tarjeta del partido, la ficha del torneo o del
 * club). Cuenta como cierre la que va sola en su renglón (después de un salto
 * de línea) o la que sigue a una frase terminada ("... Urú Curé. @[...]").
 * Se separan del texto para dibujarlas aparte.
 */
function splitTrailingMentions(nodes: InlineNode[]): { lead: InlineNode[]; cards: MentionNode[] } {
    const isBlankText = (node: InlineNode | undefined) => node?.type === 'text' && node.text.trim() === '';
    // La frase puede estar entera dentro de una cursiva o una negrita: se mira el final del texto de adentro.
    const endsSentence = (node: InlineNode | undefined): boolean => {
        if (!node) return false;
        if (node.type === 'text') return /[.!?:]\s*$/.test(node.text);
        if (node.type === 'em' || node.type === 'strong') {
            let k = node.children.length - 1;
            while (k >= 0 && isBlankText(node.children[k])) k -= 1;
            return k >= 0 && endsSentence(node.children[k]);
        }
        return false;
    };

    let last = nodes.length - 1;
    while (last >= 0 && isBlankText(nodes[last])) last -= 1;

    // La mención va dentro de una cursiva o una negrita que cierra el párrafo: se saca de ahí.
    const wrapper = nodes[last];
    if (wrapper && (wrapper.type === 'em' || wrapper.type === 'strong')) {
        const inner = splitTrailingMentions(wrapper.children);
        if (inner.cards.length > 0) {
            const rebuilt = inner.lead.length > 0
                ? [...nodes.slice(0, last), { ...wrapper, children: inner.lead }]
                : nodes.slice(0, last);
            const more = splitTrailingMentions(rebuilt);
            return { lead: more.lead, cards: [...more.cards, ...inner.cards] };
        }
    }

    const cards: MentionNode[] = [];
    let end = nodes.length;

    while (end > 0) {
        let i = end - 1;
        while (i >= 0 && isBlankText(nodes[i])) i -= 1;
        const node = nodes[i];
        if (!node || node.type !== 'mention') break;

        let j = i - 1;
        while (j >= 0 && isBlankText(nodes[j])) j -= 1;
        const closes = j < 0 || nodes[j].type === 'break' || endsSentence(nodes[j]);
        if (!closes) break;

        cards.unshift(node);
        // El salto de línea se descarta; el texto de la frase se queda tal cual.
        end = j < 0 ? 0 : nodes[j].type === 'break' ? j : j + 1;
    }

    return { lead: nodes.slice(0, end), cards };
}

/** El escudo de un equipo en la tarjeta: la imagen, o la inicial si no hay. */
function Crest({ name, logoUrl, className }: { name: string; logoUrl: string | null; className: string }) {
    return (
        <span className={className} aria-hidden="true">
            {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- escudo por el proxy, debajo del pliegue.
                <img src={logoUrl} alt="" loading="lazy" decoding="async" />
            ) : (
                <span className={styles.crestInitial}>{name.trim().charAt(0).toUpperCase()}</span>
            )}
        </span>
    );
}

/**
 * Un club, un torneo o un jugador como bloque, con la misma forma que la
 * tarjeta de un partido: arriba qué es y, a la derecha, un rótulo; abajo el
 * escudo y el nombre. No es un link con flecha: es una ficha que se toca.
 */
function EntityCard({ node, resolved }: { node: MentionNode; resolved: Resolved }) {
    const hit = resolved[mentionKey({ kind: node.kind, ref: node.ref })];

    // Un partido resuelto es la tarjeta del partido, con los dos escudos y el marcador.
    if (node.kind === 'match' && hit?.match) return <MatchCard match={hit.match} href={hit.href} />;

    const href = hit?.href ?? hrefForMention(node.kind, node.ref);
    const name = node.label || hit?.label || MENTION_KIND_LABELS[node.kind];
    const crest = hit && hit.kind !== 'video' ? hit.logoUrl : null;
    const role = node.kind === 'player' ? hit?.detail?.split(' · ')[0] : null;
    const kindLabel = role && /^Jugador/i.test(role) ? role : MENTION_KIND_LABELS[node.kind];
    // El detalle ("Rugby Argentina 2026") va en el rótulo de la derecha, sin repetir el nombre ni el tipo.
    const detail = node.kind !== 'player' && hit?.detail && hit.detail !== name && hit.detail !== kindLabel ? hit.detail : null;
    const external = /^https?:\/\//i.test(href);

    return (
        <a
            href={href}
            className={styles.entityCard}
            data-kind={node.kind}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
            <span className={styles.cardHead}>
                <span className={styles.cardWhen}>{kindLabel}</span>
                {detail && <span className={styles.cardPill}>{detail}</span>}
            </span>
            <span className={styles.entityBody}>
                <Crest name={name} logoUrl={crest} className={styles.entityCrest} />
                <strong className={styles.entityName}>{name}</strong>
            </span>
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

/**
 * La tarjeta de un partido de la web: arriba la fecha (y la fecha del torneo)
 * y a la derecha la competición en una píldora; abajo, el equipo local, su
 * escudo, el marcador (o "vs"), el escudo del visitante y su nombre.
 */
function MatchCard({ match, href }: { match: MentionMatch; href: string }) {
    const live = match.status === 'live' || match.status === 'in_progress';
    const when = [matchDateLabel(match.dateTime), match.roundLabel].filter(Boolean).join(' · ');
    return (
        <a href={href} className={styles.matchCard} aria-label={`${matchLabelOf(match)}: ver la ficha del partido`}>
            <span className={styles.cardHead}>
                <span className={styles.cardWhen}>{live ? 'En vivo' : when || 'Partido'}</span>
                {match.tournament?.name && <span className={styles.cardPill}>{match.tournament.name}</span>}
            </span>
            <span className={styles.matchRow}>
                <span className={`${styles.matchName} ${styles.matchNameHome}`}>{match.home.name}</span>
                <Crest name={match.home.name} logoUrl={match.home.logoUrl} className={styles.matchCrest} />
                {match.score ? (
                    <span className={`${styles.matchScore} ${live ? styles.matchScoreLive : ''}`}>
                        <span>{match.score.home}</span>
                        <span className={styles.matchScoreDash} aria-hidden="true">-</span>
                        <span>{match.score.away}</span>
                    </span>
                ) : (
                    <span className={styles.matchVs}>vs</span>
                )}
                <Crest name={match.away.name} logoUrl={match.away.logoUrl} className={styles.matchCrest} />
                <span className={`${styles.matchName} ${styles.matchNameAway}`}>{match.away.name}</span>
            </span>
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
        case 'paragraph': {
            const { lead, cards } = splitTrailingMentions(block.children);
            return (
                <Fragment key={key}>
                    {lead.length > 0 && (
                        <p className={isLead ? styles.lead : undefined}>{renderInline(lead, key, resolved)}</p>
                    )}
                    {cards.map((card, cIndex) => <EntityCard key={`${key}-c${cIndex}`} node={card} resolved={resolved} />)}
                </Fragment>
            );
        }
        case 'heading': {
            const { lead, cards } = splitTrailingMentions(block.children);
            const content = renderInline(lead, key, resolved);
            return (
                <Fragment key={key}>
                    {lead.length > 0 && (block.level === 2
                        ? <h2 className={styles.h2}>{content}</h2>
                        : <h3 className={styles.h3}>{content}</h3>)}
                    {cards.map((card, cIndex) => <EntityCard key={`${key}-c${cIndex}`} node={card} resolved={resolved} />)}
                </Fragment>
            );
        }
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
