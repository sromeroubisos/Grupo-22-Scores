import type { ApiKeyFallback, ApiKeyScope } from '@/lib/server/apiKeys';

/**
 * Los secrets por entorno que ya estan configurados en Vercel y siguen siendo
 * validos mientras las integraciones no migren a una key del panel.
 *
 * Estan declarados en UN solo lugar a proposito: el panel los lista como
 * "puente" y las rutas los aceptan leyendo la misma fuente. Si se agrega una
 * variable en una ruta y no aca, el panel deja de decir la verdad.
 *
 * No se pueden revocar desde el panel — se apagan sacando la variable de
 * Vercel—, y por eso conviene reemplazarlos por keys de la base.
 */

export function resultsEnvFallback(): ApiKeyFallback {
  return {
    name: 'Variables de entorno de resultados',
    secrets: [
      process.env.RESULTS_API_KEY,
      process.env.MATCH_RESULTS_API_KEY,
      process.env.WHATSAPP_MATCH_WEBHOOK_SECRET,
      process.env.N8N_MATCH_WEBHOOK_SECRET,
    ],
    scopes: ['results:read', 'results:write', 'lineups:write', 'matches:create'],
  };
}

export function matchIngestEnvFallback(): ApiKeyFallback {
  return {
    name: 'Secret del webhook de partidos',
    secrets: [process.env.WHATSAPP_MATCH_WEBHOOK_SECRET, process.env.N8N_MATCH_WEBHOOK_SECRET],
    scopes: ['matches:ingest'],
  };
}

export function cronEnvFallback(): ApiKeyFallback {
  return {
    name: 'CRON_SECRET',
    secrets: [process.env.CRON_SECRET],
    scopes: ['cron:run'],
  };
}

/** Que variable alimenta cada permiso, para poder mostrarlo en el panel. */
const ENV_NAMES_BY_SCOPE: Record<ApiKeyScope, string[]> = {
  'results:read': [
    'RESULTS_API_KEY',
    'MATCH_RESULTS_API_KEY',
    'WHATSAPP_MATCH_WEBHOOK_SECRET',
    'N8N_MATCH_WEBHOOK_SECRET',
  ],
  'results:write': [
    'RESULTS_API_KEY',
    'MATCH_RESULTS_API_KEY',
    'WHATSAPP_MATCH_WEBHOOK_SECRET',
    'N8N_MATCH_WEBHOOK_SECRET',
  ],
  'lineups:write': [
    'RESULTS_API_KEY',
    'MATCH_RESULTS_API_KEY',
    'WHATSAPP_MATCH_WEBHOOK_SECRET',
    'N8N_MATCH_WEBHOOK_SECRET',
  ],
  'matches:create': [
    'RESULTS_API_KEY',
    'MATCH_RESULTS_API_KEY',
    'WHATSAPP_MATCH_WEBHOOK_SECRET',
    'N8N_MATCH_WEBHOOK_SECRET',
  ],
  'matches:ingest': ['WHATSAPP_MATCH_WEBHOOK_SECRET', 'N8N_MATCH_WEBHOOK_SECRET'],
  'cron:run': ['CRON_SECRET'],
};

export type EnvFallbackStatus = {
  scope: ApiKeyScope;
  names: string[];
  configuredNames: string[];
};

/**
 * Estado de los fallbacks, sin devolver ni un fragmento del secreto: solo el
 * nombre de la variable y si tiene valor.
 */
export function getEnvFallbackStatus(): EnvFallbackStatus[] {
  return (Object.keys(ENV_NAMES_BY_SCOPE) as ApiKeyScope[]).map((scope) => {
    const names = ENV_NAMES_BY_SCOPE[scope];

  return {
      scope,
      names,
      configuredNames: names.filter((name) => Boolean(process.env[name]?.trim())),
    };
  });
}
