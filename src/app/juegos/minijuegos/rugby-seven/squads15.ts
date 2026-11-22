/**
 * Selecciones: 7 nombres de cada plantel de 15 de la temporada 2026 (Nations Championship y Nations Cup),
 * tomados de las nóminas publicadas. Orden por puesto: primera línea, segunda o tercera línea, tercera línea,
 * medio scrum, apertura, centro y wing o fullback.
 *
 * Van con el mismo recorte de apellido que el resto de los planteles del juego (inicial + apellido; los de 7
 * letras o más pierden la última): se reconoce de quién se habla, pero no es el nombre tal cual.
 *
 * Las nóminas cambian cada ventana: acá van las más recientes que se pudieron verificar. Tonga: la fuente
 * solo traía el apellido del fullback, por eso va sin inicial.
 */
export const SQUADS_15S: Record<string, string[]> = {
    // Nations Championship: hemisferio sur (nóminas de noviembre 2026; Fiyi y Japón, de junio)
    ARG: ['J. Sclavi', 'J. Montoy', 'P. Matera', 'G. García', 'T. Alborno', 'L. Cinti', 'M. Carrera'],
    NZL: ['E. De Groo', 'C. Taylor', 'W. Sititi', 'C. Roigar', "R. Mo'ung", 'J. Barret', 'W. Jordan'],
    AUS: ['T. Tupou', 'B. Amosa', 'R. Valetin', 'T. McDermot', 'C. Gordon', 'L. Ikitau', 'T. Wright'],
    RSA: ['O. Nché', 'M. Marx', 'S. Kolisi', 'C. Reinac', 'S. Feinber', 'D. Allend', 'K. Arends'],
    FIJ: ['E. Mawi', 'T. Ikaniver', 'P. Yato', 'F. Lomani', 'C. Muntz', 'S. Radradr', 'J. Tuisov'],
    JPN: ['K. Sato', 'M. Harada', 'M. Leitch', 'N. Saito', 'T. Hojo', 'D. Riley', 'R. Ito'],
    // Nations Championship: Seis Naciones (nóminas de noviembre 2026)
    ENG: ['E. Genge', 'J. George', 'B. Earl', 'A. Mitche', 'G. Ford', 'H. Slade', 'F. Stewar'],
    FRA: ['J. Poirot', 'P. Mauvak', 'G. Alldrit', 'A. Dupont', 'R. Ntamac', 'Y. Moefan', 'L. Biarre'],
    IRL: ['T. Furlon', 'D. Sheeha', 'J. Flier', 'J. Park', 'S. Prendergas', 'G. Ringros', 'H. Keenan'],
    ITA: ['D. Fischett', 'G. Lucches', 'M. Lamaro', 'S. Varney', 'P. Garbis', 'J. Brex', 'A. Capuozz'],
    SCO: ['Z. Fagerso', 'E. Ashman', 'J. Ritchi', 'B. White', 'F. Russel', 'S. Tuipulot', 'D. Merwe'],
    WAL: ['N. Smith', 'D. Lake', 'J. Morgan', 'T. William', 'S. Costelo', 'J. Hawkin', 'L. Zammit'],
    // Nations Cup (nóminas y formaciones de julio 2026)
    POR: ['C. Thomas', 'L. Begic', 'J. Madeir', 'S. Marque', 'M. Vareir', 'T. Appleto', 'M. Pinto'],
    ROU: ['G. Gajion', 'A. Mahu', 'C. Boboc', 'A. Conach', 'H. Vaovas', 'A. Septar', 'M. Simionesc'],
    ESP: ['J. Zabala', 'A. Albo', 'M. Aricet', 'E. Bay', 'L. Richardi', 'A. Gimeno', 'A. Carmon'],
    TGA: ['B. Tameifun', 'H. Fifita', 'O. Pauta', 'S. Takulu', 'P. Pellegrin', 'M. Fekito', 'Veainu'],
    URU: ['F. Etchegorr', 'G. Kessle', 'M. Ardao', 'S. Arata', 'J. Cotarmana', 'A. Vidal', 'F. Capdevil'],
    SAM: ['J. Allen', 'R. Asiata', "A. Papali'", 'E. Enari', 'J. Ioane', "D. Paia'au", 'W. Solomon'],
    CAN: ['C. Martine', 'A. Quattri', 'L. Rumbal', 'J. Higgin', 'P. Nelson', 'J. McIndo', 'S. Jones'],
    CHI: ['J. Carrasc', 'D. Escoba', 'C. Saavedr', 'M. Torrealb', 'R. Fernande', 'S. Videla', 'M. Garafuli'],
    GEO: ['G. Akhaladz', 'N. Sutidz', 'L. Ivanishvil', 'V. Lobzhanidz', 'L. Matkav', 'T. Kakhoidz', 'D. Niniashvil'],
    HKG: ['K. Chapma', 'H. Baron', 'P. West', 'J. Combes', 'J. Barker', 'M. Threlkel', 'P. Altier'],
    USA: ['J. Iscaro', 'K. Pifelet', 'J. Damm', 'R. Haas', 'C. Hilsenbec', 'T. Lopeti', 'R. McLean'],
    ZIM: ['T. Visser', 'B. Chiang', 'T. Maveser', 'T. Gombe', 'B. Housto', 'K. Mashaw', 'T. Mafura'],
};
