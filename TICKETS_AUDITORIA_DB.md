# Tickets abiertos por la auditoría repo ↔ base

Ninguno resuelto. Diagnóstico y evidencia, nada más.

---

## T-1 · Favoritos escribe contra `favorites`, que no existe

**Estado: el camino ES alcanzable desde la UI, pero NO rompe la experiencia.**

`persistFavoriteState` ([persistence.ts:261](src/lib/favorites/persistence.ts#L261)) hace
un `DELETE` ([:288](src/lib/favorites/persistence.ts#L288)) y un `UPSERT`
([:306](src/lib/favorites/persistence.ts#L306)) contra `public.favorites`, que no existe
en la base. El upsert lanza (`if (upsertError) throw upsertError`).

La cadena hasta la UI está completa: lo llama
[useFavorites.ts:431](src/hooks/useFavorites.ts#L431) (ligas) y
[useFavorites.ts:496](src/hooks/useFavorites.ts#L496) (clubes), y ese hook lo usan
`FavoriteButton.tsx`, el home, la página de club, la de torneo, favoritos y perfil.

**Por qué no se ve rota igual.** La llamada va en paralelo con la implementación nueva:

```ts
const [followResult, legacyResult] = await Promise.allSettled([
    toggleLeagueFollow(...),      // user_favorite_leagues — SÍ existe
    persistFavoriteState(...),    // favorites — NO existe
]);
const actionError = getActionError([followResult, legacyResult]);
if (actionError) throw actionError;
```

y `getActionError` ([useFavorites.ts:156-169](src/hooks/useFavorites.ts#L156-L169))
sólo devuelve el error **cuando fallaron todas** las promesas
(`if (rejected.length === results.length) return rejected[0]`). Con una sola caída
emite un `console.warn` y devuelve `null`. Como la escritura nueva funciona, el
favorito se guarda bien y el usuario no ve nada.

**El costo real hoy:** una escritura fallida y un `console.warn` en cada toggle de
favorito, de cada usuario.

**El riesgo latente, que es el que importa:** el día que alguien aplique la migración
pendiente y `favorites` exista, este camino deja de fallar y **empieza a escribir**.
Ahí pasan a convivir dos fuentes de verdad para el mismo favorito — `favorites` y
`user_favorite_*` — sin nada que las sincronice.

**A decidir:** borrar el camino viejo, o borrar la migración que crea `favorites`.
Lo que no conviene es dejar los dos y que se resuelva solo.

---

## T-2 · `/api/cron/fixture-sync` escribe cada hora en una tabla que no existe

**Desde cuándo: 2026-03-18.** Unos 4 meses y medio, ~3.300 corridas.

| fecha | qué pasó |
|---|---|
| 2026-03-14 | `0a2815b` crea la ruta cron y `external_match_cache` (migración `20260315000001`) |
| 2026-03-18 | `4c79f27` la borra: `DROP TABLE IF EXISTS public.external_match_cache` ([20260318100000:136](supabase/migrations/20260318100000_schema_simplification_core.sql#L136)) |
| 2026-07-11 | `d6582f5` escribe la migración de restauración `20260701090000` — **nunca se aplicó** |
| hoy | la tabla sigue sin existir |

**Sí loguea, y con el mensaje correcto.**
[externalMatchCache.ts:189-191](src/lib/services/externalMatchCache.ts#L189-L191)
detecta el caso puntual y no lanza:

```ts
if (error.code === '42P01' || isMissingTableError(error, 'external_match_cache')) {
    console.warn('[externalMatchCache] upsertMatches skipped: la tabla external_match_cache no existe. Aplicar la migración 20260701090000_restore_external_match_cache.sql.');
    return;
}
```

O sea que en los logs de Vercel hay un `warn` por hora, por deporte y por día
consultado, nombrando la migración que falta. Nadie lo estaba mirando.

**El bug que sí hay que arreglar** está en el contador de la cron
([fixture-sync/route.ts:83-87](src/app/api/cron/fixture-sync/route.ts#L83-L87)):

```ts
if (matches.length > 0) {
    const cached = matches.map(m => mapFlashScoreMatchToCached(m, sport.id));
    await upsertMatches(cached, adminClient);   // no escribe nada y no lanza
    synced += cached.length;                    // …pero suma igual
}
```

Como `upsertMatches` retorna normal, `synced` se incrementa igual. El endpoint
responde `{ ok: true, synced: 340, errors: 0 }` **habiendo escrito cero filas**.
Un monitor que mire el status o el contador ve todo verde.

**Alcance:** la caché de fallback del feed no existe desde marzo. Cuando el
proveedor se cae, `/api/matches` no tiene de dónde leer — que es exactamente el
escenario para el que se construyó.

**A decidir:** aplicar `20260701090000` o dar de baja la cron y su tabla. Y en
cualquiera de los dos casos, que `synced` cuente lo que se escribió y no lo que se
intentó escribir.
