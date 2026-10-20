import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUEST_OWNER,
  createFavoritesStore,
  type FavoriteClubRow,
  type FavoriteLeagueRow,
  type FavoritesLoadResult,
} from './favoritesStore.ts';

const league = (id: string, name = id): FavoriteLeagueRow => ({
  league_id: id, canonical_league_id: null, sport_id: 'rugby', display_name: name, logo_url: null, created_at: '2026-01-01T00:00:00Z',
});
const club = (id: string, name = id): FavoriteClubRow => ({
  club_id: id, canonical_club_id: null, sport_id: 'rugby', display_name: name, logo_url: null, created_at: '2026-01-01T00:00:00Z',
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

function makeStore(storage = memoryStorage(), clock = { t: 1_000_000 }) {
  const store = createFavoritesStore({
    matchLeague: (row, id) => row.league_id === id,
    matchClub: (row, id) => row.club_id === id,
    storage,
    now: () => clock.t,
  });
  return { store, storage, clock };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('sin dueño resuelto el store no inventa un "no seguís nada"', () => {
  const { store } = makeStore();
  store.setOwner(null);
  assert.equal(store.getSnapshot().hydrated, false);
  assert.equal(store.getSnapshot().owner, null);
});

test('la copia local se lee al fijar el dueño: el primer pintado ya sabe qué sigue', () => {
  const storage = memoryStorage();
  const first = makeStore(storage).store;
  first.setOwner('u1');
  first.replaceAll([league('urba-top14')], [club('cuba')]);

  const second = makeStore(storage).store;
  second.setOwner('u1');
  const snap = second.getSnapshot();
  assert.equal(snap.hydrated, true);
  assert.deepEqual(snap.leagueRows.map((r) => r.league_id), ['urba-top14']);
  assert.deepEqual(snap.clubRows.map((r) => r.club_id), ['cuba']);
});

test('otro usuario no hereda los favoritos del anterior', () => {
  const { store } = makeStore();
  store.setOwner('u1');
  store.replaceAll([league('a')], []);
  store.setOwner('u2');
  assert.deepEqual(store.getSnapshot().leagueRows, []);
  assert.equal(store.getSnapshot().hydrated, false);
});

test('pasar por owner null (sesión verificándose) no vacía la lista', () => {
  const { store } = makeStore();
  store.setOwner('u1');
  store.replaceAll([league('a')], []);
  store.setOwner(null);
  assert.deepEqual(store.getSnapshot().leagueRows.map((r) => r.league_id), ['a']);
});

test('N revalidaciones simultáneas son un solo pedido', async () => {
  const { store } = makeStore();
  store.setOwner('u1');
  let calls = 0;
  const gate = deferred<FavoritesLoadResult>();
  const loader = () => { calls += 1; return gate.promise; };

  const all = [store.revalidate(loader), store.revalidate(loader), store.revalidate(loader)];
  gate.resolve({ leagues: [league('a')], clubs: [] });
  await Promise.all(all);

  assert.equal(calls, 1);
  assert.equal(store.getSnapshot().status, 'ready');
});

test('una copia reciente no se vuelve a pedir; con force sí', async () => {
  const { store, clock } = makeStore();
  store.setOwner('u1');
  let calls = 0;
  const loader = async () => { calls += 1; return { leagues: [], clubs: [] }; };

  await store.revalidate(loader);
  await store.revalidate(loader);
  assert.equal(calls, 1);

  clock.t += 5_000;
  await store.revalidate(loader);
  assert.equal(calls, 1);

  await store.revalidate(loader, { force: true });
  assert.equal(calls, 2);

  clock.t += 60_000;
  await store.revalidate(loader);
  assert.equal(calls, 3);
});

test('una respuesta del servidor que llega después de una estrella optimista NO la pisa', async () => {
  const { store } = makeStore();
  store.setOwner('u1');
  store.replaceAll([], []);

  const gate = deferred<FavoritesLoadResult>();
  const stale = store.revalidate(() => gate.promise, { force: true });

  // La persona toca la estrella mientras el pedido viaja.
  store.applyChange({ kind: 'league', entityId: 'x', isFavorite: true, row: league('x') });
  gate.resolve({ leagues: [], clubs: [] }); // el servidor todavía no vio el alta
  await stale;

  assert.deepEqual(store.getSnapshot().leagueRows.map((r) => r.league_id), ['x']);
});

test('al cerrarse la escritura se repite la revalidación que quedó descartada', async () => {
  const { store } = makeStore();
  store.setOwner('u1');
  store.replaceAll([], []);

  const first = deferred<FavoritesLoadResult>();
  let calls = 0;
  const loader = () => {
    calls += 1;
    return calls === 1 ? first.promise : Promise.resolve({ leagues: [league('x')], clubs: [] } as FavoritesLoadResult);
  };

  const pending = store.revalidate(loader, { force: true });
  store.applyChange({ kind: 'league', entityId: 'x', isFavorite: true, row: league('x') });
  first.resolve({ leagues: [], clubs: [] });
  await pending;

  await store.settle();
  assert.equal(calls, 2);
  assert.deepEqual(store.getSnapshot().leagueRows.map((r) => r.league_id), ['x']);
});

test('si el servidor rechaza la escritura, el deshacer restaura solo esa entidad', () => {
  const { store } = makeStore();
  store.setOwner('u1');
  store.replaceAll([league('a')], [club('c1')]);

  const undoLeague = store.applyChange({ kind: 'league', entityId: 'a', isFavorite: false, row: league('a') });
  store.applyChange({ kind: 'club', entityId: 'c2', isFavorite: true, row: club('c2') });
  assert.deepEqual(store.getSnapshot().leagueRows, []);

  undoLeague();
  const snap = store.getSnapshot();
  assert.deepEqual(snap.leagueRows.map((r) => r.league_id), ['a']);
  // La otra escritura, todavía en vuelo, no se toca.
  assert.deepEqual(snap.clubRows.map((r) => r.club_id).sort(), ['c1', 'c2']);
});

test('un error de red con copia local conserva la lista y reporta el error aparte', async () => {
  const { store } = makeStore();
  store.setOwner('u1');
  store.replaceAll([league('a')], []);

  await store.revalidate(() => Promise.reject(new Error('Failed to fetch')), { force: true });
  const snap = store.getSnapshot();
  assert.equal(snap.status, 'ready');
  assert.equal(snap.error, 'Failed to fetch');
  assert.deepEqual(snap.leagueRows.map((r) => r.league_id), ['a']);
});

test('un error sin copia local queda en "error", no en "no seguís nada"', async () => {
  const { store } = makeStore();
  store.setOwner('u1');
  await store.revalidate(() => Promise.reject(new Error('timeout')), { force: true });
  const snap = store.getSnapshot();
  assert.equal(snap.status, 'error');
  assert.equal(snap.hydrated, false);
});

test('un loader que tira en forma sincrónica no rompe el store', async () => {
  const { store } = makeStore();
  store.setOwner('u1');
  await store.revalidate(() => { throw new Error('boom'); }, { force: true });
  assert.equal(store.getSnapshot().status, 'error');
});

test('loader que devuelve null (sesión sin verificar) no vacía ni marca error', async () => {
  const { store } = makeStore();
  store.setOwner('u1');
  store.replaceAll([league('a')], []);
  await store.revalidate(async () => null, { force: true });
  const snap = store.getSnapshot();
  assert.equal(snap.error, null);
  assert.deepEqual(snap.leagueRows.map((r) => r.league_id), ['a']);
});

test('el visitante sin cuenta nace hidratado y no consulta servidor', async () => {
  const { store } = makeStore();
  store.setOwner(GUEST_OWNER);
  assert.equal(store.getSnapshot().hydrated, true);
  let calls = 0;
  await store.revalidate(async () => { calls += 1; return { leagues: [], clubs: [] }; }, { force: true });
  assert.equal(calls, 0);
});

test('los favoritos del visitante sobreviven a recargar y se pueden leer para sincronizar', () => {
  const storage = memoryStorage();
  const a = makeStore(storage).store;
  a.setOwner(GUEST_OWNER);
  a.applyChange({ kind: 'club', entityId: 'cuba', isFavorite: true, row: club('cuba') });
  void a.settle();

  const b = makeStore(storage).store;
  assert.deepEqual(b.readStoredRows(GUEST_OWNER).clubs.map((r) => r.club_id), ['cuba']);
  b.clearStored(GUEST_OWNER);
  assert.deepEqual(b.readStoredRows(GUEST_OWNER).clubs, []);
});

test('sin localStorage el store funciona en memoria', () => {
  const broken = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); },
  };
  const store = createFavoritesStore({
    matchLeague: (row, id) => row.league_id === id,
    matchClub: (row, id) => row.club_id === id,
    storage: broken,
  });
  store.setOwner('u1');
  store.applyChange({ kind: 'league', entityId: 'a', isFavorite: true, row: league('a') });
  assert.deepEqual(store.getSnapshot().leagueRows.map((r) => r.league_id), ['a']);
});
