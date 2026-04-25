const fs = require('fs');
const file = 'src/app/club-admin/matches/[id]/ClubMatchWorkspace.tsx';
let content = fs.readFileSync(file, 'utf8');

const map = {
  'Ã¡': 'á', 'Ã©': 'é', 'Ã­': 'í', 'Ã³': 'ó', 'Ãº': 'ú',
  'Ã±': 'ñ', 'Ã‘': 'Ñ', 'Ã¼': 'ü',
  'Ã¢': 'â', 'Ãª': 'ê', 'Ã®': 'î', 'Ã´': 'ô', 'Ã»': 'û',
  'Ã£': 'ã', 'Ãµ': 'õ', 'Ã§': 'ç', 'Ã‡': 'Ç',
  'Ã«': 'ë', 'Ã¯': 'ï', 'Ã¿': 'ÿ',
  'Ã¬': 'ì', 'Ã²': 'ò', 'Ã¹': 'ù',
  'Ã½': 'ý', 'Ã¾': 'þ', 'Ã°': 'ð',
  'Ã¨': 'è', 'Ã ': 'à',
};

let changed = 0;
for (const [bad, good] of Object.entries(map)) {
  const regex = new RegExp(bad, 'g');
  const before = content;
  content = content.replace(regex, good);
  if (content !== before) changed++;
}

fs.writeFileSync(file, content, 'utf8');
console.log('Replaced', changed, 'mojibake patterns');
