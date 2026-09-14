'use client';

import { useId, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { ODESUR_ORG_CODES, odesurAllDisciplines, odesurOrgName } from '@/lib/services/odesur2026Parser';
import OdesurFlag from './OdesurFlag';
import type { OdesurFollows } from './useOdesurFollows';
import styles from './page.module.css';

const ORGS = ODESUR_ORG_CODES
    .map((code) => ({ code, name: odesurOrgName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

const SPORTS = odesurAllDisciplines();

function normalize(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Qué se sigue: las 15 delegaciones y los 60 deportes. Va en la página, abajo
 * de la cabecera, y no en un modal: se elige mirando la agenda que cambia.
 */
export default function FollowPanel({ follows, onClose }: { follows: OdesurFollows; onClose: () => void }) {
    const [query, setQuery] = useState('');
    const titleId = useId();
    const searchId = useId();

    const sports = useMemo(() => {
        const needle = normalize(query.trim());
        return needle ? SPORTS.filter((sport) => normalize(sport.name).includes(needle)) : SPORTS;
    }, [query]);

    return (
        <section className={styles.followPanel} aria-labelledby={titleId}>
            <div className={styles.followHead}>
                <div>
                    <h2 id={titleId} className={styles.sectionTitle}>Qué seguís</h2>
                    <p className={styles.followLead}>
                        La agenda marca lo tuyo con ★ y el filtro «Siguiendo» te deja solo eso. Se guarda en este dispositivo, sin cuenta.
                    </p>
                </div>
                <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Cerrar qué seguís">
                    <X size={18} aria-hidden="true" />
                </button>
            </div>

            <h3 className={styles.followGroupTitle}>
                Países <span>{follows.orgs.size} de {ORGS.length}</span>
            </h3>
            <div className={styles.orgGrid}>
                {ORGS.map((org) => {
                    const on = follows.orgs.has(org.code);
                    return (
                        <button
                            key={org.code}
                            type="button"
                            aria-pressed={on}
                            className={`${styles.orgToggle} ${on ? styles.toggleOn : ''}`}
                            onClick={() => follows.toggleOrg(org.code)}
                        >
                            <OdesurFlag code={org.code} name={org.name} size={26} />
                            <span className={styles.orgToggleName}>{org.name}</span>
                            <span className={styles.toggleMark} aria-hidden="true">{on ? <Check size={14} /> : null}</span>
                        </button>
                    );
                })}
            </div>

            <div className={styles.followSportsHead}>
                <h3 className={styles.followGroupTitle}>
                    Deportes <span>{follows.sports.size} de {SPORTS.length}</span>
                </h3>
                <label className={styles.searchField} htmlFor={searchId}>
                    <Search size={15} aria-hidden="true" />
                    <span className={styles.srOnly}>Buscar un deporte</span>
                    <input
                        id={searchId}
                        type="search"
                        value={query}
                        placeholder="Buscar un deporte"
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </label>
            </div>
            <div className={styles.chipGrid}>
                {sports.map((sport) => {
                    const on = follows.sports.has(sport.code);
                    return (
                        <button
                            key={sport.code}
                            type="button"
                            aria-pressed={on}
                            className={`${styles.chip} ${on ? styles.toggleOn : ''}`}
                            onClick={() => follows.toggleSport(sport.code)}
                        >
                            {on ? <Check size={13} aria-hidden="true" /> : null}
                            {sport.name}
                        </button>
                    );
                })}
                {sports.length === 0 ? <p className={styles.followLead}>Ningún deporte se llama así.</p> : null}
            </div>

            <div className={styles.followFoot}>
                <button type="button" className={styles.primaryBtn} onClick={onClose}>Listo</button>
            </div>
        </section>
    );
}
