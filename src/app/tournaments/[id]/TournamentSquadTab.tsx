'use client';

/**
 * Tab "Tabla de Planteles": la clasificación general de los clubes de una
 * agrupación de categorías. La arma el servidor (/api/db/tournaments/[id]/squad-table)
 * con las tablas que ya existen; acá solo se muestra, con las mismas clases que
 * la histórica. El desglose por categoría vive en columnas que el celular oculta.
 */

import Link from 'next/link';
import styles from './page.module.css';

export type SquadTableData = {
    available: boolean;
    groupName?: string;
    categories?: Array<{ id: string; label: string; tournamentId: string }>;
    rows?: Array<{
        position: number;
        points: number;
        played: number;
        categories: Record<string, number>;
        club: { id: string; name: string; logo: string | null };
    }>;
};

const fmt = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export default function TournamentSquadTab({ data }: { data: SquadTableData }) {
    const rows = data.rows ?? [];
    const categories = data.categories ?? [];
    if (rows.length === 0) {
        return <p className={styles.emptyState}>Todavía no hay clubes con puntos para sumar.</p>;
    }
    const optional = `${styles.colVal} ${styles.historicalOptional}`;

    return (
        <>
            <div className={styles.standingsToolbar}>
                <span className={styles.historicalToolbarTitle}>{data.groupName || 'Tabla de Planteles'}</span>
            </div>
            <div className={styles.standingsContainer}>
                <div className={styles.sectionCard}>
                    <div className={styles.tableCard}>
                        <div className={styles.tableHeader}>
                            <div className={styles.colPos}>#</div>
                            <div className={styles.colTeam}>Club</div>
                            {categories.map((category) => (
                                <div key={category.id} className={optional} title={category.label}>
                                    {category.label.length > 6 ? `${category.label.slice(0, 5)}…` : category.label}
                                </div>
                            ))}
                            <div className={`${styles.colPts} ${styles.historicalPts}`}>PTS</div>
                        </div>
                        {rows.map((row) => (
                            <div key={row.club.id} className={styles.tableRow}>
                                <div className={styles.colPos}>{row.position}</div>
                                <div className={styles.colTeam}>
                                    {row.club.logo
                                        ? (
                                            <img
                                                src={row.club.logo}
                                                alt=""
                                                className={styles.teamLogo}
                                                loading="lazy"
                                                onError={(event) => { (event.target as HTMLImageElement).style.visibility = 'hidden'; }}
                                            />
                                        )
                                        : <div className={styles.teamLogoPlaceholder} />}
                                    <div className={styles.colTeamMeta}>
                                        <Link href={`/clubs/${encodeURIComponent(row.club.id)}`} className={styles.colTeamName}>
                                            {row.club.name}
                                        </Link>
                                    </div>
                                </div>
                                {categories.map((category) => (
                                    <div key={category.id} className={optional}>
                                        {row.categories[category.id] === undefined ? '–' : fmt(row.categories[category.id])}
                                    </div>
                                ))}
                                <div className={`${styles.colPts} ${styles.historicalPts}`}>{fmt(row.points)}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <p className={styles.historicalIntro}>
                    Suma los puntos de cada categoría en la que el club participa en la temporada vigente.
                    Un guion indica que el club no compite en esa categoría.
                </p>
            </div>
        </>
    );
}
