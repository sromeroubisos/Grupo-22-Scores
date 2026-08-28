'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../page.module.css';

type ScopeDefinition = {
  id: string;
  label: string;
  description: string;
};

type ApiKeyRecord = {
  id: string;
  name: string;
  description: string | null;
  preview: string;
  scopes: string[];
  createdAt: string;
  createdByUserId: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revoked: boolean;
};

type EnvFallbackStatus = {
  scope: string;
  names: string[];
  configuredNames: string[];
};

type ApiKeysPayload = {
  keys: ApiKeyRecord[];
  scopes: ScopeDefinition[];
  envFallbacks: EnvFallbackStatus[];
  storageReady: boolean;
  storageMessage: string | null;
};

type ListResponse =
  | { ok: true; data: ApiKeysPayload; error?: undefined }
  | { ok: false; error?: string };
type CreateResponse =
  | { ok: true; data: { key: ApiKeyRecord; secret: string }; error?: undefined }
  | { ok: false; error?: string };
type RevokeResponse =
  | { ok: true; data: { key: ApiKeyRecord }; error?: undefined }
  | { ok: false; error?: string };

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Nunca';
  }

  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ApiKeysPanel() {
  const [payload, setPayload] = useState<ApiKeysPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [freshKey, setFreshKey] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/super/api-keys', {
      cache: 'no-store',
      credentials: 'include',
    });

    const body = (await response.json()) as ListResponse;
    if (!response.ok || !body.ok) {
      throw new Error(
        body.ok ? 'No se pudieron cargar las API keys.' : body.error || 'No se pudieron cargar las API keys.',
      );
    }

    setPayload(body.data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        await load();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar las API keys.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [load]);

  const toggleScope = useCallback((scopeId: string) => {
    setSelectedScopes((current) =>
      current.includes(scopeId) ? current.filter((id) => id !== scopeId) : [...current, scopeId],
    );
  }, []);

  const handleCreate = useCallback(async () => {
    try {
      setIsCreating(true);
      setError(null);
      setNotice(null);

      const response = await fetch('/api/admin/super/api-keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          scopes: selectedScopes,
        }),
      });

      const body = (await response.json()) as CreateResponse;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? 'No se pudo crear la API key.' : body.error || 'No se pudo crear la API key.');
      }

      setFreshKey({ name: body.data.key.name, secret: body.data.secret });
      setCopied(false);
      setName('');
      setDescription('');
      setSelectedScopes([]);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No se pudo crear la API key.');
    } finally {
      setIsCreating(false);
    }
  }, [description, load, name, selectedScopes]);

  const handleRevoke = useCallback(
    async (key: ApiKeyRecord) => {
      const confirmed = window.confirm(
        `Revocar "${key.name}". Todo lo que la use deja de autenticar en el momento. No se puede deshacer.`,
      );

      if (!confirmed) {
        return;
      }

      try {
        setRevokingId(key.id);
        setError(null);
        setNotice(null);

        const response = await fetch(`/api/admin/super/api-keys/${key.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        const body = (await response.json()) as RevokeResponse;
        if (!response.ok || !body.ok) {
          throw new Error(
            body.ok ? 'No se pudo revocar la API key.' : body.error || 'No se pudo revocar la API key.',
          );
        }

        setNotice(`La key "${key.name}" quedo revocada.`);
        await load();
      } catch (revokeError) {
        setError(revokeError instanceof Error ? revokeError.message : 'No se pudo revocar la API key.');
      } finally {
        setRevokingId(null);
      }
    },
    [load],
  );

  const handleCopy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('No se pudo copiar al portapapeles desde este navegador.');
    }
  }, []);

  const scopeLabels = useMemo(() => {
    const map = new Map<string, string>();
    (payload?.scopes ?? []).forEach((scope) => map.set(scope.id, scope.label));
    return map;
  }, [payload?.scopes]);

  // El boton deshabilitado tiene que decir que falta para habilitarse.
  const createBlockedReason = useMemo(() => {
    if (payload?.storageReady === false) {
      return 'Falta correr la migracion de api_keys para poder guardar keys.';
    }
    if (!name.trim()) {
      return 'Poneles un nombre para saber despues quien la usa.';
    }
    if (selectedScopes.length === 0) {
      return 'Elegi al menos un permiso.';
    }
    return null;
  }, [name, payload?.storageReady, selectedScopes.length]);

  const activeKeys = (payload?.keys ?? []).filter((key) => !key.revoked);
  const revokedKeys = (payload?.keys ?? []).filter((key) => key.revoked);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <h2 className={styles.sectionTitle}>API keys</h2>
        <span className={`${styles.pill} ${activeKeys.length ? styles.pillSuccess : styles.pillNeutral}`}>
          {loading ? 'Cargando' : `${activeKeys.length} activas`}
        </span>
      </div>

      {error ? (
        <div className={styles.card} style={{ borderColor: 'var(--color-error)', padding: '1rem 1.25rem' }}>
          <div style={{ color: 'var(--color-error)', fontWeight: 700, marginBottom: 6 }}>No se pudo completar</div>
          <div style={{ color: 'var(--color-text-secondary)' }}>{error}</div>
        </div>
      ) : null}

      {notice ? (
        <div className={styles.card} style={{ padding: '1rem 1.25rem' }}>
          <div style={{ color: 'var(--color-text-secondary)' }}>{notice}</div>
        </div>
      ) : null}

      {payload?.storageReady === false ? (
        <div className={styles.card} style={{ borderColor: 'var(--color-warning)', padding: '1rem 1.25rem' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>La tabla todavia no existe</div>
          <div style={{ color: 'var(--color-text-secondary)' }}>{payload.storageMessage}</div>
        </div>
      ) : null}

      {freshKey ? (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>{freshKey.name}</h3>
            <span className={`${styles.pill} ${styles.pillSuccess}`}>Se muestra una sola vez</span>
          </div>
          <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '1rem' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Copiala ahora y pegala en la integracion. En la base queda solo su hash: si la perdes, no hay forma de
              recuperarla y hay que crear otra.
            </div>
            <div
              className={styles.mono}
              style={{
                padding: '1rem',
                borderRadius: 12,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-tertiary)',
                overflowX: 'auto',
                fontSize: '0.9rem',
                wordBreak: 'break-all',
              }}
            >
              {freshKey.secret}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className={styles.viewSiteBtn} onClick={() => void handleCopy(freshKey.secret)}>
                {copied ? 'Key copiada' : 'Copiar key'}
              </button>
              <button type="button" className={styles.btn} onClick={() => setFreshKey(null)}>
                Ya la guarde
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Keys activas</h3>
        </div>

        {loading ? (
          <div style={{ padding: '1rem 1.25rem', color: 'var(--color-text-secondary)' }}>Cargando keys...</div>
        ) : activeKeys.length === 0 ? (
          <div style={{ padding: '1rem 1.25rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Todavia no hay ninguna key. Crea una abajo, una por integracion: asi despues se puede revocar la de un
            consumidor sin dejar sin servicio a los demas.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Key</th>
                <th>Permisos</th>
                <th>Ultimo uso</th>
                <th>Creada</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {activeKeys.map((key) => (
                <tr key={key.id} className={styles.tableRow}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{key.name}</div>
                    {key.description ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>{key.description}</div>
                    ) : null}
                  </td>
                  <td className={styles.mono}>{key.preview}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {key.scopes.map((scope) => (
                        <span key={scope} className={`${styles.pill} ${styles.pillInfo}`}>
                          {scopeLabels.get(scope) || scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{formatDateTime(key.lastUsedAt)}</td>
                  <td>{formatDateTime(key.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.btn}
                      onClick={() => void handleRevoke(key)}
                      disabled={revokingId === key.id}
                    >
                      {revokingId === key.id ? 'Revocando...' : 'Revocar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Nueva API key</h3>
        </div>
        <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '1.1rem' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className={styles.filterLabel} htmlFor="api-key-name">
              Nombre
            </label>
            <input
              id="api-key-name"
              className={styles.filterInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="n8n resultados"
              maxLength={80}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label className={styles.filterLabel} htmlFor="api-key-description">
              Para que es (opcional)
            </label>
            <input
              id="api-key-description"
              className={styles.filterInput}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Carga de marcadores desde la mesa de control"
              maxLength={160}
            />
          </div>

          <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            <legend className={styles.filterLabel} style={{ padding: 0, marginBottom: 4 }}>
              Permisos
            </legend>
            {(payload?.scopes ?? []).map((scope) => (
              <label key={scope.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope.id)}
                  onChange={() => toggleScope(scope.id)}
                  style={{ marginTop: 4 }}
                />
                <span>
                  <span style={{ fontWeight: 600 }}>{scope.label}</span>
                  <span
                    className={styles.mono}
                    style={{ fontSize: '0.75rem', marginLeft: 8, color: 'var(--color-text-tertiary)' }}
                  >
                    {scope.id}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {scope.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.viewSiteBtn}
              onClick={() => void handleCreate()}
              disabled={Boolean(createBlockedReason) || isCreating}
            >
              {isCreating ? 'Creando...' : 'Crear API key'}
            </button>
            {createBlockedReason ? (
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{createBlockedReason}</span>
            ) : null}
          </div>
        </div>
      </div>

      {revokedKeys.length > 0 ? (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Revocadas</h3>
            <span className={`${styles.pill} ${styles.pillNeutral}`}>{revokedKeys.length}</span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Key</th>
                <th>Ultimo uso</th>
                <th>Revocada</th>
              </tr>
            </thead>
            <tbody>
              {revokedKeys.map((key) => (
                <tr key={key.id} className={styles.tableRow}>
                  <td>{key.name}</td>
                  <td className={styles.mono}>{key.preview}</td>
                  <td>{formatDateTime(key.lastUsedAt)}</td>
                  <td>{formatDateTime(key.revokedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Secrets por entorno</h3>
          <span className={`${styles.pill} ${styles.pillWarning}`}>No se revocan desde aca</span>
        </div>
        <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Las variables de Vercel siguen autenticando para que las integraciones ya configuradas no se corten. Son
            un puente: se apagan sacando la variable, no desde el panel. Lo sano es reemplazarlas por una key de esta
            tabla.
          </div>
          <div className={styles.activityList}>
            {(payload?.envFallbacks ?? []).map((fallback) => (
              <div key={fallback.scope} className={styles.activityItem}>
                <div className={styles.activityContent}>
                  <span className={styles.activityMessage}>{scopeLabels.get(fallback.scope) || fallback.scope}</span>
                  <span className={styles.activityMeta}>
                    {fallback.configuredNames.length > 0
                      ? `Con valor: ${fallback.configuredNames.join(', ')}`
                      : `Sin valor (${fallback.names.join(', ')})`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
