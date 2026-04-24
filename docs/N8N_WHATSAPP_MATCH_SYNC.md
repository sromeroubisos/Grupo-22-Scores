# N8N WhatsApp Match Sync

## Resumen

Se agrego un webhook seguro para que n8n pueda actualizar resultados en la web sin depender de la sesion del panel:

- Endpoint: `POST /api/integrations/whatsapp/matches`
- Auth: `Authorization: Bearer <WHATSAPP_MATCH_WEBHOOK_SECRET>`
- Metodo de resolucion:
  - si envias `matchId`, actualiza ese partido directo
  - si envias `homeTeam` y `awayTeam`, intenta resolver nombres flexibles usando nombre, short name, slug y aliases
- Resultado:
  - actualiza `status`
  - actualiza `score`
  - puede aplicar bonus manual
  - devuelve confirmacion con el partido actualizado

## Variables de entorno

Agrega una de estas variables en el entorno del proyecto:

- `WHATSAPP_MATCH_WEBHOOK_SECRET`
- `N8N_MATCH_WEBHOOK_SECRET`

## Payload minimo

```json
{
  "homeTeam": "Real Madrid",
  "awayTeam": "Barcelona",
  "homeScore": 2,
  "awayScore": 1,
  "bonusPoint": true,
  "source": "n8n-whatsapp",
  "message": "Partido: Real Madrid vs Barcelona, Resultado: 2-1, Punto Bonus: Si"
}
```

## Campos soportados

- `matchId`: usa el id real del partido si ya lo conoces
- `homeTeam`: nombre del local
- `awayTeam`: nombre del visitante
- `homeScore`: goles o puntos del local
- `awayScore`: goles o puntos del visitante
- `bonusPoint`: `true` o `false`
- `bonusTarget`: `home`, `away`, `both`, `winner` o `none`
- `homeBonusPoints`: bonus manual exacto para local
- `awayBonusPoints`: bonus manual exacto para visitante
- `status`: por defecto se usa `final`
- `source`: texto libre para auditoria
- `message`: mensaje original de WhatsApp
- `rowId`: id de la fila de n8n Data Tables

## Regla del bonus

Si solo envias `bonusPoint: true`:

- con `bonusTarget`, se aplica exactamente a ese lado
- sin `bonusTarget`, se aplica al ganador
- si hay empate y no hay `bonusTarget`, se aplica `1` a ambos y la API devuelve un warning

Si quieres control total, envia `homeBonusPoints` y `awayBonusPoints`.

## Flujo n8n recomendado

1. WhatsApp Trigger
2. AI / LLM node para extraer JSON estructurado
3. Data Tables para guardar o actualizar la fila
4. HTTP Request al webhook de esta app
5. WhatsApp reply con la confirmacion

## Tabla en n8n

Texto listo para pasar a quien arme la tabla:

```md
**Que necesitas?**
1. Ir a n8n -> Data Tables
2. Crear una nueva tabla llamada "Partidos" o "Matches"
3. Agregar estas columnas:
   - id (numero, unico)
   - homeTeam (texto) - Equipo local
   - awayTeam (texto) - Equipo visitante
   - homeScore (numero) - Goles local
   - awayScore (numero) - Goles visitante
   - bonusPoint (verdadero/falso) - Punto bonus

**Como configurarlo:**
- En "Get Matches" y "Update Match", selecciona tu tabla
- Carga algunos partidos de prueba manualmente

**Envia un mensaje de WhatsApp asi:**
"Partido: Real Madrid vs Barcelona, Resultado: 2-1, Punto Bonus: Si"

**La IA automaticamente:**
1. Busca el partido en tu tabla
2. Actualiza el resultado (2-1)
3. Marca el punto bonus como verdadero
4. Envia los datos a tu web
5. Te responde confirmando la actualizacion

**Puedes escribir de forma natural:**
- "Madrid 3 - Barca 0, con bonus"
- "Resultado del partido River vs Boca: 1-1, sin punto bonus"
- La IA entiende variaciones en los nombres
```

## Prompt sugerido para la IA de n8n

```text
Extrae un JSON valido a partir del mensaje del usuario.

Campos obligatorios:
- homeTeam: string
- awayTeam: string
- homeScore: number
- awayScore: number
- bonusPoint: boolean

Campos opcionales:
- bonusTarget: "home" | "away" | "both" | "winner" | "none"

Reglas:
- Si el usuario dice "con bonus", bonusPoint=true.
- Si el usuario dice "sin bonus" o "sin punto bonus", bonusPoint=false.
- Si no queda claro a quien pertenece el bonus, usa bonusTarget="winner".
- Devuelve solo JSON.
```

## HTTP Request en n8n

- Method: `POST`
- URL: `https://tu-dominio.com/api/integrations/whatsapp/matches`
- Authentication: none
- Headers:
  - `Authorization: Bearer {{ $env.WHATSAPP_MATCH_WEBHOOK_SECRET }}`
  - `Content-Type: application/json`
- Body:

```json
{
  "rowId": "={{ $json.id }}",
  "homeTeam": "={{ $json.homeTeam }}",
  "awayTeam": "={{ $json.awayTeam }}",
  "homeScore": "={{ $json.homeScore }}",
  "awayScore": "={{ $json.awayScore }}",
  "bonusPoint": "={{ $json.bonusPoint }}",
  "source": "n8n-whatsapp"
}
```

## Respuesta esperada

```json
{
  "ok": true,
  "message": "Partido actualizado: Real Madrid 2 - 1 Barcelona",
  "match": {
    "id": "uuid-del-partido",
    "status": "final",
    "score": {
      "home": 2,
      "away": 1
    }
  }
}
```
