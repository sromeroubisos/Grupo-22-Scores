const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.md', '.json']);

const suspiciousRe = /[\u00C2\u00C3\u00E2\u00F0\u00EF\u00BF\u00BD\u0178\u0080-\u009F]/g;
const replacementRe = /\uFFFD/g;

// CP1252 specials (0x80-0x9F)
const specials = {
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E,
  0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6,
  0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152,
  0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C,
  0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A,
  0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178
};

const unicodeToCp1252 = new Map();
for (let i = 0; i < 256; i++) {
  if (specials[i] !== undefined) {
    unicodeToCp1252.set(specials[i], i);
  } else {
    unicodeToCp1252.set(i, i);
  }
}

function tryFixOnce(s) {
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const byte = unicodeToCp1252.get(code);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  try {
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return null;
  }
}

function fixMojibake(text) {
  let current = text;
  for (let pass = 0; pass < 8; pass++) {
    const fixed = tryFixOnce(current);
    if (!fixed || fixed === current) break;
    current = fixed;
  }
  return current;
}

function score(text) {
  const suspicious = (text.match(suspiciousRe) || []).length;
  const replacements = (text.match(replacementRe) || []).length;
  return suspicious * 10 + replacements * 200;
}

function decodeUtf8(buf) {
  return buf.toString('utf8');
}

function decodeLatin1(buf) {
  return buf.toString('latin1');
}

function decodeUtf16Le(buf) {
  if (buf.length < 2) return null;
  if (buf[0] === 0xFF && buf[1] === 0xFE) return buf.slice(2).toString('utf16le');
  return null;
}

function hasUtf8Bom(buf) {
  return buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
}

function pickBest(candidates) {
  let best = candidates[0];
  for (const c of candidates) {
    if (c.score < best.score) best = c;
  }
  return best;
}

function buildCandidates(buf) {
  const candidates = [];
  const utf8 = decodeUtf8(buf);
  const latin1 = decodeLatin1(buf);
  const utf16 = decodeUtf16Le(buf);
  const utf8NoBom = hasUtf8Bom(buf) ? buf.slice(3).toString('utf8') : null;

  candidates.push({ name: 'utf8', text: utf8, score: score(utf8) });
  candidates.push({ name: 'latin1', text: latin1, score: score(latin1) });
  if (utf16 !== null) candidates.push({ name: 'utf16le', text: utf16, score: score(utf16) });
  if (utf8NoBom !== null) candidates.push({ name: 'utf8bom', text: utf8NoBom, score: score(utf8NoBom) });

  for (const c of [...candidates]) {
    const fixed = fixMojibake(c.text);
    candidates.push({ name: `${c.name}+fixed`, text: fixed, score: score(fixed) });
  }

  return candidates;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!exts.has(ext)) continue;

    const buf = fs.readFileSync(full);
    const candidates = buildCandidates(buf);
    const best = pickBest(candidates);

    const utf8 = candidates.find((c) => c.name === 'utf8');
    const needsWrite = best.text !== utf8.text || hasUtf8Bom(buf);

    if (needsWrite) {
      fs.writeFileSync(full, best.text, { encoding: 'utf8' });
      console.log(`fixed: ${path.relative(process.cwd(), full)} (${utf8.score} -> ${best.score})`);
    }
  }
}

walk(root);
console.log('done');
