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
 */

import Link from 'next/link';
import { Trophy, ChevronRight } from 'lucide-react';
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

export default function TournamentChampionsTab({
    seasons,
    onNavigate,
}: {
    seasons: ChampionSeasonItem[];
    onNavigate?: () => void;
}) {
    const conCampeon = seasons.filter((season) => Boolean(season.champion));

    // Palmarés: títulos por club; un título compartido suma uno a cada club.
    const porClub = new Map<string, { club: ChampionRef; titulos: number }>();
    for (const season of conCampeon) {
        for (const club of championsOf(season)) {
            const actual = porClub.get(club.id);
            if (actual) actual.titulos += 1;
            else porClub.set(club.id, { club, titulos: 1 });
        }
    }
    const palmares = Array.from(porClub.values()).sort(
        (a, b) => b.titulos - a.titulos || a.club.name.localeCompare(b.club.name, 'es'),
    );

    if (conCampeon.length === 0) {
        return <p className={styles.emptyState}>Todavía no hay campeones registrados para este torneo.</p>;
    }

    return (
        <div className={styles.championsPanel}>
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Palmarés</h2>
                    <span className={styles.championsMeta}>{conCampeon.length} ediciones con campeón</span>
                </div>
                <ul className={styles.palmaresList}>
                    {palmares.map(({ club, titulos }) => (
                        <li key={club.id} className={styles.palmaresChip}>
                            <ClubCrest club={club} size={26} />
                            <span className={styles.palmaresName}>{club.name}</span>
                            <span className={styles.palmaresCount}>{titulos}</span>
                        </li>
                    ))}
                </ul>
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
