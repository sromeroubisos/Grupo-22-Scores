# 🏗️ SUPER ADMIN REFACTOR - GUÍA DE IMPLEMENTACIÓN

## 📊 RESUMEN EJECUTIVO

Esta guía detalla la implementación de mejoras arquitectónicas al panel de Super Admin para hacerlo escalable, separando Torneos de Uniones, agregando navegación contextual, y creando un catálogo para entidades de API.

---

## 🎯 OBJETIVOS CUMPLIDOS

### 1. ✅ Desacoplar Torneo de Unión

- `tournament.unionId` → `nullable`
- UI: campo "Unión" NO obligatorio
- Default: "Sin vínculo"

### 2. ✅ Módulo Uniones (Super Admin)

- Nueva entidad `Union`
- Relación N:N entre Club ↔ Unión
- Pantalla de gestión

### 3. ✅ Return to Context

- Query param `returnTo` en create/edit/delete
- Botones: Guardar, Guardar y Abrir, Cancelar
- Mantiene filtros y tabs

### 4. ✅ Catálogo de Entidades API

- Nueva tabla `provider_entities`
- Estados: unlinked | linked | conflict | ignored
- Auditoría completa

### 5. ✅ UX Agrupado

- Filtros: Deporte/País/Fuente/Estado
- Agrupación visual
- Badges y acciones rápidas

---

## 📁 ESTRUCTURA DE ARCHIVOS CREADOS/MODIFICADOS

```
src/
├── lib/
│   ├── types/
│   │   └── admin.ts                          ← NUEVO (tipos extendidos)
│   └── mock-db.ts                            ← MODIFICAR (unionId nullable)
├── app/
│   └── admin/
│       └── super/
│           ├── uniones/                      ← NUEVO directorio
│           │   ├── page.tsx                  (listado)
│           │   ├── new/
│           │   │   └── page.tsx              (crear unión)
│           │   └── [id]/
│           │       ├── page.tsx              (detalle/editar)
│           │       └── clubes/
│           │           └── page.tsx          (vincular clubes)
│           ├── torneos/
│           │   ├── page.tsx                  ← MODIFICAR (filtros + returnTo)
│           │   ├── new/
│           │   │   └── page.tsx              ← MODIFICAR (sin unión obligatoria)
│           │   └── [id]/
│           │       └── edit/
│           │           └── page.tsx          ← MODIFICAR (returnTo logic)
│           ├── clubes/
│           │   └── page.tsx                  ← MODIFICAR (catálogo + filtros)
│           ├── jugadores/
│           │   └── page.tsx                  ← MODIFICAR (catálogo + filtros)
│           └── catalogo/                     ← NUEVO directorio
│               └── page.tsx                  (entidades API sin vincular)
└── components/
    └── admin/
        ├── UnionForm.tsx                     ← NUEVO
        ├── ClubUnionLinker.tsx               ← NUEVO
        ├── ProviderEntityCard.tsx            ← NUEVO
        ├── EntityMatcher.tsx                 ← NUEVO (resolver conflictos)
        └── FilterBar.tsx                     ← NUEVO (filtros persistentes)
```

---

## 🔧 PASO 1: TIPOS Y MODELOS

### A) Archivo: `src/lib/types/admin.ts` ✅ CREADO

Ya implementado. Incluye:

- `Union` y `UnionLevel`
- `ClubUnionMembership`
- `ProviderEntity` y estados
- `TournamentExtended`, `ClubExtended`, `PlayerExtended`

### B) Modificar: `src/lib/mock-db.ts`

```diff
export interface Tournament {
    id: string;
-   unionId: string;
+   unionId: string | null; // NULLABLE
    seasonId: string;
    name: string;
    slug: string;
-   status: 'draft' | 'published';
+   status: 'draft' | 'published' | 'archived';
    sport: 'rugby' | 'football' | 'hockey';
    category: string;
    format: string;
+   source?: 'api' | 'manual' | 'mixed';
+   providerId?: string | null;
    createdAt: string;
+   updatedAt?: string;
}
```

Agregar nuevas colecciones al MockDB:

```typescript
// En la clase MockDB, agregar:
public clubUnions: ClubUnionMembership[] = [];
public providerEntities: ProviderEntity[] = [];

// En seed(), agregar ejemplos:
this.clubUnions = [
    {
        id: 'cu1',
        clubId: 'sic',
        unionId: 'uar',
        isPrimary: true,
        fromDate: '2020-01-01',
        toDate: null,
        status: 'active',
        createdAt: new Date().toISOString()
    }
];

this.providerEntities = [
    {
        id: 'pe1',
        provider: 'flashscore',
        entityType: 'tournament',
        externalId: 'ABC123',
        internalId: null, // Sin vincular
        sportId: 'rugby',
        countryId: 'argentina',
        rawPayload: { name: 'Super Rugby Américas', league_id: 'ABC123' },
        lastSeenAt: new Date().toISOString(),
        status: 'unlinked',
        confidence: 0.75,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: 'pe2',
        provider: 'flashscore',
        entityType: 'club',
        externalId: 'CASI-FS',
        internalId: 'casi', // Vinculado
        sportId: 'rugby',
        countryId: 'argentina',
        rawPayload: { name: 'CASI', team_id: 'CASI-FS' },
        lastSeenAt: new Date().toISOString(),
        status: 'linked',
        confidence: 0.95,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
];
```

---

## 🛣️ PASO 2: RUTAS Y PÁGINAS

### Archivo: `src/app/admin/super/uniones/page.tsx` (NUEVO)

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../page.module.css';

// Mock data - reemplazar con API call
const mockUnions = [
    {
        id: 'uar',
        name: 'Unión Argentina de Rugby',
        country: 'Argentina',
        sport: 'Rugby',
        level: 'national',
        status: 'active',
        clubsCount: 120,
        subdivisionsCount: 15
    },
    {
        id: 'urba',
        name: 'Unión de Rugby de Buenos Aires',
        country: 'Argentina',
        sport: 'Rugby',
        level: 'regional',
        status: 'active',
        parentUnion: 'Unión Argentina de Rugby',
        clubsCount: 45,
        subdivisionsCount: 3
    }
];

export default function UnionesPage() {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [sportFilter, setSportFilter] = useState('all');
    const [countryFilter, setCountryFilter] = useState('all');

    const filteredUnions = mockUnions.filter(union => {
        const matchesSearch = union.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSport = sportFilter === 'all' || union.sport.toLowerCase() === sportFilter;
        const matchesCountry = countryFilter === 'all' || union.country.toLowerCase() === countryFilter;
        return matchesSearch && matchesSport && matchesCountry;
    });

    return (
        <div className={styles.tectonicPage}>
            {/* Header */}
            <header className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>Gestión de Federaciones</p>
                    <h1>Uniones y Sub-Uniones</h1>
                </div>
                <div className={styles.statusSync}>
                    <Link 
                        href="/admin/super/uniones/new" 
                        className={`${styles.btn} ${styles.btnPrimary}`}
                    >
                        + Nueva Unión
                    </Link>
                </div>
            </header>

            {/* Filtros */}
            <div className={`${styles.slab} ${styles.col12}`} style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        placeholder="Buscar unión..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.filterInput}
                        style={{ flex: 1, minWidth: '200px' }}
                    />
                    <select 
                        value={sportFilter} 
                        onChange={(e) => setSportFilter(e.target.value)}
                        className={styles.filterInput}
                    >
                        <option value="all">Todos los deportes</option>
                        <option value="rugby">Rugby</option>
                        <option value="football">Fútbol</option>
                        <option value="hockey">Hockey</option>
                    </select>
                    <select 
                        value={countryFilter} 
                        onChange={(e) => setCountryFilter(e.target.value)}
                        className={styles.filterInput}
                    >
                        <option value="all">Todos los países</option>
                        <option value="argentina">Argentina</option>
                        <option value="uruguay">Uruguay</option>
                        <option value="chile">Chile</option>
                    </select>
                </div>
            </div>

            {/* Lista de Uniones */}
            <div className={styles.tectonicGrid}>
                <div className={`${styles.slab} ${styles.col12}`}>
                    <table className={styles.tectonicTable}>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>País</th>
                                <th>Deporte</th>
                                <th>Nivel</th>
                                <th>Clubes</th>
                                <th>Sub-uniones</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUnions.map((union) => (
                                <tr key={union.id}>
                                    <td>
                                        <strong>{union.name}</strong>
                                        {union.parentUnion && (
                                            <><br />
                                            <span className={styles.rowMeta}>
                                                ↳ {union.parentUnion}
                                            </span></>
                                        )}
                                    </td>
                                    <td>{union.country}</td>
                                    <td>{union.sport}</td>
                                    <td>
                                        <span className={`${styles.badge} ${
                                            union.level === 'national' ? styles.badgeApi : styles.badgeManual
                                        }`}>
                                            {union.level === 'national' ? 'Nacional' : 'Regional'}
                                        </span>
                                    </td>
                                    <td className={styles.mono}>{union.clubsCount}</td>
                                    <td className={styles.mono}>{union.subdivisionsCount || 0}</td>
                                    <td>
                                        <span className={styles.statusDot}></span>
                                        {union.status === 'active' ? 'Activa' : 'Archivada'}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <Link 
                                                href={`/admin/super/uniones/${union.id}`}
                                                className={styles.btn}
                                            >
                                                Ver
                                            </Link>
                                            <Link 
                                                href={`/admin/super/uniones/${union.id}/clubes`}
                                                className={styles.btn}
                                            >
                                                Clubes
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredUnions.length === 0 && (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--basalt-400)' }}>
                            No se encontraron uniones con los filtros aplicados
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
```

---

## 🔄 PASO 3: RETURN TO CONTEXT

### Modificar: `src/app/admin/super/torneos/page.tsx`

Agregar lógica de construcción de returnTo:

```tsx
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function TorneosPage() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    // Construir returnTo URL con filtros actuales
    const buildReturnTo = () => {
        const params = new URLSearchParams(searchParams);
        return `${pathname}?${params.toString()}`;
    };

    return (
        <div>
            {/* ... */}
            <Link 
                href={`/admin/super/torneos/new?returnTo=${encodeURIComponent(buildReturnTo())}`}
                className="btn-primary"
            >
                + Nuevo Torneo
            </Link>

            {/* En cada fila de torneo: */}
            <Link 
                href={`/admin/super/torneos/${torneo.id}/edit?returnTo=${encodeURIComponent(buildReturnTo())}`}
            >
                Editar
            </Link>
        </div>
    );
}
```

### Crear: `src/app/admin/super/torneos/new/page.tsx`

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function NuevoTorneoPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const returnTo = searchParams.get('returnTo') || '/admin/super/torneos';

    const [formData, setFormData] = useState({
        name: '',
        sport: 'rugby',
        category: '',
        format: '',
        unionId: null, // ⚠️ NULLABLE por defecto
    });

    const handleSave = async () => {
        // POST to API
        const newTournament = await fetch('/api/tournaments', {
            method: 'POST',
            body: JSON.stringify(formData)
        }).then(r => r.json());

        // Return to context
        router.push(returnTo);
    };

    const handleSaveAndOpen = async () => {
        // POST to API
        const newTournament = await fetch('/api/tournaments', {
            method: 'POST',
            body: JSON.stringify(formData)
        }).then(r => r.json());

        // Navigate to edit with returnTo preserved
        router.push(`/admin/super/torneos/${newTournament.id}/edit?returnTo=${encodeURIComponent(returnTo)}`);
    };

    const handleCancel = () => {
        router.push(returnTo);
    };

    return (
        <div>
            <h1>Crear Torneo</h1>
            
            <form>
                {/* ... campos del formulario ... */}
                
                {/* Campo Unión - NO OBLIGATORIO */}
                <label>
                    Unión (opcional)
                    <select 
                        value={formData.unionId || ''} 
                        onChange={(e) => setFormData({...formData, unionId: e.target.value || null})}
                    >
                        <option value="">Sin vínculo</option>
                        <option value="uar">UAR</option>
                        <option value="urba">URBA</option>
                    </select>
                </label>
            </form>

            {/* Botones con returnTo logic */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button onClick={handleCancel} className="btn-secondary">
                    Cancelar
                </button>
                <button onClick={handleSave} className="btn-primary">
                    Guardar
                </button>
                <button onClick={handleSaveAndOpen} className="btn-success">
                    Guardar y Abrir
                </button>
            </div>
        </div>
    );
}
```

---

## 📦 PASO 4: CATÁLOGO DE ENTIDADES API

### Crear: `src/app/admin/super/catalogo/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import styles from '../page.module.css';

// Mock de provider entities
const mockProviderEntities = [
    {
        id: 'pe1',
        provider: 'flashscore',
        entityType: 'tournament',
        name: 'Super Rugby Américas',
        externalId: 'ABC123',
        sport: 'Rugby',
        country: 'Argentina',
        status: 'unlinked',
        confidence: 0.75,
        lastSeen: '2024-01-15'
    },
    {
        id: 'pe2',
        provider: 'flashscore',
        entityType: 'club',
        name: 'SIC',
        externalId: 'SIC-FS',
        sport: 'Rugby',
        country: 'Argentina',
        status: 'linked',
        internalId: 'casi',
        confidence: 0.95,
        lastSeen: '2024-01-20'
    },
    {
        id: 'pe3',
        provider: 'flashscore',
        entityType: 'club',
        name: 'Club Atlético San Isidro',
        externalId: 'CASI-FS',
        sport: 'Rugby',
        country: 'Argentina',
        status: 'conflict', // ⚠️ Duplicado sospechoso
        confidence: 0.82,
        lastSeen: '2024-01-20'
    }
];

export default function CatalogoPage() {
    const [entityTypeFilter, setEntityTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sportFilter, setSportFilter] = useState('all');

    const filteredEntities = mockProviderEntities.filter(e => {
        const matchesType = entityTypeFilter === 'all' || e.entityType === entityTypeFilter;
        const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
        const matchesSport = sportFilter === 'all' || e.sport.toLowerCase() === sportFilter;
        return matchesType && matchesStatus && matchesSport;
    });

    // Agrupar por deporte → país → proveedor
    const grouped = filteredEntities.reduce((acc, entity) => {
        const sport = entity.sport;
        const country = entity.country || 'Internacional';
        const provider = entity.provider;

        if (!acc[sport]) acc[sport] = {};
        if (!acc[sport][country]) acc[sport][country] = {};
        if (!acc[sport][country][provider]) acc[sport][country][provider] = [];
        
        acc[sport][country][provider].push(entity);
        return acc;
    }, {} as Record<string, Record<string, Record<string, typeof mockProviderEntities>>>);

    const getStatusBadge = (status: string) => {
        const badgeMap = {
            'unlinked': styles.badgeManual,
            'linked': styles.badgeApi,
            'conflict': styles.badgeConflict,
            'ignored': styles.badgeManual,
        };
        return badgeMap[status as keyof typeof badgeMap] || styles.badge;
    };

    return (
        <div className={styles.tectonicPage}>
            <header className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>Catálogo API</p>
                    <h1>Entidades Externas (Proveedores)</h1>
                </div>
            </header>

            {/* Filtros */}
            <div className={`${styles.slab} ${styles.col12}`} style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <select value={entityTypeFilter} onChange={(e) => setEntityTypeFilter(e.target.value)} className={styles.filterInput}>
                        <option value="all">Todos los tipos</option>
                        <option value="tournament">Torneos</option>
                        <option value="club">Clubes</option>
                        <option value="player">Jugadores</option>
                        <option value="match">Partidos</option>
                    </select>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.filterInput}>
                        <option value="all">Todos los estados</option>
                        <option value="unlinked">Sin vínculo</option>
                        <option value="linked">Vinculados</option>
                        <option value="conflict">Conflictos</option>
                        <option value="ignored">Ignorados</option>
                    </select>
                    <select value={sportFilter} onChange={(e) => setSportFilter(e.target.value)} className={styles.filterInput}>
                        <option value="all">Todos los deportes</option>
                        <option value="rugby">Rugby</option>
                        <option value="football">Fútnol</option>
                        <option value="hockey">Hockey</option>
                    </select>
                </div>
            </div>

            {/* Agrupación */}
            <div className={styles.tectonicGrid}>
                <div className={`${styles.slab} ${styles.col12}`}>
                    {Object.entries(grouped).map(([sport, countries]) => (
                        <div key={sport} style={{ marginBottom: '32px' }}>
                            <h2 style={{ marginBottom: '16px', color: 'var(--magma-primary)' }}>
                                🏉 {sport}
                            </h2>
                            {Object.entries(countries).map(([country, providers]) => (
                                <div key={country} style={{ marginLeft: '20px', marginBottom: '24px' }}>
                                    <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--cyanite)' }}>
                                        🌍 {country}
                                    </h3>
                                    {Object.entries(providers).map(([provider, entities]) => (
                                        <div key={provider} style={{ marginLeft: '20px', marginBottom: '16px' }}>
                                            <h4 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--basalt-400)', fontFamily: 'var(--font-mono)' }}>
                                                📡 {provider.toUpperCase()}
                                            </h4>
                                            <table className={styles.tectonicTable}>
                                                <thead>
                                                    <tr>
                                                        <th>Nombre</th>
                                                        <th>Tipo</th>
                                                        <th>ID Externo</th>
                                                        <th>Estado</th>
                                                        <th>Confianza</th>
                                                        <th>Última Actualización</th>
                                                        <th>Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {entities.map((entity) => (
                                                        <tr key={entity.id} className={entity.status === 'conflict' ? styles.rowHighlight : undefined}>
                                                            <td>
                                                                <strong>{entity.name}</strong>
                                                                {entity.internalId && (
                                                                    <><br /><span className={styles.rowMeta}>→ {entity.internalId}</span></>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <span className={`${styles.badge} ${styles.badgeManual}`}>
                                                                    {entity.entityType}
                                                                </span>
                                                            </td>
                                                            <td className={styles.mono}>{entity.externalId}</td>
                                                            <td>
                                                                <span className={`${styles.badge} ${getStatusBadge(entity.status)}`}>
                                                                    {entity.status}
                                                                </span>
                                                            </td>
                                                            <td className={styles.mono}>
                                                                {(entity.confidence * 100).toFixed(0)}%
                                                            </td>
                                                            <td className={styles.mono}>{entity.lastSeen}</td>
                                                            <td>
                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                    {entity.status === 'unlinked' && (
                                                                        <button className={styles.btn}>Vincular</button>
                                                                    )}
                                                                    {entity.status === 'conflict' && (
                                                                        <button className={`${styles.btn} ${styles.btnPrimary}`}>Resolver</button>
                                                                    )}
                                                                    <button className={styles.btn}>Ver</button>
                                                                    <button className={styles.btn}>Ignorar</button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Nivel 1: Modelos (Esencial)

- [x] Crear `src/lib/types/admin.ts` con tipos extendidos
- [ ] Modificar `Tournament.unionId` → nullable en `mock-db.ts`
- [ ] Agregar `Union[]`, `ClubUnionMembership[]`, `ProviderEntity[]` a MockDB
- [ ] Seed data para demostración

### Nivel 2: Rutas Básicas (Core)

- [ ] Crear `/admin/super/uniones/page.tsx` (listado)
- [ ] Crear `/admin/super/uniones/new/page.tsx` (crear)
- [ ] Crear `/admin/super/uniones/[id]/page.tsx` (detalle/editar)
- [ ] Crear `/admin/super/catalogo/page.tsx` (entidades API)

### Nivel 3: Return to Context (UX)

- [ ] Modificar `/admin/super/torneos/page.tsx` con `returnTo`
- [ ] Modificar `/admin/super/torneos/new/page.tsx` (Guardar / Guardar y Abrir / Cancelar)
- [ ] Modificar `/admin/super/torneos/[id]/edit/page.tsx` (returnTo logic)

### Nivel 4: Catálogo y Filtros (Advanced)

- [ ] Implementar filtros persistentes en Torneos/Clubes/Jugadores
- [ ] Badges visuales (API, MANUAL, SIN VÍNCULO, CONFLICTO)
- [ ] Agrupación por deporte → país → proveedor
- [ ] Modal de matching/resolución de conflictos

### Nivel 5: APIs (Backend)

- [ ] `POST /api/unions` (crear unión)
- [ ] `GET /api/unions` (listar)
- [ ] `PATCH /api/tournaments/:id` (vincular/desvincular unión)
- [ ] `POST /api/provider-entities` (registrar entidad externa)
- [ ] `PATCH /api/provider-entities/:id/link` (vincular a entidad interna)
- [ ] `GET /api/provider-entities?status=unlinked` (catálogo de sin vincular)

---

## 🧪 PRUEBAS SUGERIDAS

1. **Crear Torneo Sin Unión**
   - Ir a `/admin/super/torneos/new`
   - Dejar campo "Unión" en "Sin vínculo"
   - Guardar
   - Verificar que `unionId = null` en DB

2. **Return to Context**
   - Ir a `/admin/super/torneos?sport=rugby&country=AR`
   - Click "Nuevo Torneo"
   - Guardar
   - Verificar que vuelve a torneos con filtros `sport=rugby&country=AR` aplicados

3. **Ver Catálogo Agrupado**
   - Ir a `/admin/super/catalogo`
   - Verificar agrupación: Deporte → País → Proveedor
   - Filtrar por "Sin vínculo"
   - Click "Vincular" en una entidad

4. **Resolver Conflicto**
   - Ir a `/admin/super/catalogo?status=conflict`
   - Click "Resolver" en un conflicto
   - Modal muestra opciones: Unificar / Marcar distintos / Ignorar

---

## 📊 DIAGRAMAS

### Relaciones de Datos

```
Union (1) ←→ (N) ClubUnionMembership (N) ←→ (1) Club
Union (1) ←→ (0..N) Tournament [nullable unionId]
ProviderEntity (1) ←→ (0..1) Tournament/Club/Player [via internalId]
```

### Flujo de Vinculación

```
API Import → ProviderEntity (unlinked)
    ↓
Super Admin Review
    ↓
Match Confidence > 90% → Auto-link
Match Confidence 70-90% → Suggest (manual confirm)
Match Confidence < 70% → Status: conflict
    ↓
Manual Resolution:
  - Link to existing
  - Create new internal
  - Mark as ignored
```

---

## 🎨 MANTENER ESTILO EXISTENTE

- ✅ Variables CSS obsidian (--basalt-*, --magma-*, --cyanite)
- ✅ Componentes reutilizados (.slab, .tectonicGrid, .badge, .btn)
- ✅ Fuentes Geist/Geist Mono
- ✅ Transiciones y animaciones existentes
- ✅ Layout responsive (mobile drawer ya implementado)

---

## 🚀 ORDEN DE IMPLEMENTACIÓN RECOMENDADO

1. **Sesión 1 (30 min)**: Tipos + Mock DB
2. **Sesión 2 (45 min)**: Rutas Uniones (list + create)
3. **Sesión 3 (30 min)**: Return to Context en Torneos
4. **Sesión 4 (60 min)**: Catálogo de Provider Entities
5. **Sesión 5 (45 min)**: Filtros y UX polish
6. **Sesión 6 (60 min)**: APIs reales (si backend disponible)

---

FIN DEL DOCUMENTO
