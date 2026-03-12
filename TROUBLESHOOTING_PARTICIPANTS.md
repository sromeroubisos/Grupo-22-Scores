# 🔧 Troubleshooting: Error al Crear Participante en el Torneo

## ✅ Soluciones Implementadas

### 1. **Mejoras en el Registro de Errores**
Se agregaron logs detallados en toda la cadena de creación de participantes:

- **API Route** ([route.ts:186](src/app/api/tournaments/[id]/participants/route.ts#L186)): Logs antes de insertar
- **API Route** ([route.ts:214-220](src/app/api/tournaments/[id]/participants/route.ts#L214-L220)): Logs de errores con código y detalles
- **TournamentParticipantsTab** ([TournamentParticipantsTab.tsx:213](src/components/admin/entities/tournament/TournamentParticipantsTab.tsx#L213)): Logs de la operación
- **UpsertParticipantDrawer** ([UpsertParticipantDrawer.tsx:176](src/components/admin/entities/tournament/UpsertParticipantDrawer.tsx#L176)): Logs del formulario

### 2. **Mensajes de Error Amigables**
Se tradujeron los códigos de error de PostgreSQL a mensajes en español:

| Código PostgreSQL | Mensaje Usuario |
|------------------|-----------------|
| `23505` | "Este participante ya está registrado en el torneo" |
| `23503` | "El club seleccionado no existe en la base de datos" |
| `23502` | "Faltan campos obligatorios. Por favor verifica el formulario" |

### 3. **Validación Mejorada**
Se agregó validación en el endpoint API:
- Verifica que se proporcione `name` O `club_id`
- Retorna error 400 (Bad Request) con mensaje claro

### 4. **Propagación de Errores**
Los errores ahora se propagan correctamente desde la API hasta el drawer para mostrarlos al usuario.

---

## 🩺 Diagnóstico Paso a Paso

### Paso 1: Verificar la Consola del Navegador

1. Abre las **DevTools** (F12)
2. Ve a la pestaña **Console**
3. Intenta crear un participante
4. Busca estos logs:

```
[UpsertParticipantDrawer] Submitting data: {...}
[TournamentParticipantsTab] Creating participant: {...}
[Participants API] Inserting participant: {...}
```

**Si ves un error aquí**, anota el mensaje completo.

### Paso 2: Verificar la Pestaña Network

1. En DevTools, ve a **Network**
2. Filtra por `Fetch/XHR`
3. Intenta crear un participante
4. Busca la petición `POST /api/tournaments/[id]/participants`
5. Haz clic en ella y revisa:
   - **Payload**: ¿Los datos enviados son correctos?
   - **Response**: ¿Qué error devuelve el servidor?

### Paso 3: Verificar el Schema de la Base de Datos

Ejecuta este query en Supabase SQL Editor:

```sql
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tournament_participants'
ORDER BY ordinal_position;
```

**Columnas requeridas**:
- `club_id`: `TEXT`, `YES` (nullable)
- `name`: `TEXT`, `YES` (nullable)
- `type`: `TEXT`, `YES` (nullable)
- `status`: `TEXT`, `YES` (nullable)
- `short_code`: `TEXT`, `YES` (nullable)
- `notes`: `TEXT`, `YES` (nullable)

**Si faltan columnas**, ejecuta el archivo `MANUAL_FIX_PARTICIPANTS.sql`.

---

## 🛠️ Soluciones Comunes

### 🔴 Error: "Could not find the table 'public.tournament_participants' in the schema cache"

**Este es el error más común** y significa que la tabla no existe o el cache de PostgREST está desactualizado.

#### ⚡ Solución Rápida (30 segundos)

1. **Lee la guía rápida**: [QUICK_FIX_GUIDE.md](QUICK_FIX_GUIDE.md)
2. **Ejecuta el script**: [FIX_TOURNAMENT_PARTICIPANTS.sql](FIX_TOURNAMENT_PARTICIPANTS.sql) en Supabase SQL Editor
3. **Espera 5 segundos** para que el cache se actualice
4. **Intenta de nuevo** crear un participante

#### 📋 Pasos Detallados

**Paso 1: Abrir Supabase SQL Editor**
- Ve a https://supabase.com/dashboard
- Selecciona tu proyecto
- Click en **SQL Editor** (barra lateral izquierda)

**Paso 2: Ejecutar el Script de Reparación**
- Copia todo el contenido de `FIX_TOURNAMENT_PARTICIPANTS.sql`
- Pégalo en el editor SQL
- Click en **Run** o presiona `Ctrl/Cmd + Enter`

**Paso 3: Verificar Éxito**
Al final deberías ver:
```
✅ Tournament participants table has been successfully created/updated!
✅ PostgREST schema cache has been reloaded!
```

**Paso 4: Probar en la Aplicación**
- Regresa a tu app
- Intenta crear un participante
- ¡Debería funcionar ahora!

#### 🔧 Si aún no funciona

**Opción A: Recargar el cache manualmente**
```sql
NOTIFY pgrst, 'reload schema';
```
Espera 10 segundos y vuelve a intentar.

**Opción B: Verificar que la tabla existe**
```sql
SELECT * FROM tournament_participants LIMIT 1;
```
- **Error "relation does not exist"** → La tabla no existe, re-ejecuta `FIX_TOURNAMENT_PARTICIPANTS.sql`
- **Success (aunque sea vacío)** → La tabla existe, solo espera 30 segundos más para que el cache se actualice

**Opción C: Verificar permisos RLS**
```sql
SELECT policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'tournament_participants';
```
Deberías ver políticas para `authenticated` users.

---

### Error: "Este participante ya está registrado"

**Causa**: El club ya existe en el torneo, o hay un nombre duplicado.

**Solución**:
1. Verifica que el club no esté ya agregado
2. Si es un participante manual, usa un nombre diferente
3. Si necesitas actualizar, usa el botón de editar (lápiz) en lugar de crear uno nuevo

### Error: "Faltan campos obligatorios"

**Causa**: La tabla no tiene las columnas necesarias.

**Solución**:
1. Abre Supabase SQL Editor
2. Ejecuta el contenido de `MANUAL_FIX_PARTICIPANTS.sql`
3. Verifica que las columnas se crearon correctamente

### Error: "El club seleccionado no existe"

**Causa**: El `club_id` no corresponde a un club válido en la tabla `clubs`.

**Solución**:
1. Verifica que el club exista en la base de datos
2. Si usas "Base de Datos", asegúrate de seleccionar un club válido
3. Si el club no existe, créalo primero en la sección de Clubs

### Error: "Se requiere un nombre o un club vinculado"

**Causa**: No se proporcionó ni `name` ni `club_id`.

**Solución**:
1. **Modo Base de Datos**: Selecciona un club del dropdown
2. **Modo Manual**: Escribe un nombre en el campo "Nombre del Participante"

---

## 📊 Verificar Datos Existentes

### Ver todos los participantes de un torneo:

```sql
SELECT
    tp.*,
    c.name as club_name
FROM tournament_participants tp
LEFT JOIN clubs c ON tp.club_id = c.id
WHERE tournament_id = 'TU_TORNEO_ID'
ORDER BY created_at DESC;
```

### Ver duplicados:

```sql
SELECT
    name,
    club_id,
    COUNT(*) as count
FROM tournament_participants
WHERE tournament_id = 'TU_TORNEO_ID'
GROUP BY name, club_id
HAVING COUNT(*) > 1;
```

### Eliminar duplicados (¡CUIDADO!):

```sql
-- Primero, verificar qué se va a eliminar
SELECT * FROM tournament_participants
WHERE id NOT IN (
    SELECT MIN(id)
    FROM tournament_participants
    WHERE tournament_id = 'TU_TORNEO_ID'
    GROUP BY club_id, name
);

-- Si todo se ve bien, ejecutar:
DELETE FROM tournament_participants
WHERE id NOT IN (
    SELECT MIN(id)
    FROM tournament_participants
    WHERE tournament_id = 'TU_TORNEO_ID'
    GROUP BY club_id, name
);
```

---

## 🔍 Logs del Sistema

### Ver logs del servidor (si tienes acceso):

```bash
# En desarrollo local
npm run dev

# En producción (Vercel)
vercel logs
```

### Buscar patrones específicos:

```bash
# Filtrar solo errores de participantes
grep -i "participants api" logs.txt

# Ver errores de base de datos
grep -i "error" logs.txt | grep -i "participant"
```

---

## 📝 Testing Manual

### Crear Participante desde Base de Datos

1. Ve a la pestaña **Participantes** de un torneo
2. Click en **"Nuevo Participante"**
3. Deja seleccionado **"Base de Datos"**
4. Busca y selecciona un club
5. (Opcional) Ajusta seed, estado, código corto
6. Click en **"Guardar"**
7. **Resultado esperado**: Participante creado exitosamente

### Crear Participante Manual

1. Ve a la pestaña **Participantes** de un torneo
2. Click en **"Nuevo Participante"**
3. Selecciona **"Entrada Manual"**
4. Escribe un nombre único
5. Selecciona tipo (Club, Selección, Individual)
6. Click en **"Guardar"**
7. **Resultado esperado**: Participante creado exitosamente

---

## 🚨 Si Nada Funciona

### Reset completo de la tabla (⚠️ DESTRUCTIVO):

```sql
-- 1. Backup primero
CREATE TABLE tournament_participants_backup AS
SELECT * FROM tournament_participants;

-- 2. Drop la tabla
DROP TABLE IF EXISTS tournament_participants CASCADE;

-- 3. Re-ejecutar las migraciones
-- Ir a: supabase/migrations/20260224100000_tournament_management_tables.sql
-- Copiar y ejecutar la sección de tournament_participants

-- 4. Ejecutar la migración de mejoras
-- Ir a: supabase/migrations/20260306000000_enhance_tournament_participants.sql
-- Copiar y ejecutar todo el contenido

-- 5. Restaurar datos
INSERT INTO tournament_participants
SELECT * FROM tournament_participants_backup;
```

---

## 📞 Contacto y Soporte

Si después de seguir todos estos pasos el error persiste:

1. **Captura de pantalla** de la consola del navegador
2. **Copia** el payload de la petición POST
3. **Copia** la respuesta del servidor
4. **Ejecuta** y comparte el resultado de:
   ```sql
   SELECT * FROM tournament_participants
   WHERE tournament_id = 'TU_TORNEO_ID'
   LIMIT 5;
   ```

---

## ✨ Archivos Relacionados

- [route.ts](src/app/api/tournaments/[id]/participants/route.ts) - API endpoint
- [TournamentParticipantsTab.tsx](src/components/admin/entities/tournament/TournamentParticipantsTab.tsx) - UI principal
- [UpsertParticipantDrawer.tsx](src/components/admin/entities/tournament/UpsertParticipantDrawer.tsx) - Formulario unificado
- [MANUAL_FIX_PARTICIPANTS.sql](MANUAL_FIX_PARTICIPANTS.sql) - Script de reparación
- Migration: [20260306000000_enhance_tournament_participants.sql](supabase/migrations/20260306000000_enhance_tournament_participants.sql)
