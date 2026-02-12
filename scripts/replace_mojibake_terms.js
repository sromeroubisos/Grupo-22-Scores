const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.md', '.json']);

const replacements = [
  ['Administraciï¿½n', 'Administración'],
  ['administraciï¿½n', 'administración'],
  ['Auditorï¿½a', 'Auditoría'],
  ['auditorï¿½a', 'auditoría'],
  ['Categorï¿½as', 'Categorías'],
  ['categorï¿½as', 'categorías'],
  ['Navegaciï¿½n', 'Navegación'],
  ['Comunicaciï¿½n', 'Comunicación'],
  ['comunicaciï¿½n', 'comunicación'],
  ['Configuraciï¿½n', 'Configuración'],
  ['configuraciï¿½n', 'configuración'],
  ['Cï¿½mara', 'Cámara'],
  ['cï¿½mara', 'cámara'],
  ['Estadï¿½sticas', 'Estadísticas'],
  ['estadï¿½sticas', 'estadísticas'],
  ['Matï¿½as', 'Matías'],
  ['Nicolï¿½s', 'Nicolás'],
  ['Tomï¿½s', 'Tomás'],
  ['Pï¿½rez', 'Pérez'],
  ['Dï¿½az', 'Díaz'],
  ['Suï¿½rez', 'Suárez'],
  ['Operaciï¿½n', 'Operación'],
  ['operaciï¿½n', 'operación'],
  ['Paï¿½ses', 'Países'],
  ['paï¿½ses', 'países'],
  ['comï¿½n', 'común'],
  ['Comï¿½n', 'Común'],
  ['Recepciï¿½n', 'Recepción'],
  ['recepciï¿½n', 'recepción'],
  ['Sesiï¿½n', 'Sesión'],
  ['sesiï¿½n', 'sesión'],
  ['Taï¿½a', 'Taça'],
  ['Tï¿½cnico', 'Técnico'],
  ['tï¿½cnico', 'técnico'],
  ['Tï¿½cnica', 'Técnica'],
  ['tï¿½cnica', 'técnica'],
  ['Tï¿½ctico', 'Táctico'],
  ['tï¿½ctico', 'táctico'],
  ['Tï¿½ctica', 'Táctica'],
  ['tï¿½ctica', 'táctica'],
  ['Uniï¿½n', 'Unión'],
  ['Zï¿½rich', 'Zürich'],
  ['Activaciï¿½n', 'Activación'],
  ['activaciï¿½n', 'activación'],
  ['Aplicaciï¿½n', 'Aplicación'],
  ['aplicaciï¿½n', 'aplicación'],
  ['Aquï¿½', 'Aquí'],
  ['aquï¿½', 'aquí'],
  ['Bï¿½sica', 'Básica'],
  ['bï¿½sico', 'básico'],
  ['Crï¿½ticas', 'Críticas'],
  ['Divisiï¿½n', 'División'],
  ['construcciï¿½n', 'construcción'],
  ['Federaciï¿½n', 'Federación'],
  ['Hï¿½bil', 'Hábil'],
  ['Lï¿½nea', 'Línea'],
  ['lï¿½nea', 'línea'],
  ['lï¿½neas', 'líneas'],
  ['lï¿½deres', 'líderes'],
  ['Recuperaciï¿½n', 'Recuperación'],
  ['anï¿½lisis', 'análisis'],
  ['elï¿½sticas', 'elásticas'],
  ['estarï¿½', 'estará'],
  ['estï¿½', 'está'],
  ['automï¿½ticamente', 'automáticamente'],
  ['Gestiï¿½n', 'Gestión'],
  ['gestiï¿½n', 'gestión'],
  ['guï¿½as', 'guías'],
  ['documentaciï¿½n', 'documentación'],
  ['invitaciï¿½n', 'invitación'],
  ['Sï¿½bado', 'Sábado'],
  ['maï¿½ana', 'mañana'],
  ['mï¿½dulo', 'módulo'],
  ['mï¿½tricas', 'métricas'],
  ['mï¿½ximas', 'máximas'],
  ['obtenciï¿½n', 'obtención'],
  ['podrï¿½s', 'podrás'],
  ['polï¿½tica', 'política'],
  ['Polï¿½tica', 'Política'],
  ['post-quirï¿½rgico', 'post-quirúrgico'],
  ['preparaciï¿½n', 'preparación'],
  ['presiï¿½n', 'presión'],
  ['prï¿½ximamente', 'próximamente'],
  ['Prï¿½ximo', 'Próximo'],
  ['publicarï¿½', 'publicará'],
  ['publicï¿½', 'publicó'],
  ['pï¿½gina', 'página'],
  ['auto-vectorizaciï¿½n', 'auto-vectorización'],
  ['secciï¿½n', 'sección'],
  ['tï¿½rminos', 'términos'],
  ['Tï¿½rminos', 'Términos'],
  ['usï¿½', 'usá'],
  ['Duraciï¿½n', 'Duración'],
  ['Informaciï¿½n', 'Información'],
  ['informaciï¿½n', 'información'],
  ['Planificaciï¿½n', 'Planificación'],
  ['Completï¿½', 'Completé'],
  ['Activï¿½', 'Activé'],
  ['Ubicaciï¿½n', 'Ubicación'],
  ['Fï¿½tbol', 'Fútbol'],
  ['fï¿½tbol', 'fútbol'],
  ['ï¿½ltima', 'Última'],
  ['ï¿½mbito', 'Ámbito'],
  ['ï¿½nico', 'Único'],
  ['ï¿½El', '¿El'],
  ['Tï¿½', 'TÉ']
];

function applyReplacements(text) {
  let output = text;
  for (const [from, to] of replacements) {
    output = output.split(from).join(to);
  }

  output = output.replace(/ ï¿½ /g, ' · ');
  output = output.replace(/>\\s*ï¿½\\s*</g, '>×<');
  return output;
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

    const original = fs.readFileSync(full, 'utf8');
    const updated = applyReplacements(original);
    if (updated !== original) {
      fs.writeFileSync(full, updated, 'utf8');
      console.log(`fixed: ${path.relative(process.cwd(), full)}`);
    }
  }
}

walk(root);
console.log('done');
