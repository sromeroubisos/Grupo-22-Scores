const fs = require('fs');
const path = require('path');

const filePath = path.join(
  'C:', 'Users', 'srome', 'OneDrive', 'Escritorio', 'Grupo-22-Scores',
  'src', 'app', 'admin', '(union)', 'union', '[id]', 'torneos', 'crear', 'page.tsx'
);

let text = fs.readFileSync(filePath, 'utf-8');

// CP1252 special chars (0x80-0x9F range) that differ from Latin-1
const specials = {
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E,
  0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6,
  0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152,
  0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C,
  0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A,
  0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178
};

// Build reverse map: Unicode codepoint -> CP1252 byte
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
    return Buffer.from(bytes).toString('utf-8');
  } catch {
    return null;
  }
}

// Apply multiple passes of mojibake fix
for (let pass = 0; pass < 5; pass++) {
  const fixed = tryFixOnce(text);
  if (!fixed || fixed === text) {
    console.log('Stopped after ' + pass + ' passes');
    break;
  }
  text = fixed;
  console.log('Pass ' + (pass + 1) + ' applied');
}

fs.writeFileSync(filePath, text, 'utf-8');
console.log('Done.');
