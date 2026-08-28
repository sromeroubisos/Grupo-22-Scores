# Results Update API

## Resumen

Se agregaron endpoints externos para integraciones tipo n8n, GPT Actions o agentes:

- `POST /api/results/update`
- `POST /api/results/search`
- `POST /api/results/tournaments/search`
- `POST /api/results/matches/by-date`
- `POST /api/results/pieces`

Ambos usan API key y devuelven JSON consistente para:

- resolver partidos por `match_id` o por equipos
- validar ambiguedades
- actualizar el resultado real en G22Scores
- recalcular la tabla
- devolver reglas de desempate y un resumen de cambios

## Autenticacion

La API acepta tres fuentes, en este orden:

1. **Una API key del panel** (`Super Admin > Configuracion > API keys`). Es la
   recomendada: cada integracion tiene la suya, con nombre, permisos y boton de
   revocar. En la base queda solo el hash, asi que la key se muestra una unica
   vez, cuando se crea.
2. La key unica heredada de `system_api_keys`, que se conserva para no cortar
   lo que ya estaba configurado.
3. Una variable de entorno.

Variables soportadas:

- `RESULTS_API_KEY`
- `MATCH_RESULTS_API_KEY`
- `WHATSAPP_MATCH_WEBHOOK_SECRET`
- `N8N_MATCH_WEBHOOK_SECRET`

### Permisos

Una key del panel lleva permisos, y el endpoint pide el suyo:

| Permiso | Endpoints |
|---|---|
| `results:read` | `/api/results/search`, `/api/results/tournaments/search`, `/api/results/matches/by-date`, `/api/results/pieces` |
| `results:write` | `/api/results/update` |
| `lineups:write` | `/api/results/lineups` |

Una key de solo lectura que intente actualizar un resultado recibe **403** con
`code: "forbidden_scope"`; una key revocada recibe **401** con
`code: "revoked"`. Las variables de entorno conceden los dos permisos.

Puedes autenticar con cualquiera de estos headers:

- `Authorization: Bearer <SECRET>`
- `x-api-key: <SECRET>`
- `x-webhook-secret: <SECRET>`

## Gestion desde Super Admin

En `Super Admin > Configuracion` ahora puedes:

- generar o rotar la API key de resultados
- guardar la key en la base local
- copiar la key una sola vez al momento de generarla
- ver el preview guardado y la fecha de ultima rotacion

La base guarda el hash de la key, no el valor completo.

## OpenAPI para app personalizada / GPT Actions

El sitio publica una especificacion OpenAPI en:

- `GET /api/openapi/results`

Esa spec expone estas acciones usables:

- `searchResultsTournaments` -> `POST /api/results/tournaments/search`
- `searchResultsMatchesByDate` -> `POST /api/results/matches/by-date`
- `searchResultsMatch` → `POST /api/results/search`
- `updateResultsMatch` → `POST /api/results/update`

- `getResultsPublishingPieces` -> `POST /api/results/pieces`

Para conexiones tipo GPT Actions / app personalizada, configura autenticacion por Bearer API key usando la misma key generada en `Super Admin > Configuracion`.

## Endpoint: buscar partido

`POST /api/results/search`

### Payload

```json
{
  "tournament": "Primera",
  "home_team": "Equipo A",
  "away_team": "Equipo B",
  "match_date": "2026-04-23",
  "category": "Intermedia",
  "round": "Fecha 5"
}
```

### Respuesta

```json
{
  "ok": true,
  "count": 1,
  "matches": [
    {
      "match_id": "12345",
      "matched_by": "exact_order",
      "tournament": "Primera",
      "category": "Intermedia",
      "round": "Fecha 5",
      "match_date": "2026-04-23",
      "status": "scheduled",
      "home_team": "Equipo A",
      "away_team": "Equipo B",
      "home_score": 0,
      "away_score": 0
    }
  ],
  "rules": {
    "points_for_win": 4,
    "points_for_draw": 2,
    "points_for_loss": 0,
    "tiebreakers": ["points_difference"]
  }
}
```

Notas:

- si encuentra partidos con local/visitante invertidos, responde en `reversed_matches`
- si la resolucion de nombres es ambigua, responde `409`
- si hay exactamente un partido, incluye `standings_context` y `rules`

## Endpoint: buscar torneos

`POST /api/results/tournaments/search`

### Payload

```json
{
  "query": "Primera",
  "sport": "rugby",
  "status": "published",
  "limit": 10,
  "include_static": true
}
```

### Respuesta

```json
{
  "ok": true,
  "count": 1,
  "tournaments": [
    {
      "tournament_id": "torneo-1",
      "name": "Primera",
      "display_name": "Primera",
      "slug": "primera",
      "category": "Superior",
      "status": "published",
      "sport_id": "rugby",
      "source": "database",
      "url": null,
      "external_id": null
    }
  ]
}
```

## Endpoint: buscar partidos por fecha

`POST /api/results/matches/by-date`

### Payload

```json
{
  "date": "2026-04-23",
  "timezone": "America/Argentina/Buenos_Aires",
  "sport": "rugby",
  "tournament": "Primera",
  "team": "Equipo A",
  "status": "scheduled",
  "limit": 50,
  "include_pieces": false
}
```

### Respuesta

```json
{
  "ok": true,
  "date": "2026-04-23",
  "timezone": "America/Argentina/Buenos_Aires",
  "count": 1,
  "matches": [
    {
      "match_id": "12345",
      "matched_by": "date",
      "tournament_id": "torneo-1",
      "tournament": "Primera",
      "match_date": "2026-04-23",
      "match_time": "16:00",
      "home_team": "Equipo A",
      "away_team": "Equipo B",
      "status": "scheduled"
    }
  ]
}
```

Si `include_pieces` es `true`, tambien devuelve una pieza `daily_matches` lista como texto y payload para `ExportImage`.

## Endpoint: actualizar resultado

`POST /api/results/update`

### Payload minimo

```json
{
  "tournament": "Primera",
  "match_id": "12345",
  "home_team": "Equipo A",
  "away_team": "Equipo B",
  "home_score": 2,
  "away_score": 1,
  "match_date": "2026-04-23"
}
```

### Campos soportados

- `match_id`
- `tournament`
- `category`
- `home_team`
- `away_team`
- `home_score`
- `away_score`
- `match_date`
- `round`
- `status`
- `observations`
- `corrections`
- `source`
- `bonus_point`
- `bonus_target`
- `home_bonus_points`
- `away_bonus_points`

### Respuesta

```json
{
  "ok": true,
  "updated_match": {
    "match_id": "12345",
    "tournament": "Primera",
    "category": "Intermedia",
    "status": "final",
    "match_date": "2026-04-23",
    "home_team": "Equipo A",
    "away_team": "Equipo B",
    "home_score": 2,
    "away_score": 1
  },
  "standings_updated": true,
  "standings_context": {
    "tournament_id": "torneo-1",
    "phase_id": "fase-1",
    "group_id": null
  },
  "rules": {
    "points_for_win": 4,
    "points_for_draw": 2,
    "points_for_loss": 0,
    "tiebreakers": ["points_difference"]
  },
  "summary": {
    "short": "Marcador: Equipo A 0-0 Equipo B -> 2-1",
    "changes": [
      "Marcador: Equipo A 0-0 Equipo B -> 2-1",
      "Equipo A subio del puesto 3 al 2"
    ]
  },
  "table": []
}
```

## Endpoint: pedir piezas listas para publicar

`POST /api/results/pieces`

Puede resolver por `match_id`, por `date`, o por `home_team` + `away_team`.

### Payload

```json
{
  "match_id": "12345",
  "piece_types": ["match_result", "standings"],
  "timezone": "America/Argentina/Buenos_Aires"
}
```

Tipos soportados:

- `match_result`
- `match_schedule`
- `daily_matches`
- `standings`

### Respuesta

```json
{
  "ok": true,
  "count": 2,
  "match_count": 1,
  "pieces": [
    {
      "piece_id": "match_result-12345",
      "type": "match_result",
      "status": "ready",
      "title": "Final: Equipo A 2-1 Equipo B",
      "caption": "Final en Primera: Equipo A 2-1 Equipo B.",
      "whatsapp_text": "Resultado cargado\nEquipo A 2-1 Equipo B\nPrimera",
      "alt_text": "Final: Equipo A 2-1 Equipo B. Primera.",
      "suggested_filename": "g22-match_result-12345",
      "render": {
        "status": "render_payload_ready",
        "engine": "ExportImage",
        "template": "matchStats",
        "formats": ["1080x1350", "1080x1920"],
        "data": {}
      }
    }
  ],
  "warnings": []
}
```

Nota: hoy devuelve contenido final publicable y payload listo para el motor `ExportImage`.
No devuelve un PNG binario renderizado desde servidor.

## Errores esperados

### Partido inexistente

`404 match_not_found`

```json
{
  "ok": false,
  "error": "No se encontro un partido que coincida con los filtros enviados.",
  "code": "match_not_found"
}
```

### Ambiguedad

`409 match_ambiguous`

```json
{
  "ok": false,
  "error": "Hay mas de un partido posible para esos equipos. Envia match_id o agrega fecha, torneo o jornada.",
  "code": "match_ambiguous",
  "details": {
    "matches": []
  }
}
```

### Equipos invertidos

`409 teams_reversed`

```json
{
  "ok": false,
  "error": "No hay un partido con ese local y visitante, pero si existe uno con los equipos invertidos.",
  "code": "teams_reversed"
}
```

## Uso sugerido en n8n

1. `POST /api/results/tournaments/search` si necesitas ubicar el torneo.
2. `POST /api/results/matches/by-date` para ver la agenda de una fecha.
3. `POST /api/results/search` para resolver el `match_id` si tienes equipos concretos.
4. Revisar `count`.
5. Si `count === 1`, usar ese `match_id`.
6. `POST /api/results/update` con el resultado definitivo.
7. `POST /api/results/pieces` para obtener captions, WhatsApp text y render payloads listos.
8. Usar `summary.short` como confirmacion para WhatsApp.

## Cargar formaciones

`POST /api/results/lineups`, con permiso `lineups:write`.

Va aparte de `PATCH /api/matches/[id]` a proposito: aquel pide sesion y ademas
escribe eventos, reloj y campos del partido. Una integracion que solo tiene que
poner los quince no necesita nada de eso.

```json
{
  "match_id": "<uuid del partido>",
  "home": {
    "titulares": [
      { "numero": 1, "nombre": "Perez" },
      { "numero": 10, "nombre": "Gomez", "capitan": true }
    ],
    "suplentes": [{ "numero": 16, "nombre": "Lopez" }]
  },
  "away": [
    { "number": 1, "name": "Diaz", "role": "starter" },
    { "number": 16, "name": "Ruiz", "role": "substitute" }
  ]
}
```

- Las claves van en castellano o en ingles (`numero`/`number`, `nombre`/`name`,
  `capitan`/`isCaptain`, `titulares`/`starters`, `suplentes`/`substitutes`).
- Un lado se puede mandar como lista plana con `role` en cada jugador, o
  partido en titulares y suplentes.
- El `puesto` se deduce del numero de camiseta si no viene (convencion de XV).
- **El lado que no mandas no se toca.** Mandar solo `home` deja la formacion
  visitante como estaba.

Rechaza con **400** y la lista de problemas en `details.issues` si hay dos
capitanes del mismo lado, un numero repetido, un jugador sin nombre o un `id`
que no es uuid. Si el partido no existe, **404** con `code: "match_not_found"`.
