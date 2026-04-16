'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus, Search } from 'lucide-react';
import type { ExportDesign } from './export-designs';
import { getExportStatusMeta } from './export-designs';
import { getDefaultActiveExportDesign, persistActiveExportDesign, readActiveExportDesign, type ExportDesignSlug } from '@/lib/exports/activeDesign';
import styles from './exports.module.css';

export default function ExportsCatalogPage({ designs }: { designs: ExportDesign[] }) {
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [category, setCategory] = useState('all');
    const [onlyMine, setOnlyMine] = useState(false);
    const [activeDesignSlug, setActiveDesignSlug] = useState<ExportDesignSlug>(getDefaultActiveExportDesign());

    useEffect(() => {
        const syncActiveDesign = () => setActiveDesignSlug(readActiveExportDesign());
        syncActiveDesign();
        window.addEventListener('storage', syncActiveDesign);
        window.addEventListener('g22:active-export-design-change', syncActiveDesign as EventListener);

        return () => {
            window.removeEventListener('storage', syncActiveDesign);
            window.removeEventListener('g22:active-export-design-change', syncActiveDesign as EventListener);
        };
    }, []);

    const filteredDesigns = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();

        return designs.filter((design) => {
            if (status !== 'all' && design.status !== status) return false;
            if (category !== 'all' && design.category !== category) return false;
            if (onlyMine && !design.userConfig.personalized) return false;

            if (!normalizedSearch) return true;

            return `${design.name} ${design.shortDescription} ${design.longDescription}`
                .toLowerCase()
                .includes(normalizedSearch);
        });
    }, [category, designs, onlyMine, search, status]);

    return (
        <div className={styles.catalogPage}>
            <section className={styles.hero}>
                <div>
                    <div className={styles.heroEyebrow}>Superadmin / exports system</div>
                    <h1 className={styles.heroTitle}>Exports</h1>
                    <p className={styles.heroSubtitle}>
                        Gestiona los disenos de exportacion disponibles en la plataforma.
                        La estructura ya esta preparada para multiples templates, con una capa base
                        de plataforma y otra de configuracion editable por usuario.
                    </p>
                    <p className={styles.supportingText} style={{ marginTop: 12 }}>
                        Activo ahora: {designs.find((design) => design.slug === activeDesignSlug)?.name || 'G22 Base'}.
                    </p>
                </div>

                <div className={styles.heroActions}>
                    <button type="button" className={styles.secondaryButton}>
                        <Search size={16} />
                        Buscar presets
                    </button>
                    <button type="button" className={styles.actionButton}>
                        <Plus size={16} />
                        Nuevo diseno
                    </button>
                </div>
            </section>

            <section className={styles.toolbar} aria-label="Filtros de exportacion">
                <label style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: 14, color: '#8b94a7' }}>
                        <Search size={16} />
                    </span>
                    <input
                        className={styles.searchField}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar por nombre del diseno..."
                        style={{ paddingLeft: 42 }}
                    />
                </label>

                <select className={styles.selectField} value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="all">Estado: todos</option>
                    <option value="active">Activos</option>
                    <option value="draft">Borrador</option>
                    <option value="testing">En prueba</option>
                </select>

                <select className={styles.selectField} value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="all">Tipo: todos</option>
                    <option value="editorial">Editorial</option>
                    <option value="stats">Stats</option>
                </select>

                <label className={styles.toggle}>
                    <input
                        type="checkbox"
                        checked={onlyMine}
                        onChange={(event) => setOnlyMine(event.target.checked)}
                    />
                    <span className={styles.toggleLabel}>Solo mis configuraciones</span>
                </label>
            </section>

            {filteredDesigns.length === 0 ? (
                <div className={styles.emptyState}>
                    No hay disenos que coincidan con los filtros actuales. Ajusta la busqueda o vuelve a mostrar todas las variantes.
                </div>
            ) : (
                <section className={styles.grid}>
                    {filteredDesigns.map((design) => {
                        const statusMeta = getExportStatusMeta(design.status);
                        const isActiveDesign = design.slug === activeDesignSlug;

                        return (
                            <article key={design.slug} className={styles.card}>
                                <div className={styles.cardPreview}>
                                    <div className={styles.previewFrame} style={{ background: design.previewBackground }}>
                                        <div className={styles.previewTop}>
                                            <span className={styles.previewBadge}>{design.previewLabel}</span>
                                            <span>G22 EXPORT</span>
                                        </div>

                                        <div className={styles.previewHeadline}>
                                            <span className={styles.previewLabel}>Preview visual</span>
                                            <div className={styles.previewTitle}>MATCH DAY</div>
                                        </div>

                                        <div className={styles.previewStats}>
                                            {['54%', '8', '91%'].map((value, index) => (
                                                <div key={`${design.slug}-stat-${index}`} className={styles.previewStat}>
                                                    <span className={styles.previewStatLabel}>
                                                        {index === 0 ? 'Possession' : index === 1 ? 'Shots' : 'Pass'}
                                                    </span>
                                                    <span className={styles.previewStatValue} style={{ color: design.previewAccent }}>
                                                        {value}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.cardBody}>
                                    <div className={styles.cardHeader}>
                                        <div>
                                            <h2 className={styles.cardTitle}>{design.name}</h2>
                                            <p className={styles.cardDescription}>{design.shortDescription}</p>
                                        </div>
                                        <span
                                            className={`${styles.statusPill} ${
                                                isActiveDesign
                                                    ? styles.statusSuccess
                                                    : statusMeta.tone === 'success'
                                                    ? styles.statusSuccess
                                                    : statusMeta.tone === 'warning'
                                                        ? styles.statusWarning
                                                        : styles.statusNeutral
                                            }`}
                                        >
                                            {isActiveDesign ? 'Activo en exportacion' : statusMeta.label}
                                        </span>
                                    </div>

                                    <div className={styles.chipRow}>
                                        <span className={styles.chip}>{isActiveDesign ? 'Seleccion unica' : 'Disponible'}</span>
                                        <span className={styles.chip}>Formatos: {design.formats.length}</span>
                                        <span className={styles.chip}>Fonts: {design.typography.length}</span>
                                        <span className={styles.chip}>Sizes: {design.dimensions.length}</span>
                                        <span className={styles.chip}>Cloud presets: {design.userConfig.totalPresets}</span>
                                    </div>

                                    <div className={styles.cardFooter}>
                                        <p className={styles.supportingText}>
                                            {design.updatedAtLabel
                                                ? `Ultima sync: ${design.updatedAtLabel}`
                                                : design.userConfig.syncSourceLabel}
                                        </p>
                                        <div className={styles.buttonRow}>
                                            <button
                                                type="button"
                                                className={isActiveDesign ? styles.secondaryButton : styles.actionButton}
                                                onClick={() => {
                                                    persistActiveExportDesign(design.slug as ExportDesignSlug);
                                                    setActiveDesignSlug(design.slug as ExportDesignSlug);
                                                }}
                                                disabled={isActiveDesign}
                                            >
                                                {isActiveDesign ? 'Diseno activo' : 'Activar diseno'}
                                            </button>
                                            <Link href={`/admin/super/exports/${design.slug}`} className={styles.secondaryButton}>
                                                Abrir diseno
                                                <ArrowRight size={16} />
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </section>
            )}
        </div>
    );
}
