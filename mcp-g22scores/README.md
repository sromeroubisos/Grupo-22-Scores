# G22 Scores MCP Server

Servidor MCP remoto para envolver la API REST existente de `https://g22scores.com` y usarla desde ChatGPT Agents / ChatGPT Developer Mode.

Expone exactamente dos tools MCP:

- `search_match`: llama a `POST /api/results/search`.
- `update_result`: llama a `POST /api/results/update`.

La respuesta de la API se devuelve con un wrapper minimo:

```json
{
  "ok": true,
  "endpoint": "/api/results/update",
  "http_status": 200,
  "api_response": {
    "...": "JSON original de g22scores.com"
  }
}
```

## Estructura

```text
mcp-g22scores/
  src/
    config.ts
    g22Client.ts
    schemas.ts
    server.ts
    toolResponse.ts
    tools.ts
  .env.example
  package.json
  tsconfig.json
```

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

```env
G22_BASE_URL=https://g22scores.com
G22_API_KEY=...

PORT=3001
MCP_PATH=/mcp
G22_TIMEOUT_MS=20000
```

`G22_API_KEY` se envia a la API REST como:

```http
Authorization: Bearer <G22_API_KEY>
```

## Instalacion local

```bash
cd mcp-g22scores
npm install
cp .env.example .env
npm run dev
```

El servidor queda disponible en:

```text
http://localhost:3001/mcp
```

El endpoint `/mcp` soporta dos transportes MCP:

- Streamable HTTP stateless: `POST /mcp`
- SSE legacy: `GET /mcp` con `Accept: text/event-stream`, mensajes en `/mcp/messages`

El modo Streamable HTTP es stateless a proposito: no depende del header `Mcp-Session-Id`.
Esto evita que ChatGPT conecte pero no pueda listar tools cuando un proxy o hosting no preserva
headers MCP no estandar.

Health check:

```bash
curl http://localhost:3001/health
```

Build de produccion:

```bash
npm run build
npm start
```

## Verificacion MCP

Con el servidor local corriendo:

```bash
cd mcp-g22scores
npm run build
npm start
```

En otra terminal, listar tools con el cliente MCP oficial:

```bash
node --input-type=module -e "import { Client } from '@modelcontextprotocol/sdk/client/index.js'; import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'; const client = new Client({ name: 'g22-test-client', version: '1.0.0' }); const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3001/mcp')); await client.connect(transport); console.log(JSON.stringify(await client.listTools(), null, 2)); await client.close();"
```

La respuesta debe incluir exactamente estas tools:

```json
{
  "tools": [
    { "name": "search_match" },
    { "name": "update_result" }
  ]
}
```

Tambien podes usar MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

URL del servidor:

```text
http://localhost:3001/mcp
```

Click en `List Tools`; deben aparecer `search_match` y `update_result`.

## Tools

### `search_match`

Campos opcionales:

- `match_id`
- `tournament`
- `category`
- `home_team`
- `away_team`
- `match_date`
- `round`

Si no tenes `match_id`, envia los filtros disponibles. La resolucion del partido queda a cargo de `POST /api/results/search`.

### `update_result`

Campos opcionales de busqueda:

- `match_id`
- `tournament`
- `category`
- `home_team`
- `away_team`
- `match_date`
- `round`

Campos requeridos:

- `home_score`
- `away_score`

Campos opcionales extra:

- `observations`
- `corrections`
- `status`
- `source`
- `bonus_point`
- `bonus_target`
- `home_bonus_points`
- `away_bonus_points`

La API REST debe resolver el partido si no se envia `match_id`, actualizar el marcador y devolver su JSON, idealmente con:

- partido actualizado
- tabla actualizada
- reglas
- `summary.short`
- `summary.changes`

## Manejo de errores

El servidor no oculta el body de error de la API. Para errores HTTP devuelve `isError: true` a MCP y mantiene la respuesta original en `api_response`.

Errores normalizados:

- `401` -> `unauthorized`
- `404` -> `match_not_found`
- `409` + `match_ambiguous` -> `match_ambiguous`
- `409` + `teams_reversed` -> `teams_reversed`
- HTML `404` de hosting/router -> `endpoint_not_found`
- otros `409` -> `conflict`
- otros errores -> `http_error` o `request_failed`

Si ves `endpoint_not_found`, el servidor MCP llego al host configurado, pero esa URL no tiene desplegado `POST /api/results/search` o `POST /api/results/update`.

## Deploy

Usa un host Node.js con HTTPS publico y soporte para conexiones HTTP largas, por ejemplo Render, Railway, Fly.io, Cloud Run o un VPS.

Comandos tipicos:

```bash
npm ci
npm run build
npm start
```

Variables requeridas en el proveedor:

```env
G22_BASE_URL=https://g22scores.com
G22_API_KEY=...
PORT=3001
MCP_PATH=/mcp
```

La URL publica para ChatGPT debe apuntar al endpoint MCP:

```text
https://tu-dominio.com/mcp
```

Para `mcp.g22scores.com`, la URL esperada es:

```text
https://mcp.g22scores.com/mcp
```

El health check debe devolver las tools publicadas:

```bash
curl https://mcp.g22scores.com/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "service": "g22scores-mcp-server",
  "transport": "streamable_http_stateless",
  "mcp_path": "/mcp",
  "tools": [
    "search_match",
    "update_result"
  ]
}
```

Para verificar el listado real MCP en produccion:

```bash
cd mcp-g22scores
node --input-type=module -e "import { Client } from '@modelcontextprotocol/sdk/client/index.js'; import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'; const client = new Client({ name: 'g22-prod-test-client', version: '1.0.0' }); const transport = new StreamableHTTPClientTransport(new URL('https://mcp.g22scores.com/mcp')); await client.connect(transport); console.log(JSON.stringify(await client.listTools(), null, 2)); await client.close();"
```

En ChatGPT:

1. Settings -> Apps & Connectors -> Advanced settings -> activar Developer Mode.
2. Settings -> Connectors -> Create.
3. Connector URL: `https://mcp.g22scores.com/mcp`.
4. Despues de deploys o cambios de metadata, entrar al connector y usar `Refresh`.
5. Confirmar que la UI muestra `search_match` y `update_result`.

Nota: para produccion, evita publicar este MCP en una URL facil de adivinar si no agregas OAuth o una capa de autenticacion delante. La API key queda protegida en el servidor, pero el endpoint MCP puede ejecutar `update_result`.

## Conectar en ChatGPT como Custom MCP

1. Publica el servidor con HTTPS.
2. Abri ChatGPT.
3. Anda a `Settings -> Apps & Connectors -> Advanced settings`.
4. Activa `Developer mode`.
5. En `Settings -> Connectors`, usa `Create`.
6. Carga la URL remota del MCP, por ejemplo `https://tu-dominio.com/mcp`.
7. Elegi `No Authentication` si lo publicaste sin OAuth.
8. Guarda el draft, refresca las tools y verifica que aparezcan solo:
   - `search_match`
   - `update_result`
9. En una conversacion, elegi `Developer mode` desde el selector de herramientas y habilita la app.

Prompt de prueba:

```text
Usa la app G22 Scores. Primero llama search_match para buscar el partido entre Equipo A y Equipo B del torneo X. Si hay un unico partido, llama update_result con home_score 12 y away_score 8. No uses otras herramientas.
```

Las acciones de escritura como `update_result` pueden requerir confirmacion en ChatGPT.
