import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SPONSOR_LOGOS,
  TIER_SIZE,
  bandPages,
  cornerSequence,
  defaultSponsorsState,
  logoBox,
  mergeSponsorsState,
  rotationIndex,
  tierBoxes,
  type SponsorLogo,
} from './sponsorsOverlay.ts';

const logo = (id: string, ratio: number): SponsorLogo => ({ id, url: `https://x.supabase.co/storage/v1/object/public/sponsors/overlay/${id}.webp`, name: id, ratio });

test('a mayor nivel, logo más grande', () => {
  const area = (tier: keyof typeof TIER_SIZE.grilla) => {
    const box = logoBox(2, TIER_SIZE.grilla[tier].height);
    return box.width * box.height;
  };
  assert.ok(area('title') > area('main'));
  assert.ok(area('main') > area('sponsor'));
  assert.ok(area('sponsor') > area('acompanante'));
});

test('un logo apaisado y uno cuadrado del mismo nivel pesan lo mismo (misma área)', () => {
  const wide = logoBox(2.5, 100);
  const square = logoBox(1, 100);
  const ratio = (wide.width * wide.height) / (square.width * square.height);
  assert.ok(ratio > 0.95 && ratio < 1.05, `áreas desparejas: ${ratio}`);
  assert.ok(wide.width > square.width);
  assert.ok(square.height > wide.height);
});

test('los extremos se topan: ni más alto que el renglón ni más largo que la fila', () => {
  const tall = logoBox(0.3, 100);
  assert.ok(tall.height <= 145);
  const long = logoBox(10, 100);
  assert.ok(long.width <= 360);
});

test('con muchos logos el nivel se achica parejo, con un piso', () => {
  const few = tierBoxes([logo('a', 2), logo('b', 2)], 'main', 'grilla');
  assert.equal(few.scale, 1);
  const many = tierBoxes(Array.from({ length: 24 }, (_, i) => logo(`m${i}`, 2)), 'main', 'grilla');
  assert.ok(many.scale < 1);
  assert.ok(many.scale >= 0.45);
  // Todos por el mismo factor: siguen iguales entre sí.
  assert.equal(new Set(many.boxes.map((box) => box.width)).size, 1);
});

test('lo que manda el panel se sanea: urls, proporción, tope de logos y opciones', () => {
  const state = mergeSponsorsState(defaultSponsorsState(), {
    layout: 'cualquiera',
    surface: 'claro',
    rotate: 1,
    heading: 'Gracias a',
    tiers: {
      title: [{ id: 't', url: 'javascript:alert(1)', ratio: 2 }, { id: 'ok', url: 'https://a.b/c.webp', ratio: -3 }],
      main: Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, url: `https://a.b/${i}.webp`, ratio: 2 })),
    },
  });
  assert.equal(state.layout, 'grilla');
  assert.equal(state.surface, 'claro');
  assert.equal(state.rotate, 2);
  assert.equal(state.heading, 'Gracias a');
  assert.deepEqual(state.tiers.title.map((item) => item.id), ['ok']);
  assert.equal(state.tiers.title[0].ratio, 2);
  assert.equal(state.tiers.title.length + state.tiers.main.length, MAX_SPONSOR_LOGOS);
});

test('un cambio parcial no borra los niveles que no se mandan', () => {
  const saved = mergeSponsorsState(defaultSponsorsState(), { tiers: { title: [logo('t', 2)], sponsor: [logo('s', 1)] } });
  const next = mergeSponsorsState(saved, { tiers: { main: [logo('m', 3)] }, layout: 'banda' });
  assert.deepEqual(next.tiers.title.map((item) => item.id), ['t']);
  assert.deepEqual(next.tiers.main.map((item) => item.id), ['m']);
  assert.deepEqual(next.tiers.sponsor.map((item) => item.id), ['s']);
  assert.equal(next.layout, 'banda');
});

test('la banda va de a un nivel, y parte el que no entra en un renglón', () => {
  const state = mergeSponsorsState(defaultSponsorsState(), {
    tiers: {
      title: [logo('t', 2)],
      acompanante: Array.from({ length: 30 }, (_, i) => logo(`a${i}`, 2.5)),
    },
  });
  const pages = bandPages(state);
  assert.equal(pages[0].tier, 'title');
  const acompanante = pages.filter((page) => page.tier === 'acompanante');
  assert.ok(acompanante.length >= 2);
  assert.equal(acompanante.reduce((sum, page) => sum + page.logos.length, 0), 30);
});

test('la esquina le da más turnos al title que al acompañante', () => {
  const state = mergeSponsorsState(defaultSponsorsState(), { tiers: { title: [logo('t', 2)], acompanante: [logo('a', 2)] } });
  const sequence = cornerSequence(state);
  assert.equal(sequence.filter((item) => item.tier === 'title').length, 3);
  assert.equal(sequence.filter((item) => item.tier === 'acompanante').length, 1);
});

test('la rotación sale del reloj', () => {
  assert.equal(rotationIndex(4, 8, 0), 0);
  assert.equal(rotationIndex(4, 8, 8_000), 1);
  assert.equal(rotationIndex(4, 8, 32_000), 0);
  assert.equal(rotationIndex(1, 8, 99_000), 0);
});
