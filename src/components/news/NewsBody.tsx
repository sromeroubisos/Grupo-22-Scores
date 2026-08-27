// El cuerpo de una noticia, dibujado desde el árbol de `richText.ts`.
// Lo usan el lector (/noticias/[id]) y la vista previa del editor: la
// misma nota se ve igual en los dos lados.
//
// Sin `dangerouslySetInnerHTML`: cada nodo es un elemento de React con
// texto adentro. Los links y las imágenes ya vienen filtrados del parser
// (solo http(s), rutas del sitio, mail y anclas).

import type { ReactNode } from 'react';

import { parseRichText, type BlockNode, type InlineNode } from '@/lib/news/richText';

import styles from './NewsBody.module.css';

type NewsBodyProps = {
    content: string | null | undefined;
    /** Qué mostrar cuando el cuerpo está vacío. */
    empty?: ReactNode;
    className?: string;
};

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode[] {
    return nodes.map((node, index) => {
        const key = `${keyPrefix}-${index}`;
        switch (node.type) {
            case 'text':
                return node.text;
            case 'break':
                return <br key={key} />;
            case 'strong':
                return <strong key={key}>{renderInline(node.children, key)}</strong>;
            case 'em':
                return <em key={key}>{renderInline(node.children, key)}</em>;
            case 'link': {
                const external = /^https?:\/\//i.test(node.href);
                return (
                    <a
                        key={key}
                        href={node.href}
                        className={styles.link}
                        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                        {renderInline(node.children, key)}
                    </a>
                );
            }
            default:
                return null;
        }
    });
}

function renderBlock(block: BlockNode, index: number, isLead: boolean): ReactNode {
    const key = `b${index}`;
    switch (block.type) {
        case 'paragraph':
            return (
                <p key={key} className={isLead ? styles.lead : undefined}>
                    {renderInline(block.children, key)}
                </p>
            );
        case 'heading':
            return block.level === 2
                ? <h2 key={key} className={styles.h2}>{renderInline(block.children, key)}</h2>
                : <h3 key={key} className={styles.h3}>{renderInline(block.children, key)}</h3>;
        case 'quote':
            return (
                <blockquote key={key} className={styles.quote}>
                    {block.paragraphs.map((paragraph, pIndex) => (
                        <p key={`${key}-${pIndex}`}>{renderInline(paragraph, `${key}-${pIndex}`)}</p>
                    ))}
                </blockquote>
            );
        case 'list':
            return block.ordered
                ? <ol key={key} className={styles.list}>{block.items.map((item, iIndex) => <li key={`${key}-${iIndex}`}>{renderInline(item, `${key}-${iIndex}`)}</li>)}</ol>
                : <ul key={key} className={styles.list}>{block.items.map((item, iIndex) => <li key={`${key}-${iIndex}`}>{renderInline(item, `${key}-${iIndex}`)}</li>)}</ul>;
        case 'image':
            return (
                <figure key={key} className={styles.figure}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagen remota elegida por quien redacta; va debajo del pliegue. */}
                    <img src={block.src} alt={block.alt} loading="lazy" decoding="async" />
                    {block.caption && <figcaption>{block.caption}</figcaption>}
                </figure>
            );
        case 'rule':
            return <hr key={key} className={styles.rule} />;
        default:
            return null;
    }
}

export default function NewsBody({ content, empty, className }: NewsBodyProps) {
    const blocks = parseRichText(content);
    if (blocks.length === 0) {
        return empty ? <div className={`${styles.body} ${className ?? ''}`}>{empty}</div> : null;
    }

    // El primer párrafo sale destacado, pero solo si es lo primero que se lee:
    // detrás de un subtítulo o una foto ya no es la entrada de la nota.
    const leadIndex = blocks[0].type === 'paragraph' ? 0 : -1;

    return (
        <div className={`${styles.body} ${className ?? ''}`}>
            {blocks.map((block, index) => renderBlock(block, index, index === leadIndex))}
        </div>
    );
}
