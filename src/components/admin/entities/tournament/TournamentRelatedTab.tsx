'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowDown,
    ArrowLeftRight,
    ArrowRight,
    ArrowUp,
    ExternalLink,
    GitBranch,
    Layers3,
    Link2,
    Pencil,
    Plus,
    Search,
    ShieldAlert,
    Trash2,
} from 'lucide-react';
import { useAdminConsole } from '@/app/admin/AdminContext';
import type {
    TournamentInternalRelationGroup,
    TournamentLinkedRelationItem,
    TournamentLinkedRelationsResult,
    TournamentRelatedTabData,
} from '@/lib/services/tournamentRelatedService';
import {
    getTournamentRelationDirectionBadgeClass,
    getTournamentRelationStatusBadgeClass,
    getTournamentRelationTypeBadgeClass,
    TOURNAMENT_RELATION_DIRECTION_OPTIONS,
    TOURNAMENT_RELATION_STATUS_OPTIONS,
    TOURNAMENT_RELATION_TYPE_OPTIONS,
} from '@/lib/tournamentRelations';
import styles from './TournamentRelatedTab.module.css';

interface Props {
    tournamentId: string;
    data: TournamentRelatedTabData;
}

type ActiveView = 'internal' | 'linked';

interface RelationFormState {
    relationId: string | null;
    linkedTournamentId: string;
    relationType: string;
    relationDirection: string;
    status: string;
    relationSide: 'source' | 'target';
    description: string;
}

const EMPTY_FORM: RelationFormState = {
    relationId: null,
    linkedTournamentId: '',
    relationType: 'qualification',
    relationDirection: 'outgoing',
    status: 'active',
    relationSide: 'source',
    description: '',
};

function groupKicker(groupId: TournamentInternalRelationGroup['id']) {
    switch (groupId) {
        case 'matches':
            return 'MATCH CORE';
        case 'phases':
            return 'PHASE MAP';
        case 'groups':
            return 'GROUP TOPOLOGY';
        case 'rounds':
            return 'ROUND ENGINE';
        case 'participants':
            return 'PARTICIPANT POOL';
        default:
            return 'RELATION';
    }
}

function relationDirectionIcon(direction: string | null) {
    switch (direction) {
        case 'upward':
            return ArrowUp;
        case 'downward':
            return ArrowDown;
        case 'outgoing':
            return ArrowRight;
        case 'incoming':
            return ArrowRight;
        default:
            return ArrowLeftRight;
    }
}

function formatGroupMeta(group: TournamentInternalRelationGroup) {
    if (group.count === 0) return 'Sin registros';
    if (group.count === 1) return '1 entidad';
    return `${group.count} entidades`;
}

export function TournamentRelatedTab({ tournamentId, data }: Props) {
    const router = useRouter();
    const { tournaments } = useAdminConsole();
    const [activeView, setActiveView] = useState<ActiveView>('internal');
    const [linkedState, setLinkedState] = useState<TournamentLinkedRelationsResult>(data.linked);
    const [form, setForm] = useState<RelationFormState>(EMPTY_FORM);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const deferredFilter = useDeferredValue(filter);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const tournamentOptions = useMemo(() => {
        const normalizedFilter = deferredFilter.trim().toLowerCase();
        return tournaments
            .filter((item) => item.id !== tournamentId)
            .filter((item) => {
                if (!normalizedFilter) return true;
                const haystack = `${item.display_name || item.name} ${item.season_id || ''} ${item.sport || ''}`.toLowerCase();
                return haystack.includes(normalizedFilter);
            })
            .slice(0, 60);
    }, [deferredFilter, tournamentId, tournaments]);

    const internalCount = useMemo(
        () => data.internalGroups.reduce((total, group) => total + group.count, 0),
        [data.internalGroups]
    );

    const allNotes = useMemo(
        () => [...new Set([...data.notes, ...linkedState.notes])],
        [data.notes, linkedState.notes]
    );

    async function refreshLinkedRelations() {
        const response = await fetch(`/api/admin/tournaments/${tournamentId}/relations`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) {
            throw new Error(json.error || 'No se pudieron recargar los vinculos.');
        }
        setLinkedState(json);
    }

    function resetForm() {
        setForm(EMPTY_FORM);
        setIsFormOpen(false);
    }

    function startCreate() {
        setFeedback(null);
        setActiveView('linked');
        setForm(EMPTY_FORM);
        setIsFormOpen(true);
    }

    function startEdit(item: TournamentLinkedRelationItem) {
        setFeedback(null);
        setActiveView('linked');
        setForm({
            relationId: item.id,
            linkedTournamentId: item.linkedTournamentId,
            relationType: item.relationType,
            relationDirection: item.relationDirection || 'outgoing',
            status: item.relationStatus,
            relationSide: item.relationSide,
            description: item.description || '',
        });
        setIsFormOpen(true);
    }

    async function handleSubmit() {
        setFeedback(null);

        if (!form.linkedTournamentId) {
            setFeedback('Selecciona un torneo vinculado.');
            return;
        }

        const method = form.relationId ? 'PATCH' : 'POST';
        const endpoint = form.relationId
            ? `/api/admin/tournaments/${tournamentId}/relations?id=${form.relationId}`
            : `/api/admin/tournaments/${tournamentId}/relations`;

        startTransition(() => {
            void (async () => {
                try {
                    const response = await fetch(endpoint, {
                        method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            linked_tournament_id: form.linkedTournamentId,
                            relation_type: form.relationType,
                            relation_direction: form.relationDirection || null,
                            status: form.status,
                            relation_side: form.relationSide,
                            description: form.description.trim() || null,
                        }),
                    });

                    const json = await response.json();
                    if (!response.ok) {
                        throw new Error(json.error || 'No se pudo guardar el vinculo.');
                    }

                    await refreshLinkedRelations();
                    resetForm();
                    router.refresh();
                } catch (error) {
                    setFeedback(error instanceof Error ? error.message : 'No se pudo guardar el vinculo.');
                }
            })();
        });
    }

    async function handleDelete(relationId: string) {
        if (!window.confirm('Se eliminara este vinculo entre torneos. Continuar?')) return;

        setFeedback(null);
        startTransition(() => {
            void (async () => {
                try {
                    const response = await fetch(`/api/admin/tournaments/${tournamentId}/relations?id=${relationId}`, {
                        method: 'DELETE',
                    });
                    const json = await response.json();
                    if (!response.ok) {
                        throw new Error(json.error || 'No se pudo eliminar el vinculo.');
                    }
                    await refreshLinkedRelations();
                    router.refresh();
                } catch (error) {
                    setFeedback(error instanceof Error ? error.message : 'No se pudo eliminar el vinculo.');
                }
            })();
        });
    }

    return (
        <div className={`${styles.shell} basalt-related-shell`}>
            <div className={styles.ambience} aria-hidden="true">
                <span className={styles.ambientOrbA} />
                <span className={styles.ambientOrbB} />
                <span className={styles.ambientGrid} />
            </div>

            <section className={styles.hero}>
                <div className={styles.heroAccent} />
                <div className={styles.heroTop}>
                    <div className={styles.heroCopy}>
                        <p className={styles.eyebrow}>Tournament Module // Admin</p>
                        <h2 className={styles.title}>Relacionados</h2>
                        <p className={styles.subtitle}>
                            Mercury UI compacto para mapear estructura interna y conexiones competitivas del torneo.
                        </p>
                    </div>
                    <div className={styles.heroMetrics}>
                        <div className={styles.metricCard}>
                            <span className={styles.metricLabel}>Internos</span>
                            <strong className={styles.metricValue}>{internalCount}</strong>
                        </div>
                        <div className={styles.metricCard}>
                            <span className={styles.metricLabel}>Vinculos</span>
                            <strong className={styles.metricValue}>{linkedState.items.length}</strong>
                        </div>
                    </div>
                </div>

                <div className={styles.heroBottom}>
                    <div className={styles.switcher} role="tablist" aria-label="Vista de relaciones del torneo">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeView === 'internal'}
                            className={`${styles.switcherButton} ${activeView === 'internal' ? styles.switcherButtonActive : ''}`}
                            onClick={() => setActiveView('internal')}
                        >
                            <span>Internos</span>
                            <strong>{internalCount}</strong>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeView === 'linked'}
                            className={`${styles.switcherButton} ${activeView === 'linked' ? styles.switcherButtonActive : ''}`}
                            onClick={() => setActiveView('linked')}
                        >
                            <span>Torneos Vinculados</span>
                            <strong>{linkedState.items.length}</strong>
                        </button>
                    </div>
                    <span className={styles.heroHint}>Cambio instantaneo de vista sin salir del modulo.</span>
                </div>
            </section>

            {allNotes.length > 0 ? (
                <div className={styles.alertStack}>
                    {allNotes.map((note) => (
                        <div key={note} className={styles.alertCard}>
                            <ShieldAlert size={16} />
                            <span>{note}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {feedback ? <div className={styles.feedback}>{feedback}</div> : null}

            <div className={styles.viewport}>
                {activeView === 'internal' ? (
                    <section className={styles.internalSection}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <p className={styles.sectionEyebrow}>Internal Grid</p>
                                <h3 className={styles.sectionTitle}>Internos</h3>
                            </div>
                            <p className={styles.sectionText}>
                                Cards separadas por tipo de entidad con navegacion directa al detalle correspondiente.
                            </p>
                        </div>

                        {data.internalGroups.every((group) => group.count === 0) ? (
                            <div className={styles.emptyPanel}>No hay entidades internas relacionadas para mostrar.</div>
                        ) : null}

                        <div className={styles.internalGrid}>
                            {data.internalGroups.map((group) => (
                                <article key={group.id} className={styles.mercuryCard}>
                                    <header className={styles.cardHeader}>
                                        <div>
                                            <p className={styles.cardEyebrow}>{groupKicker(group.id)}</p>
                                            <h4 className={styles.cardTitle}>{group.label}</h4>
                                        </div>
                                        <div className={styles.cardCount}>
                                            <span>{group.count}</span>
                                            <small>{formatGroupMeta(group)}</small>
                                        </div>
                                    </header>

                                    {group.items.length === 0 ? (
                                        <div className={styles.cardEmpty}>{group.emptyText}</div>
                                    ) : (
                                        <div className={styles.itemList}>
                                            {group.items.map((item) => (
                                                <Link key={item.id} href={item.href} prefetch={false} className={styles.itemRow}>
                                                    <div className={styles.itemMain}>
                                                        <div className={styles.itemTitle}>{item.title}</div>
                                                        {item.subtitle ? <div className={styles.itemSubtitle}>{item.subtitle}</div> : null}
                                                    </div>
                                                    <div className={styles.itemMetaBlock}>
                                                        {item.meta ? <span className={styles.itemMeta}>{item.meta}</span> : null}
                                                        <ChevronGlyph />
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    </section>
                ) : (
                    <section className={styles.linkedSection}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <p className={styles.sectionEyebrow}>Linked Conduit</p>
                                <h3 className={styles.sectionTitle}>Torneos Vinculados</h3>
                            </div>
                            <p className={styles.sectionText}>
                                Vistas en fila con subinfo, tipo de relacion, direccion, estado y acciones operativas.
                            </p>
                        </div>

                        {isFormOpen ? (
                            <div className={styles.formPanel}>
                                <div className={styles.formPanelHeader}>
                                    <div>
                                        <p className={styles.cardEyebrow}>{form.relationId ? 'Update Relation' : 'Create Relation'}</p>
                                        <h4 className={styles.formTitle}>
                                            {form.relationId ? 'Editar vinculo existente' : 'Vincular otro torneo'}
                                        </h4>
                                    </div>
                                    <button type="button" className={styles.ghostButton} onClick={resetForm}>
                                        Cancelar
                                    </button>
                                </div>

                                <div className={styles.formGrid}>
                                    <label className={styles.field}>
                                        <span>Buscar torneo</span>
                                        <div className={styles.inputWrap}>
                                            <Search size={16} />
                                            <input
                                                value={filter}
                                                onChange={(event) => setFilter(event.target.value)}
                                                placeholder="Nombre, temporada o deporte"
                                                className={styles.input}
                                            />
                                        </div>
                                    </label>

                                    <label className={styles.field}>
                                        <span>Torneo vinculado</span>
                                        <select
                                            value={form.linkedTournamentId}
                                            onChange={(event) => setForm((current) => ({ ...current, linkedTournamentId: event.target.value }))}
                                            className={styles.select}
                                        >
                                            <option value="">Seleccionar torneo</option>
                                            {tournamentOptions.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {(item.display_name || item.name)}
                                                    {item.season_id ? ` · ${item.season_id}` : ''}
                                                    {item.sport ? ` · ${item.sport}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className={styles.field}>
                                        <span>Tipo de relacion</span>
                                        <select
                                            value={form.relationType}
                                            onChange={(event) => setForm((current) => ({ ...current, relationType: event.target.value }))}
                                            className={styles.select}
                                        >
                                            {TOURNAMENT_RELATION_TYPE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className={styles.field}>
                                        <span>Direccion</span>
                                        <select
                                            value={form.relationDirection}
                                            onChange={(event) => setForm((current) => ({ ...current, relationDirection: event.target.value }))}
                                            className={styles.select}
                                        >
                                            {TOURNAMENT_RELATION_DIRECTION_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className={styles.field}>
                                        <span>Posicion del torneo actual</span>
                                        <select
                                            value={form.relationSide}
                                            onChange={(event) => setForm((current) => ({ ...current, relationSide: event.target.value as 'source' | 'target' }))}
                                            className={styles.select}
                                        >
                                            <option value="source">Origen</option>
                                            <option value="target">Destino</option>
                                        </select>
                                    </label>

                                    <label className={styles.field}>
                                        <span>Estado</span>
                                        <select
                                            value={form.status}
                                            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                                            className={styles.select}
                                        >
                                            {TOURNAMENT_RELATION_STATUS_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className={`${styles.field} ${styles.fieldWide}`}>
                                        <span>Descripcion</span>
                                        <textarea
                                            rows={3}
                                            value={form.description}
                                            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                                            placeholder="Contexto opcional del vinculo"
                                            className={styles.textarea}
                                        />
                                    </label>
                                </div>

                                <div className={styles.formActions}>
                                    <button type="button" className={styles.ghostButton} onClick={resetForm}>
                                        Cancelar
                                    </button>
                                    <button type="button" className={styles.primaryButton} onClick={handleSubmit} disabled={isPending || !linkedState.available}>
                                        <GitBranch size={15} />
                                        {isPending ? 'Guardando...' : form.relationId ? 'Actualizar vinculo' : 'Crear vinculo'}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {linkedState.items.length === 0 ? (
                            <div className={styles.emptyPanel}>Este torneo no tiene torneos vinculados todavia.</div>
                        ) : (
                            <div className={styles.linkedList}>
                                {linkedState.items.map((item) => {
                                    const DirectionIcon = relationDirectionIcon(item.relationDirection);

                                    return (
                                        <article key={item.id} className={styles.linkedCard}>
                                            <div className={styles.linkedIdentity}>
                                                <div className={styles.linkedTitleRow}>
                                                    <Link href={item.href} prefetch={false} className={styles.linkedTitle}>
                                                        {item.linkedTournamentName}
                                                    </Link>
                                                    <Link href={item.href} prefetch={false} className={styles.inlineLink}>
                                                        <ExternalLink size={14} />
                                                    </Link>
                                                </div>
                                                <div className={styles.linkedSubinfo}>
                                                    <span>{item.season || 'Sin temporada'}</span>
                                                    <span>{item.sport || 'Sin deporte'}</span>
                                                    <span>{item.relationSideLabel}</span>
                                                </div>
                                                {item.description ? <p className={styles.linkedDescription}>{item.description}</p> : null}
                                            </div>

                                            <div className={styles.linkedBadges}>
                                                <span className={`${styles.badge} ${getTournamentRelationTypeBadgeClass(item.relationType)}`}>
                                                    <Layers3 size={13} />
                                                    {item.relationTypeLabel}
                                                </span>
                                                <span className={`${styles.badge} ${getTournamentRelationDirectionBadgeClass(item.relationDirection)}`}>
                                                    <DirectionIcon size={13} />
                                                    {item.relationDirectionLabel}
                                                </span>
                                                <span className={`${styles.badge} ${getTournamentRelationStatusBadgeClass(item.relationStatus)}`}>
                                                    <Link2 size={13} />
                                                    {item.relationStatusLabel}
                                                </span>
                                            </div>

                                            <div className={styles.linkedActions}>
                                                <Link href={item.href} prefetch={false} className={styles.actionButton}>
                                                    <ExternalLink size={14} />
                                                    Ver torneo
                                                </Link>
                                                <button type="button" className={styles.actionButton} onClick={() => startEdit(item)}>
                                                    <Pencil size={14} />
                                                    Editar
                                                </button>
                                                <button type="button" className={`${styles.actionButton} ${styles.actionDanger}`} onClick={() => handleDelete(item.id)}>
                                                    <Trash2 size={14} />
                                                    Eliminar
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}
            </div>

            <button
                type="button"
                onClick={startCreate}
                disabled={!linkedState.available || isPending}
                className={styles.fab}
                aria-label="Vincular torneo"
            >
                <Plus size={18} />
                <span>Vincular Torneo</span>
            </button>
        </div>
    );
}

function ChevronGlyph() {
    return <span className={styles.chevron}>›</span>;
}
