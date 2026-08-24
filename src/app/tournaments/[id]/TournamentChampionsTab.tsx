'use client';

/**
 * Tab "Campeones": palmarés del torneo y la lista completa de temporadas con
 * su campeón. Cada fila navega al RESUMEN de esa temporada: el href fuerza
 * tab=summary y onNavigate cambia la pestaña activa en el padre — cambiar solo
 * el seasonId no desmonta la página, así que sin eso el usuario quedaba en
 * Campeones mirando la misma lista y no sabía si había navegado.
 *
 * No hace ningún fetch: se alimenta de las mismas SeasonOption del selector de
 * temporadas, que ya traen campeón (y co-campeones de títulos compartidos)
 * resueltos por /api/db/tournaments/[id]/seasons con el logo ya pasado por el
 * proxy — acá nunca llega un base64 gigante.
 *
 * El palmarés se lee como podio: el 1-2-3 va en tarjetas con su medalla y el
 * resto baja como listado con una barra proporcional al líder. La MISMA cuenta
 * (buildPalmares) alimenta el export, así la imagen nunca dice otra cosa que la
 * pantalla.
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Trophy, ChevronRight } from 'lucide-react';
import ExportImage, { type StandingsData } from '@/components/ExportImage';
import styles from './page.module.css';

export type ChampionRef = { id: string; name: string; logo: string | null };

export type ChampionSeasonItem = {
    id: string;
    label: string;
    name: string;
    href: string;
    status?: string | null;
    champion?: ChampionRef | null;
    coChampions?: ChampionRef[];
};

export type PalmaresEntry = {
    club: ChampionRef;
    titulos: number;
    /** Puesto con empates compartidos (1, 2, 2, 4): dos clubes con la misma
     *  cantidad de títulos no pueden quedar uno arriba del otro. */
    puesto: number;
};

/** Oro, plata y bronce del podio. Los comparten la pantalla y el canvas del
 *  export: si cambia acá, cambia en los dos lados. */
export const PALMARES_MEDALS = ['#d4a72c', '#b6c0cc', '#c8813f'];
/** La misma medalla sobre fondo claro: el oro y la plata puros no llegan a
 *  contraste como tinta. El afiche hace el mismo cambio en su rama clara. */
const PALMARES_MEDALS_LIGHT = ['#a16207', '#5b6675', '#95562a'];

export function ClubCrest({ club, size }: { club: ChampionRef; size: number }) {
    if (!club.logo) {
        return (
            <span className={styles.championCrestFallback} style={{ width: size, height: size }} aria-hidden="true">
                {club.name.slice(0, 2).toUpperCase()}
            </span>
        );
    }
    return (
        <img
            src={club.logo}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            className={styles.championCrest}
            onError={(event) => { (event.target as HTMLImageElement).style.visibility = 'hidden'; }}
        />
    );
}

function championsOf(season: ChampionSeasonItem): ChampionRef[] {
    if (!season.champion) return [];
    return [season.champion, ...(season.coChampions || [])];
}

function hrefResumen(href: string): string {
    const [path, query = ''] = href.split('?');
    const params = new URLSearchParams(query);
    params.set('tab', 'summary');
    return `${path}?${params.toString()}`;
}

/** Títulos por club; un título compartido suma uno a cada club. */
export function buildPalmares(seasons: ChampionSeasonItem[]): PalmaresEntry[] {
    const porClub = new Map<string, { club: ChampionRef; titulos: number }>();
    for (const season of seasons) {
        for (const club of championsOf(season)) {
            const actual = porClub.get(club.id);
            if (actual) actual.titulos += 1;
            else porClub.set(club.id, { club, titulos: 1 });
        }
    }

    const ordenado = Array.from(porClub.values()).sort(
        (a, b) => b.titulos - a.titulos || a.club.name.localeCompare(b.club.name, 'es'),
    );

    let puesto = 0;
    let anterior = Number.NaN;
    return ordenado.map((entrada, index) => {
        if (entrada.titulos !== anterior) {
            puesto = index + 1;
            anterior = entrada.titulos;
        }
        return { ...entrada, puesto };
    });
}

/** La bajada del palmarés: la misma frase en la tarjeta y en el afiche. */
export function palmaresSubtitle(ediciones: number, campeones: number): string {
    return `${ediciones} ediciones · ${campeones} ${campeones === 1 ? 'campeón' : 'campeones'}`;
}

export function buildPalmaresExportData(
    palmares: PalmaresEntry[],
    { title, subtitle, tournamentLogo }: { title: string; subtitle: string; tournamentLogo?: string },
): StandingsData {
    return {
        title,
        subtitle,
        tournamentLogo,
        variant: 'palmares',
        columnLabels: { points: 'Títulos' },
        // El afiche lee `points` como títulos; las otras columnas de la tabla de
        // posiciones no existen en un palmarés y van vacías a propósito.
        rows: palmares.map(({ club, titulos, puesto }) => ({
            pos: puesto,
            team: club.name,
            teamLogo: club.logo || undefined,
            zoneColor: PALMARES_MEDALS[puesto - 1],
            played: '',
            won: '',
            lost: '',
            diff: '',
            points: titulos,
        })),
    };
}

export default function TournamentChampionsTab({
    seasons,
    tournamentName,
    tournamentLogo,
    onNavigate,
}: {
    seasons: ChampionSeasonItem[];
    tournamentName?: string;
    tournamentLogo?: string;
    onNavigate?: () => void;
}) {
    const conCampeon = seasons.filter((season) => Boolean(season.champion));
    const palmares = buildPalmares(conCampeon);

    if (conCampeon.length === 0) {
        return <p className={styles.emptyState}>Todavía no hay campeones registrados para este torneo.</p>;
    }

    const podio = palmares.filter((entrada) => entrada.puesto <= 3);
    // Con muchos empates arriba el podio deja de ser podio: si el 1-2-3 se
    // reparte entre más de seis clubes, van todos al listado.
    const usaPodio = podio.length > 0 && podio.length <= 6;
    const resto = usaPodio ? palmares.slice(podio.length) : palmares;
    const maxTitulos = palmares[0]?.titulos || 1;
    const titulo = tournamentName?.trim() || 'Palmarés';
    const bajada = palmaresSubtitle(conCampeon.length, palmares.length);

    return (
        <div className={styles.championsPanel}>
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Palmarés</h2>
                    <div className={styles.championsHeaderSide}>
                        <span className={styles.championsMeta}>{bajada}</span>
                        <ExportImage
                            className={styles.championsExportAction}
                            template="standings"
                            filename={`palmares-${titulo}`}
                            data={buildPalmaresExportData(palmares, {
                                title: titulo,
                                subtitle: bajada,
                                tournamentLogo,
                            })}
                        />
                    </div>
                </div>

                {usaPodio && (
                    <ol className={styles.palmaresPodium}>
                        {podio.map(({ club, titulos, puesto }) => (
                            <li
                                key={club.id}
                                className={styles.palmaresPodiumItem}
                                style={{
                                    '--medal': PALMARES_MEDALS[puesto - 1] || PALMARES_MEDALS[2],
                                    '--medal-light': PALMARES_MEDALS_LIGHT[puesto - 1] || PALMARES_MEDALS_LIGHT[2],
                                } as CSSProperties}
                            >
                                <span className={styles.palmaresMedal}>{puesto}</span>
                                <ClubCrest club={club} size={puesto === 1 ? 54 : 46} />
                                <span className={styles.palmaresPodiumName}>{club.name}</span>
                                <span className={styles.palmaresPodiumCount}>
                                    {titulos}
                                    <small>{titulos === 1 ? 'título' : 'títulos'}</small>
                                </span>
                            </li>
                        ))}
                    </ol>
                )}

                {resto.length > 0 && (
                    <ul className={styles.palmaresList}>
                        {resto.map(({ club, titulos, puesto }) => (
                            <li
                                key={club.id}
                                className={styles.palmaresRow}
                                style={{ '--share': `${Math.max(6, Math.round((titulos / maxTitulos) * 100))}%` } as CSSProperties}
                            >
                                <span className={styles.palmaresRank}>{puesto}</span>
                                <ClubCrest club={club} size={24} />
                                <span className={styles.palmaresName}>{club.name}</span>
                                <span className={styles.palmaresCount}>{titulos}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Campeones por temporada</h2>
                </div>
                <ul className={styles.championSeasonList}>
                    {seasons.map((season) => {
                        const campeones = championsOf(season);
                        const enCurso = !season.champion && (season.status === 'active' || season.status === 'draft');
                        return (
                            <li key={season.id}>
                                <Link
                                    href={hrefResumen(season.href)}
                                    className={styles.championSeasonRow}
                                    onClick={() => onNavigate?.()}
                                >
                                    <span className={styles.championSeasonYear}>{season.label}</span>
                                    {campeones.length > 0 ? (
                                        <span className={styles.championSeasonClubs}>
                                            {campeones.map((club, index) => (
                                                <span key={club.id} className={styles.championSeasonClub}>
                                                    {index > 0 && <span className={styles.championShared}>y</span>}
                                                    <ClubCrest club={club} size={22} />
                                                    <span className={styles.championSeasonName}>{club.name}</span>
                                                </span>
                                            ))}
                                            {campeones.length > 1 && (
                                                <span className={styles.championShared}>(título compartido)</span>
                                            )}
                                        </span>
                                    ) : (
                                        <span className={styles.championSeasonPending}>
                                            {enCurso ? 'En curso' : 'Sin campeón registrado'}
                                        </span>
                                    )}
                                    <span className={styles.championSeasonGo} aria-hidden="true">
                                        {season.champion && <Trophy size={13} className={styles.championTrophy} />}
                                        <ChevronRight size={15} />
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
