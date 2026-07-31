import type { Metadata } from 'next';
import Link from 'next/link';
import { LOCALE_HTML_LANG, stringsFor } from '@/features/career';
import CareerCard, { CARD_HEIGHT, CARD_WIDTH } from '../../CareerCard';
import styles from '../../carrera.module.css';
import { localeFromQuery, requestOrigin, resolveSharedCareer } from './shared';

interface Props {
    params: Promise<{ token: string }>;
    /** `?lang=en` lo pone el que comparte: en el servidor no hay preferencia que leer. */
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
    const { token } = await params;
    const locale = localeFromQuery(await searchParams);
    const t = stringsFor(locale);
    const shared = await resolveSharedCareer(token, locale);

    if (shared.kind === 'broken') {
        return { title: t.pageTitle, description: shared.detail };
    }

    // El título del chat es el titular del retiro, no "Carrera de Rugby": lo que
    // se comparte es la carrera de alguien, no el juego.
    const title = `${shared.card.headline} · ${shared.card.surname}`;
    const description = t.shareMetaDescription(shared.card.position, shared.card.nationality, shared.card.span);

    // LA VISTA PREVIA DEL CHAT TAMBIÉN VA EN INGLÉS.
    //
    // `opengraph-image.tsx` es una convención de Next y NO recibe la query, así
    // que por sí sola siempre dibujaría la tarjeta en español. La ruta `imagen`
    // sí la recibe y produce EXACTAMENTE la misma imagen (`CARD_SIZES.feed` es lo
    // que usa la og:image), así que en inglés se la apunta a mano. En español se
    // deja la convención, que además cubre el caso del link roto.
    const images = locale === 'en'
        ? [{
            url: `${await requestOrigin()}/juegos/minijuegos/carrera-rugby/c/${token}/imagen?formato=feed&lang=en`,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
        }]
        : undefined;

    return {
        title: `${title} | G22 Scores`,
        description,
        openGraph: { title, description, type: 'article', ...(images ? { images } : {}) },
        twitter: { card: 'summary_large_image', title, description, ...(images ? { images } : {}) },
    };
}

export default async function SharedCareerPage({ params, searchParams }: Props) {
    const { token } = await params;
    const locale = localeFromQuery(await searchParams);
    const t = stringsFor(locale);
    const shared = await resolveSharedCareer(token, locale);

    return (
        // `lang` en el contenedor y no en `<html>`: esta página se sirve dentro
        // del layout del sitio, que declara español. Sin esto un lector de
        // pantalla leería el inglés con fonética castellana.
        <main className={styles.sharePage} lang={LOCALE_HTML_LANG[locale]}>
            {/* El h1 va oculto a la vista, no ausente: la tarjeta ya escribe
                "CARRERA DE RUGBY" a dos centímetros y repetirlo era leerlo dos
                veces seguidas. El lector de pantalla lo necesita igual, y la
                regla de un solo h1 por página se sigue cumpliendo. */}
            <h1 className={styles.srOnly}>{t.gameTitle}</h1>

            {shared.kind !== 'broken' ? (
                <>
                    {/* La tarjeta viene con la medida fija de la og:image. Se
                        escala con variables CSS en vez de reflowear: es la MISMA
                        pieza que se ve en el chat, no una versión web. */}
                    <div
                        className={styles.shareCardFrame}
                        style={{
                            ['--card-w' as string]: `${CARD_WIDTH}px`,
                            ['--card-h' as string]: `${CARD_HEIGHT}px`,
                            ['--card-ratio' as string]: `${CARD_WIDTH} / ${CARD_HEIGHT}`,
                        }}
                    >
                        <div className={styles.shareCardScaler}>
                            <CareerCard data={shared.card} />
                        </div>
                    </div>

                    <p className={styles.shareFoot}>
                        {shared.kind === 'ok' ? t.sharePageReplayNote : t.sharePageReceiptNote}
                    </p>
                </>
            ) : (
                <div className={styles.shareBroken}>
                    <h2 className={styles.shareBrokenTitle}>{shared.title}</h2>
                    <p className={styles.shareBrokenText}>{shared.detail}</p>
                </div>
            )}

            <Link href="/juegos/minijuegos/carrera-rugby" className={styles.shareCta}>
                {t.sharePageCta}
            </Link>
        </main>
    );
}
