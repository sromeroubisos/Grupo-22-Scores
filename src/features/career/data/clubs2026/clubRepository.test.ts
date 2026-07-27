import test from 'node:test';
import assert from 'node:assert/strict';
import { FixturesClubRepository, StaticSaClubRepository, buildCatalogSnapshot } from './clubRepository.ts';
import { CLUBS as WORLD_CLUBS, CLUB_CATALOG_VERSION, NORMALIZED_CATALOG_VERSION } from '../clubs.ts';
import { SA_SNAPSHOT_VERSION } from './saClubs.generated.ts';

test('el repositorio estático sirve los clubes REALES AR/UY/CL sin tocar la red', async () => {
    const sa = await new StaticSaClubRepository().listSouthAmericaClubs();
    assert.ok(sa.length > 150, `esperaba el snapshot real, hay ${sa.length}`);
    for (const club of sa) {
        assert.equal(club.source, 'supabase');
        assert.ok(['ar', 'uy', 'cl'].includes(club.countryCode));
        assert.ok(club.rating <= 46, `${club.name}: amateur por encima de 46`);
    }
});

test('el snapshot informa de dónde viene cada club', async () => {
    const snap = await buildCatalogSnapshot(new StaticSaClubRepository(), CLUB_CATALOG_VERSION);
    assert.equal(snap.saSnapshotVersion, SA_SNAPSHOT_VERSION, 'sella la versión del contenido de Supabase');
    assert.equal(snap.counts.total, snap.clubs.length);
    assert.ok(snap.counts.ar > 100 && snap.counts.uy > 5 && snap.counts.cl > 5, JSON.stringify(snap.counts));
    assert.ok(snap.counts.static >= 208, 'el catálogo estático sigue completo');
});

test('la versión normalizada combina catálogo estático y snapshot de Supabase', () => {
    assert.ok(NORMALIZED_CATALOG_VERSION.startsWith(CLUB_CATALOG_VERSION), 'arranca con la versión estática');
    assert.ok(NORMALIZED_CATALOG_VERSION.includes(SA_SNAPSHOT_VERSION), 'incluye el hash del contenido remoto');
});

test('el repositorio devuelve clubes AR/UY/CL amateur desde "Supabase"', async () => {
    const sa = await new FixturesClubRepository().listSouthAmericaClubs();
    assert.ok(sa.length > 0);
    for (const c of sa) {
        assert.equal(c.source, 'supabase', 'source debe ser supabase');
        assert.ok(c.sourceId, 'debe conservar sourceId');
        assert.equal(c.level, 'amateur');
        assert.ok(c.rating <= 46, `amateur no puede superar 46: ${c.name} ${c.rating}`);
        assert.ok(['ar', 'uy', 'cl'].includes(c.countryCode), 'país SA');
    }
});

test('el snapshot fusiona estático + SA sin duplicar ids', async () => {
    const snap = await buildCatalogSnapshot(new FixturesClubRepository(), CLUB_CATALOG_VERSION);
    const ids = snap.clubs.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, 'ids duplicados en el snapshot');
    assert.ok(snap.clubs.length > WORLD_CLUBS.length, 'el snapshot debe incluir los clubes SA');
    assert.ok(snap.clubs.some((c) => c.source === 'supabase'), 'faltan clubes de Supabase');
    assert.ok(snap.clubs.some((c) => c.source === 'career-static'), 'faltan clubes estáticos');
});

test('cero sourceId duplicados dentro del source supabase', async () => {
    const snap = await buildCatalogSnapshot(new FixturesClubRepository(), CLUB_CATALOG_VERSION);
    const sourceIds = snap.clubs.filter((c) => c.source === 'supabase').map((c) => c.sourceId);
    assert.ok(sourceIds.length > 0, 'debe haber clubes de supabase');
    assert.ok(sourceIds.every((id) => id !== null), 'todo club de supabase conserva su sourceId');
    assert.equal(new Set(sourceIds).size, sourceIds.length, 'sourceId duplicados en el source supabase');
});

test('el snapshot es determinístico (misma versión ⇒ mismo snapshotVersion)', async () => {
    const a = await buildCatalogSnapshot(new FixturesClubRepository(), CLUB_CATALOG_VERSION);
    const b = await buildCatalogSnapshot(new FixturesClubRepository(), CLUB_CATALOG_VERSION);
    assert.equal(a.snapshotVersion, b.snapshotVersion);
    assert.ok(a.snapshotVersion.startsWith(CLUB_CATALOG_VERSION));
});
