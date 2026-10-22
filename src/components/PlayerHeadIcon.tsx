/**
 * Cabeza de perfil para los jugadores sin foto. Es el icono `side-profile` de
 * Reicon (https://github.com/dqev/reicon), licencia MIT, copiado inline para no
 * sumar una dependencia por un solo dibujo. Dos pesos: `filled` para avatares
 * (se lee mas cuando es grande) y `outline` para listados chicos.
 *
 * Decorativo por defecto: junto al nombre del jugador el icono no agrega
 * informacion. Si va solo, pasar `title`.
 */

type Props = {
    size?: number;
    weight?: 'filled' | 'outline';
    title?: string;
    className?: string;
};

export default function PlayerHeadIcon({ size = 24, weight = 'filled', title, className }: Props) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className={className}
            role={title ? 'img' : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
            focusable="false"
        >
            {title ? <title>{title}</title> : null}
            {weight === 'filled' ? (
                <path
                    fill="currentColor"
                    d="M22.7999 12.4l-1.8053-2.408c-.096-2.592-1.296-4.9987-3.32-6.6453-2.116-1.7187-4.8867-2.3773-7.6013-1.812C6.6733 2.2453 3.9133 5.004 3.2013 8.4026c-.7987 3.824.852 7.6 4.132 9.588v3.6747c0 .552.448 1 1 1h6.6666c.552 0 1-.448 1-1v-2.3333h1.1867c1.9133 0 3.52-1.4947 3.656-3.4013l.104-1.4333 1.424-.5693c.2893-.1147.508-.3587.5907-.6587.084-.3.0253-.6213-.1627-.8707ZM16.6666 10.6667c-.736 0-1.3333-.5973-1.3333-1.3333s.5973-1.3333 1.3333-1.3333 1.3333.5973 1.3333 1.3333-.5973 1.3333-1.3333 1.3333Z"
                />
            ) : (
                <>
                    <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 21.6666v-3.3333h2.1853c1.3987 0 2.5587-1.08 2.66-2.4747l.1493-2.0573 2.0053-.8013-2-2.6667c0-4.9813-4.5533-8.9-9.724-7.82-3.0213.6307-5.4627 3.0733-6.0947 6.0933-.7933 3.7947 1.12 7.224 4.152 8.8v4.26"
                    />
                    <circle cx="16.3333" cy="9.6666" r="1" fill="currentColor" />
                </>
            )}
        </svg>
    );
}
