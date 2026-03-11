# 🚀 Activación del Nuevo Tab de Participantes

## Paso 1: Aplicar Migración de Base de Datos

```bash
cd "c:\Users\srome\OneDrive\Escritorio\Grupo-22-Scores"
supabase db push
```

**Espera el mensaje**: `Finished supabase db push.`

---

## Paso 2: Actualizar TournamentParticipantsTab.tsx

Abre el archivo:
```
src/components/admin/entities/tournament/TournamentParticipantsTab.v2.tsx
```

Y realiza estos cambios:

### A. Agregar imports al inicio del archivo (línea 26, después de `import './tournament-participants-flash.css';`):

```typescript
import { useAdminConsole } from '../../../../app/admin/AdminContext';
import { UpsertParticipantDrawer } from './UpsertParticipantDrawer';
import { ImportParticipantsDrawerV2 } from './ImportParticipantsDrawerV2';
import { ParticipantsHistoryDrawer } from './ParticipantsHistoryDrawer';
```

### B. Dentro de la función `TournamentParticipantsTabV2`, después de la línea `export function TournamentParticipantsTabV2({ data, id: tournamentId }: Props) {`, agregar:

```typescript
const { clubs } = useAdminConsole();
```

### C. Al final del componente, buscar esta línea:

```typescript
{/* DRAWERS - PLACEHOLDERS (implement full versions separately) */}
```

Y reemplazar TODO el bloque de placeholders con:

```tsx
{/* DRAWERS - FULLY FUNCTIONAL */}
<UpsertParticipantDrawer
    isOpen={isAddDrawerOpen || !!editingParticipant}
    onClose={() => {
        setIsAddDrawerOpen(false);
        setEditingParticipant(null);
    }}
    onSave={editingParticipant ? (data) => handleUpdate(editingParticipant.id, data) : handleCreate}
    participant={editingParticipant}
    clubs={clubs}
    groups={groups}
    existingParticipants={participants}
/>

<ImportParticipantsDrawerV2
    isOpen={isImportDrawerOpen}
    onClose={() => setIsImportDrawerOpen(false)}
    onImport={handleImport}
    existingParticipants={participants}
/>

<ParticipantsHistoryDrawer
    isOpen={isHistoryDrawerOpen}
    onClose={() => setIsHistoryDrawerOpen(false)}
    tournamentId={tournamentId || ''}
/>
```

---

## Paso 3: Renombrar Archivos

```bash
# Backup del archivo anterior
mv src/components/admin/entities/tournament/TournamentParticipantsTab.tsx src/components/admin/entities/tournament/TournamentParticipantsTab.old.tsx

# Activar la nueva versión
mv src/components/admin/entities/tournament/TournamentParticipantsTab.v2.tsx src/components/admin/entities/tournament/TournamentParticipantsTab.tsx
```

---

## Paso 4: Verificar Build

```bash
npm run build
```

Si hay errores de TypeScript, verifica:
1. Que todos los imports estén correctos
2. Que `useAdminConsole` esté disponible
3. Que los tipos coincidan

---

## Paso 5: Probar en Desarrollo

```bash
npm run dev
```

Visita: `http://localhost:3000/admin/[tu-torneo]/participantes`

### Checklist de Pruebas:

- [ ] Counters se muestran correctamente
- [ ] Botón "Nuevo Participante" abre drawer
- [ ] Búsqueda de clubs funciona
- [ ] Crear participante manual funciona
- [ ] Crear participante desde DB funciona
- [ ] Editar participante (click en botón lápiz)
- [ ] Eliminar participante (con confirmación)
- [ ] Importar lista de participantes
- [ ] Exportar a CSV
- [ ] Historial muestra empty state honesto
- [ ] Filtros (búsqueda, tipo, estado) funcionan
- [ ] Ordenamiento funciona
- [ ] Responsive en móvil

---

## 🐛 Troubleshooting

### Error: "Cannot find module 'useAdminConsole'"

**Solución**: Verifica que el path sea correcto:
```typescript
import { useAdminConsole } from '../../../../app/admin/AdminContext';
```

Si el archivo está en otra ubicación, ajusta los `../` según corresponda.

---

### Error: "clubs is undefined"

**Solución**: Asegúrate de que el componente esté dentro del `<AdminConsoleProvider>`. Verifica en la ruta del admin.

---

### Error de TypeScript: "Type mismatch"

**Solución**: Revisa que los tipos de `Participant` en todos los archivos sean idénticos. Especialmente el campo `type: ParticipantType`.

---

### Los drawers no se abren

**Solución**:
1. Abre la consola del navegador (F12)
2. Busca errores en rojo
3. Verifica que los imports de los drawers estén correctos
4. Asegúrate de que los archivos existan en las rutas especificadas

---

## ✅ Listo!

Una vez completados todos los pasos, el tab de participantes estará completamente funcional con:

- ✅ Diseño premium Flash UI
- ✅ CRUD completo
- ✅ Importación/Exportación
- ✅ Historial (con empty state honesto)
- ✅ Validaciones
- ✅ Feedback visual

**¡Disfruta tu nuevo tab de participantes premium!** 🎉
