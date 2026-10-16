// Colores dominantes de una imagen RGBA cruda, para el degradé de los bloques del
// selector de ligas (logos de uniones y banderas de países).
//
// Se descartan blancos, grises y negros (no dan identidad) y el segundo color tiene
// que estar lejos del primero en el círculo cromático. Si nada pasa el umbral de
// saturación, se vuelve a intentar con uno más bajo (logos casi grises).

export function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((hh * 60) + 360) % 360, s: mx ? d / mx : 0, v: mx / 255 };
}

export const hex = ([r, g, b]) => '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');

export function dominantes(data, w, h, minSat = 0.28) {
  const cubos = new Map();
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (data[o + 3] < 200) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const { s, v } = hsv(r, g, b);
    if (s < minSat || v < 0.18) continue;
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = cubos.get(k) ?? { n: 0, r: 0, g: 0, b: 0, s: 0 };
    c.n++; c.r += r; c.g += g; c.b += b; c.s += s;
    cubos.set(k, c);
  }
  const lista = [...cubos.values()]
    .map((c) => ({ rgb: [Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)], peso: c.n * (0.4 + c.s / c.n) }))
    .sort((a, b) => b.peso - a.peso);
  if (!lista.length) return minSat > 0.12 ? dominantes(data, w, h, 0.12) : null;
  const primero = lista[0];
  const hp = hsv(...primero.rgb);
  const segundo = lista.find((c) => {
    const hs = hsv(...c.rgb);
    const dh = Math.min(Math.abs(hs.h - hp.h), 360 - Math.abs(hs.h - hp.h));
    return dh >= 35 && c.peso > primero.peso * 0.06;
  });
  return [hex(primero.rgb), segundo ? hex(segundo.rgb) : null];
}
