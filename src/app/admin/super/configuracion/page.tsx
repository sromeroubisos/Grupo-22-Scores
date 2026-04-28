'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../page.module.css';
import { TelegramBotAuthorizationPanel } from './TelegramBotAuthorizationPanel';

type ResultsApiKeySettings = {
  keyName: string;
  environment: {
    configuredNames: string[];
  };
  database: {
    storageReady: boolean;
    configured: boolean;
    preview: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  availableSources: string[];
};

type SettingsResponse =
  | { ok: true; data: ResultsApiKeySettings; error?: undefined; details?: undefined }
  | { ok: false; error?: string; details?: unknown };

type RotateResponse =
  | {
      ok: true;
      data: {
        keyName: string;
        secret: string;
        preview: string;
        createdAt: string;
        updatedAt: string;
      };
      error?: undefined;
      details?: undefined;
    }
  | { ok: false; error?: string; details?: unknown };

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Sin registro';
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

function buildSearchExample() {
  return JSON.stringify(
    {
      tournament: 'Primera',
      category: 'Intermedia',
      home_team: 'Equipo A',
      away_team: 'Equipo B',
      match_date: '2026-04-23',
      round: 'Fecha 5',
    },
    null,
    2,
  );
}

function buildUpdateExample() {
  return JSON.stringify(
    {
      match_id: '12345',
      home_score: 2,
      away_score: 1,
      observations: 'Resultado confirmado por mesa de control',
      corrections: 'Se ajusto el score del segundo tiempo',
    },
    null,
    2,
  );
}

export default function ConfiguracionPage() {
  const [settings, setSettings] = useState<ResultsApiKeySettings | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const response = await fetch('/api/admin/super/results-api-key', {
      cache: 'no-store',
      credentials: 'include',
    });

    const payload = await response.json() as SettingsResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.ok ? 'No se pudo cargar la configuracion.' : (payload.error || 'No se pudo cargar la configuracion.'));
    }

    setSettings(payload.data);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        await loadSettings();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la configuracion.');
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
  }, [loadSettings]);

  const handleRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      await loadSettings();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'No se pudo refrescar el estado.');
    } finally {
      setIsRefreshing(false);
    }
  }, [loadSettings]);

  const handleGenerate = useCallback(async () => {
    try {
      setIsGenerating(true);
      setError(null);

      const response = await fetch('/api/admin/super/results-api-key', {
        method: 'POST',
        credentials: 'include',
      });

      const payload = await response.json() as RotateResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? 'No se pudo generar la API key.' : (payload.error || 'No se pudo generar la API key.'));
      }

      setGeneratedKey(payload.data.secret);
      await loadSettings();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'No se pudo generar la API key.');
    } finally {
      setIsGenerating(false);
    }
  }, [loadSettings]);

  const handleCopy = useCallback(async (token: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken((current) => (current === token ? null : current)), 1600);
    } catch {
      setError('No se pudo copiar al portapapeles desde este navegador.');
    }
  }, []);

  const searchEndpoint = `${baseUrl}/api/results/search`;
  const updateEndpoint = `${baseUrl}/api/results/update`;
  const openApiUrl = `${baseUrl}/api/openapi/results`;

  const curlSnippet = useMemo(() => {
    const keyValue = generatedKey || '<TU_API_KEY>';
    return [
      `curl -X POST "${searchEndpoint}" \\`,
      `  -H "Authorization: Bearer ${keyValue}" \\`,
      '  -H "Content-Type: application/json" \\',
      `  -d '${buildSearchExample()}'`,
    ].join('\n');
  }, [generatedKey, searchEndpoint]);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.pageTitle}>Configuracion del sistema</h1>
          <p className={styles.pageSubtitle}>API key local para resultados y uso de integraciones externas</p>
        </div>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => void handleRefresh()}
            disabled={loading || isRefreshing}
          >
            {isRefreshing ? 'Actualizando...' : 'Refrescar'}
          </button>
          <button
            type="button"
            className={styles.viewSiteBtn}
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generando...' : settings?.database.configured ? 'Rotar API key' : 'Generar API key'}
          </button>
        </div>
      </header>

      <div className={styles.content}>
        {error ? (
          <div className={styles.card} style={{ borderColor: 'var(--color-error)', padding: '1rem 1.25rem' }}>
            <div style={{ color: 'var(--color-error)', fontWeight: 700, marginBottom: 6 }}>Error de configuracion</div>
            <div style={{ color: 'var(--color-text-secondary)' }}>{error}</div>
          </div>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>Estado de la API key de resultados</h2>
          </div>

          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Base local</h3>
                <span className={`${styles.pill} ${settings?.database.configured ? styles.pillSuccess : styles.pillNeutral}`}>
                  {loading ? 'Cargando' : settings?.database.configured ? 'Activa' : 'Sin key'}
                </span>
              </div>
              <div className={styles.activityList}>
                <div className={styles.activityItem}>
                  <div className={styles.activityContent}>
                    <span className={styles.activityMessage}>Storage</span>
                    <span className={styles.activityMeta}>
                      {settings?.database.storageReady === false ? 'Falta correr la migracion de system_api_keys' : 'Listo para guardar la key'}
                    </span>
                  </div>
                </div>
                <div className={styles.activityItem}>
                  <div className={styles.activityContent}>
                    <span className={styles.activityMessage}>Preview guardado</span>
                    <span className={`${styles.activityMeta} ${styles.mono}`}>{settings?.database.preview || 'Sin valor generado todavia'}</span>
                  </div>
                </div>
                <div className={styles.activityItem}>
                  <div className={styles.activityContent}>
                    <span className={styles.activityMessage}>Ultima rotacion</span>
                    <span className={styles.activityMeta}>{formatDateTime(settings?.database.updatedAt || null)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Fallback por entorno</h3>
                <span className={`${styles.pill} ${settings?.environment.configuredNames.length ? styles.pillWarning : styles.pillNeutral}`}>
                  {loading ? 'Cargando' : settings?.environment.configuredNames.length ? 'Detectado' : 'Vacio'}
                </span>
              </div>
              <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
                    Variables aceptadas por la API
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(settings?.environment.configuredNames.length ? settings.environment.configuredNames : [
                      'RESULTS_API_KEY',
                      'MATCH_RESULTS_API_KEY',
                      'WHATSAPP_MATCH_WEBHOOK_SECRET',
                      'N8N_MATCH_WEBHOOK_SECRET',
                    ]).map((name) => (
                      <span key={name} className={`${styles.pill} ${styles.pillNeutral}`}>{name}</span>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  La autenticacion de <span className={styles.mono}>/api/results/search</span> y <span className={styles.mono}>/api/results/update</span> acepta la key
                  guardada en base local y tambien cualquier secret configurado por entorno.
                </div>
              </div>
            </div>
          </div>
        </section>

        <TelegramBotAuthorizationPanel />

        {generatedKey ? (
          <section className={styles.section}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Nueva API key generada</h3>
                <span className={`${styles.pill} ${styles.pillSuccess}`}>Mostrada una sola vez</span>
              </div>
              <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '1rem' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Copiala ahora. En la base local solo se guarda su hash y un preview parcial.
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
                  }}
                >
                  {generatedKey}
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={styles.viewSiteBtn}
                    onClick={() => void handleCopy('api-key', generatedKey)}
                  >
                    {copiedToken === 'api-key' ? 'API key copiada' : 'Copiar API key'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>Uso de la integracion</h2>
          </div>

          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Schema para la app personalizada</h3>
              </div>
              <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '0.9rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Usa esta URL OpenAPI en la conexion personalizada para que publique las acciones
                  <span className={styles.mono}> searchResultsMatch </span>
                  y
                  <span className={styles.mono}> updateResultsMatch</span>.
                </div>
                <div className={styles.mono}>{openApiUrl}</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => void handleCopy('openapi-url', openApiUrl)}
                  >
                    {copiedToken === 'openapi-url' ? 'URL copiada' : 'Copiar URL OpenAPI'}
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Endpoints</h3>
              </div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Operacion</th>
                    <th>Metodo</th>
                    <th>URL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={styles.tableRow}>
                    <td>Buscar partido</td>
                    <td>POST</td>
                    <td className={styles.mono}>{searchEndpoint}</td>
                  </tr>
                  <tr className={styles.tableRow}>
                    <td>Actualizar resultado</td>
                    <td>POST</td>
                    <td className={styles.mono}>{updateEndpoint}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Headers</h3>
              </div>
              <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '0.8rem' }}>
                <div className={styles.mono}>Authorization: Bearer {generatedKey || '<TU_API_KEY>'}</div>
                <div className={styles.mono}>x-api-key: {generatedKey || '<TU_API_KEY>'}</div>
                <div className={styles.mono}>x-webhook-secret: {generatedKey || '<TU_API_KEY>'}</div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Payload de busqueda</h3>
                <span className={`${styles.pill} ${styles.pillInfo}`}>POST /api/results/search</span>
              </div>
              <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Acepta <span className={styles.mono}>match_id</span> o bien la combinacion de <span className={styles.mono}>home_team</span> y <span className={styles.mono}>away_team</span>.
                </div>
                <pre
                  className={styles.mono}
                  style={{
                    margin: 0,
                    padding: '1rem',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-tertiary)',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {buildSearchExample()}
                </pre>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Payload de actualizacion</h3>
                <span className={`${styles.pill} ${styles.pillInfo}`}>POST /api/results/update</span>
              </div>
              <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  Requiere <span className={styles.mono}>home_score</span> y <span className={styles.mono}>away_score</span>, mas <span className={styles.mono}>match_id</span> o datos suficientes para resolver el partido.
                </div>
                <pre
                  className={styles.mono}
                  style={{
                    margin: 0,
                    padding: '1rem',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-tertiary)',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {buildUpdateExample()}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Snippet rapido</h3>
              <button
                type="button"
                className={styles.btn}
                onClick={() => void handleCopy('curl', curlSnippet)}
              >
                {copiedToken === 'curl' ? 'Snippet copiado' : 'Copiar curl'}
              </button>
            </div>
            <pre
              className={styles.mono}
              style={{
                margin: 0,
                padding: '1rem 1.25rem',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.6,
              }}
            >
              {curlSnippet}
            </pre>
          </div>
        </section>
      </div>
    </>
  );
}
