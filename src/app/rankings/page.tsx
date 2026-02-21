'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

// Mock data
const rankingCategories = [
    { id: 'tries', name: '🏉 Tries', icon: '🏉' },
    { id: 'goals', name: '🥅 Goles', icon: '🥅' },
    { id: 'cards-yellow', name: '🟨 Amarillas', icon: '🟨' },
    { id: 'cards-red', name: '🟥 Rojas', icon: '🟥' },
    { id: 'tryman', name: '⭐ Tryman del Partido', icon: '⭐' },
];

const rankingsData = {
    tries: [
        { pos: 1, name: 'Martín García', team: 'Club Atlético', teamLogo: '🔵', value: 12, matches: 8 },
        { pos: 2, name: 'Lucas Rodríguez', team: 'Racing Club', teamLogo: '🟢', value: 10, matches: 8 },
        { pos: 3, name: 'Pablo Fernández', team: 'San Lorenzo', teamLogo: '🟡', value: 8, matches: 8 },
        { pos: 4, name: 'Juan Pérez', team: 'CASI', teamLogo: '⚪', value: 7, matches: 7 },
        { pos: 5, name: 'Diego López', team: 'Deportivo FC', teamLogo: '🔴', value: 7, matches: 8 },
        { pos: 6, name: 'Andrés Martínez', team: 'Hindu Club', teamLogo: '🟠', value: 6, matches: 8 },
        { pos: 7, name: 'Carlos Sánchez', team: 'Newman', teamLogo: '🔴', value: 5, matches: 7 },
        { pos: 8, name: 'Roberto Díaz', team: 'Belgrano AC', teamLogo: '🔵', value: 5, matches: 8 },
        { pos: 9, name: 'Federico Torres', team: 'Pucará', teamLogo: '🟣', value: 4, matches: 8 },
        { pos: 10, name: 'Gonzalo Ruiz', team: 'La Plata RC', teamLogo: '⚫', value: 4, matches: 8 },
    ],
    goals: [
        { pos: 1, name: 'Tomás Albornoz', team: 'Racing Club', teamLogo: '🟢', value: 28, matches: 8 },
        { pos: 2, name: 'Nicolás Sánchez', team: 'Club Atlético', teamLogo: '🔵', value: 25, matches: 8 },
        { pos: 3, name: 'Emiliano Boffelli', team: 'San Lorenzo', teamLogo: '🟡', value: 22, matches: 8 },
        { pos: 4, name: 'Joaquín Díaz Bonilla', team: 'CASI', teamLogo: '⚪', value: 18, matches: 7 },
        { pos: 5, name: 'Benjamín Urdapilleta', team: 'Hindu Club', teamLogo: '🟠', value: 16, matches: 8 },
    ],
    'cards-yellow': [
        { pos: 1, name: 'Marcos Kremer', team: 'Newman', teamLogo: '🔴', value: 4, matches: 8 },
        { pos: 2, name: 'Pablo Matera', team: 'Belgrano AC', teamLogo: '🔵', value: 3, matches: 8 },
        { pos: 3, name: 'Guido Petti', team: 'Deportivo FC', teamLogo: '🔴', value: 3, matches: 7 },
    ],
    'cards-red': [
        { pos: 1, name: 'Tomás Lavanini', team: 'Pucará', teamLogo: '🟣', value: 1, matches: 8 },
        { pos: 2, name: 'Facundo Isa', team: 'Los Tilos', teamLogo: '🟤', value: 1, matches: 6 },
    ],
    tryman: [
        { pos: 1, name: 'Martín García', team: 'Club Atlético', teamLogo: '🔵', value: 5, matches: 8 },
        { pos: 2, name: 'Lucas Rodríguez', team: 'Racing Club', teamLogo: '🟢', value: 4, matches: 8 },
        { pos: 3, name: 'Pablo Fernández', team: 'San Lorenzo', teamLogo: '🟡', value: 3, matches: 8 },
    ],
};

export default function RankingsPage() {
    const [selectedCategory, setSelectedCategory] = useState('tries');
    const [selectedTournament, setSelectedTournament] = useState('apertura-2026');

    const rankings = rankingsData[selectedCategory as keyof typeof rankingsData] || [];
    const category = rankingCategories.find(c => c.id === selectedCategory);

    return (
        <div className={styles.page}>
            {/* Header */}
            <section className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1 className={styles.title}>Rankings</h1>
                            <p className={styles.subtitle}>
                                Estadísticas destacadas de jugadores por torneo
                            </p>
                        </div>

                        <div className={styles.headerActions}>
                            <select
                                className={styles.select}
                                value={selectedTournament}
                                onChange={(e) => setSelectedTournament(e.target.value)}
                            >
                                <option value="apertura-2026">Torneo Apertura 2026</option>
                                <option value="liga-nacional-2026">Liga Nacional 2026</option>
                            </select>
                        </div>
                    </div>

                    {/* Category Tabs */}
                    <div className={styles.categoryTabs}>
                        {rankingCategories.map(cat => (
                            <button
                                key={cat.id}
                                className={`${styles.categoryTab} ${selectedCategory === cat.id ? styles.active : ''}`}
                                onClick={() => setSelectedCategory(cat.id)}
                            >
                                <span className={styles.categoryIcon}>{cat.icon}</span>
                                <span className={styles.categoryName}>{cat.name.split(' ').slice(1).join(' ')}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* Rankings Content */}
            <section className={styles.content}>
                <div className="container">
                    <div className={styles.rankingCard}>
                        <div className={styles.cardHeader}>
                            <h2 className={styles.cardTitle}>{category?.name}</h2>
                            <span className={styles.cardTournament}>Torneo Apertura 2026</span>
                        </div>

                        {/* Top 3 Podium */}
                        {rankings.length >= 3 && (
                            <div className={styles.podium}>
                                <div className={`${styles.podiumItem} ${styles.second}`}>
                                    <div className={styles.podiumRank}>2</div>
                                    <div className={styles.podiumAvatar}>{rankings[1].teamLogo}</div>
                                    <div className={styles.podiumName}>{rankings[1].name}</div>
                                    <div className={styles.podiumTeam}>{rankings[1].team}</div>
                                    <div className={styles.podiumValue}>{rankings[1].value}</div>
                                </div>
                                <div className={`${styles.podiumItem} ${styles.first}`}>
                                    <div className={styles.podiumCrown}>👑</div>
                                    <div className={styles.podiumRank}>1</div>
                                    <div className={styles.podiumAvatar}>{rankings[0].teamLogo}</div>
                                    <div className={styles.podiumName}>{rankings[0].name}</div>
                                    <div className={styles.podiumTeam}>{rankings[0].team}</div>
                                    <div className={styles.podiumValue}>{rankings[0].value}</div>
                                </div>
                                <div className={`${styles.podiumItem} ${styles.third}`}>
                                    <div className={styles.podiumRank}>3</div>
                                    <div className={styles.podiumAvatar}>{rankings[2].teamLogo}</div>
                                    <div className={styles.podiumName}>{rankings[2].name}</div>
                                    <div className={styles.podiumTeam}>{rankings[2].team}</div>
                                    <div className={styles.podiumValue}>{rankings[2].value}</div>
                                </div>
                            </div>
                        )}

                        {/* Full Rankings List */}
                        <div className={styles.rankingsList}>
                            {rankings.map((player, index) => (
                                <Link
                                    key={player.pos}
                                    href={`/players/${player.name.toLowerCase().replace(/\s+/g, '-')}`}
                                    className={`${styles.rankingItem} ${index < 3 ? styles.topThree : ''}`}
                                >
                                    <span className={`${styles.rankingPos} ${styles[`pos${player.pos}`]}`}>
                                        {player.pos}
                                    </span>

                                    <div className={styles.rankingPlayer}>
                                        <span className={styles.playerAvatar}>{player.teamLogo}</span>
                                        <div className={styles.playerInfo}>
                                            <span className={styles.playerName}>{player.name}</span>
                                            <span className={styles.playerTeam}>{player.team}</span>
                                        </div>
                                    </div>

                                    <div className={styles.rankingStats}>
                                        <span className={styles.rankingMatches}>{player.matches} partidos</span>
                                        <span className={styles.rankingValue}>{player.value}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
