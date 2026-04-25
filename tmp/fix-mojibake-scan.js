const fs = require('fs');
const content = fs.readFileSync('src/app/club-admin/matches/[id]/ClubMatchWorkspace.tsx', 'utf8');

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

let found = [];
for (const [bad, good] of Object.entries(map)) {
  if (content.includes(bad)) {
    found.push(bad + ' -> ' + good);
  }
}
found.sort();
found.forEach(f => console.log(f));
console.log('Total found:', found.length);
