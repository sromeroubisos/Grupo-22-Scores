# Arquitectura de Matches - G22 Scores

## Separación de Responsabilidades

### 1. Fases (admin/torneo/[id]/fases/[faseId])
**Responsabilidad:** Generación de estructura

- Generación automática (round-robin, playoffs, grupos)
- Configuración de reglas y puntuación
- Definición de jornadas, llaves, grupos

**Botones:**
- Generar / Regenerar fixture
- Guardar Borrador
- Publicar Fase

**Output:**
- Crea/actualiza documentos `Match` con `createdFrom: "generator"`
- Establece `lockedByPhase: true` si no se permite editar equipos

---

### 2. Fixture (admin/torneo/[id]/fixture)
**Responsabilidad:** Gestión operativa de partidos

Gestiona partidos YA CREADOS por las fases:
- Editar fecha/hora/cancha
- Asignar árbitros
- Modificar equipos (si `lockedByPhase === false`)
- Cambiar estados: scheduled → live → final → postponed
- Cargar resultado (puntos, tries, bonus)

**Botones:**
- Exportar CSV
- Importar CSV
- Edición Masiva
- Crear partido manual (opcional, con `createdFrom: "manual"`)

**Filtros disponibles:**
- Por fase
- Por grupo
- Por estado
- Por equipo
- Por rango de fechas

---

### 3. Resultados (admin/torneo/[id]/resultados)
**Responsabilidad:** Vista derivada (NO almacena datos)

Es una VISTA de los mismos matches filtrada por:
```
status === 'final' OR result.isComplete === true
```

**Características:**
- NO duplica datos - lee de la misma colección `matches`
- Permite editar resultados (modifica el mismo documento)
- Si cambias `status` a "scheduled", automáticamente sale de Resultados

---

## Modelo de Datos (Firestore)

```typescript
// matches/{matchId}
{
  // Identificadores
  id: string,
  tournamentId: string,
  phaseId: string,
  stageId?: string,        // opcional para sub-etapas
  groupId?: string,        // para grupos
  
  // Estructura
  round: number,           // jornada / fecha
  orderInRound?: number,
  
  // Equipos
  homeTeamId: string,
  homeTeamName: string,    // denormalizado para display
  awayTeamId: string,
  awayTeamName: string,
  
  // Programación
  scheduledAt: Timestamp | null,
  venueId?: string,
  venueName?: string,
  field?: string,
  referee?: { name?: string, id?: string },
  
  // Estado
  status: "scheduled" | "live" | "final" | "postponed" | "cancelled",
  
  // Marcador
  score: {
    home: number | null,
    away: number | null,
    homeTries?: number,
    awayTries?: number,
    homeBonus?: number,
    awayBonus?: number,
    notes?: string
  },
  
  // Resultado (metadatos)
  result: {
    isComplete: boolean,     // true cuando status=final y score set
    updatedAt: Timestamp,
    updatedBy: string,
    version: number          // para auditoría/rollback
  },
  
  // Control
  createdFrom: "generator" | "manual",
  lockedByPhase?: boolean,   // bloquea edición de equipos
  
  // Timestamps
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## Índices Firestore Recomendados

1. `tournamentId + scheduledAt` (ordenar por fecha)
2. `tournamentId + status` (filtrar por estado)
3. `tournamentId + phaseId + round` (agrupar por jornada)
4. `tournamentId + result.isComplete` (vista de resultados)

---

## Flujo de Estados

```
┌────────────┐
│ scheduled  │ ← Partido creado (sin jugar)
└──────┬─────┘
       │ Iniciar partido
       ▼
┌────────────┐
│    live    │ ← En juego (actualizar score en tiempo real)
└──────┬─────┘
       │ Finalizar
       ▼
┌────────────┐
│   final    │ ← Completado (visible en Resultados)
└────────────┘

Estados alternativos:
- postponed: Partido postergado (reprogramar)
- cancelled: Partido cancelado (no se juega)
```

---

## Integración con Standings/Posiciones

Cuando un match pasa a `status: "final"`:

1. Trigger (Cloud Function o Server Action)
2. Llama a `recomputeStandings(phaseId, groupId)`
3. Actualiza `standings/{phaseId}_{groupId}` o subcolección

**Importante:** Los standings siempre se DERIVAN de matches finalizados.

---

## Regla de Oro

| Componente | Responsabilidad |
|------------|-----------------|
| **Fase** | Genera estructura → crea matches (`createdFrom="generator"`) |
| **Fixture** | Administra matches → edita lo operativo |
| **Resultados** | Vista de matches finalizados → NO almacena aparte |

---

## Archivos Relevantes

- `/src/types/match.ts` - Modelo de datos TypeScript
- `/src/app/admin/(tournament)/torneo/[id]/fixture/page.tsx` - Gestión de partidos
- `/src/app/admin/(tournament)/torneo/[id]/resultados/page.tsx` - Vista de resultados
- `/src/app/admin/(tournament)/torneo/[id]/fases/page.tsx` - Generación de fixture
