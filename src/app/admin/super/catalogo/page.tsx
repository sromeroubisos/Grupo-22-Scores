'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Link as LinkIcon, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from '../page.module.css';

// --- Types ---
type ProviderEntityStatus = 'unlinked' | 'linked' | 'conflict' | 'ignored';

interface ProviderEntity {
    id: string;
    provider: string;
    entity_type: string;
    external_id: string;
    internal_id?: string | null;
    sport_id: string;
    country_id?: string;
    raw_payload: any;
    status: ProviderEntityStatus;
    updated_at: string;
}

export default function ApiCatalogPage() {
    const supabase = createClient();
    const [entities, setEntities] = useState<ProviderEntity[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    const fetchEntities = async () => {
        setLoading(true);
        try {
            const { data, error } = await (supabase as any).from('provider_entities')
                .select('*')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            setEntities((data || []) as any);
        } catch (error) {
            console.error('Error fetching API entities:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEntities();
    }, []);

    const filteredEntities = useMemo(() => {
        return entities.filter(e => {
            const name = e.raw_payload?.name?.toLowerCase() || '';
            const matchesSearch = name.includes(searchTerm.toLowerCase()) || e.external_id.includes(searchTerm);
            const matchesType = typeFilter === 'all' || e.entity_type === typeFilter;
            const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
            return matchesSearch && matchesType && matchesStatus;
        });
    }, [entities, searchTerm, typeFilter, statusFilter]);

    const stats = useMemo(() => {
        return {
            total: entities.length,
            unlinked: entities.filter(e => e.status === 'unlinked').length,
            conflicts: entities.filter(e => e.status === 'conflict').length,
        };
    }, [entities]);

    return (
        <div style={{ paddingBottom: '40px' }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Catálogo de Entidades API</div>
                    <div className={styles.consoleSubtitle}>Sincronización y mapeo de datos externos</div>
                </div>
                <div className={styles.consoleActions}>
                    <button onClick={fetchEntities} className={styles.cardAction} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
                    </button>
                </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <div className={styles.cardItem} style={{ padding: '20px', borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '4px' }}>Total Entidades</div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>{stats.total}</div>
                </div>
                <div className={styles.cardItem} style={{ padding: '20px', borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '4px' }}>Pendientes</div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>{stats.unlinked}</div>
                </div>
                <div className={styles.cardItem} style={{ padding: '20px', borderLeft: '4px solid #ef4444' }}>
                    <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '4px' }}>Conflictos</div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>{stats.conflicts}</div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className={styles.filterBar}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4b5563' }} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o ID externo..."
                        className={styles.filterControl}
                        style={{ paddingLeft: '36px', width: '100%', maxWidth: 'none' }}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <select className={styles.filterControl} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="all">Todos los tipos</option>
                    <option value="tournament">Torneos</option>
                    <option value="club">Clubes</option>
                    <option value="player">Jugadores</option>
                </select>

                <select className={styles.filterControl} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">Todos los estados</option>
                    <option value="unlinked">Sin vincular</option>
                    <option value="linked">Vinculados</option>
                    <option value="conflict">Conflictos</option>
                </select>
            </div>

            {/* Entities List */}
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Cargando catálogo...</div>
            ) : (
                <div className={styles.cardGrid} style={{ gridTemplateColumns: '1fr' }}>
                    {filteredEntities.length === 0 ? (
                        <div className={styles.cardItem} style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                            No se encontraron entidades con los filtros seleccionados.
                        </div>
                    ) : (
                        filteredEntities.map(entity => (
                            <div key={entity.id} className={styles.cardItem} style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px 24px' }}>
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'
                                }}>
                                    {entity.entity_type === 'tournament' ? '🏆' : entity.entity_type === 'club' ? '🛡️' : '👤'}
                                </div>

                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontWeight: 600, fontSize: '15px' }}>{entity.raw_payload?.name || 'Sin nombre'}</span>
                                        <span style={{
                                            fontSize: '11px', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px',
                                            background: 'rgba(255,255,255,0.08)', color: '#9ca3af'
                                        }}>
                                            {entity.provider}
                                        </span>
                                    </div>
                                    <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '2px' }}>
                                        ID Externo: <code style={{ color: '#9ca3af' }}>{entity.external_id}</code> ·
                                        Sport: {entity.sport_id} ·
                                        País: {entity.country_id || 'Global'}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {entity.status === 'conflict' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '12px', fontWeight: 600 }}>
                                            <AlertTriangle size={14} /> Conflicto
                                        </div>
                                    )}

                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '4px 12px', borderRadius: '99px', fontSize: '12px',
                                        background: entity.status === 'linked' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                                        color: entity.status === 'linked' ? '#10b981' : '#6b7280',
                                        border: `1px solid ${entity.status === 'linked' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)'}`
                                    }}>
                                        {entity.status === 'linked' ? 'Vinculado' : 'Sin Vincular'}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className={styles.actionBtn} title="Ver detalles externos">
                                            <ExternalLink size={14} />
                                        </button>
                                        <button
                                            className={`${styles.actionBtn} ${entity.status === 'linked' ? '' : styles.actionBtnPrimary}`}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                        >
                                            <LinkIcon size={14} />
                                            {entity.status === 'linked' ? 'Remapear' : 'Vincular'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            <style jsx>{`
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
