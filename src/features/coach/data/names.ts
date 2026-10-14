// Banco de nombres para los planteles generados.
//
// Por qué generados y no reales: el rugby de clubes argentino es amateur. Son
// personas que no cobran por jugar, muchas menores de edad en el M19, y algunas
// son clientes de G22 o hijos de clientes. El escudo, la ciudad, la unión y el
// palmarés son datos públicos e institucionales y hacen toda la conexión
// emocional; los nombres de personas no agregan casi nada y agregan todo el
// riesgo. La base tiene `season_rosters` con planteles oficiales: no se usan acá
// a propósito.
//
// El `name_bank.json` de rugby-manager-pro no se portó: sus nombres están
// generados por permutación de sílabas ("Ashcus", "Brfer", "Brby") y no se leen
// como personas. Este banco son nombres de pila y apellidos del padrón argentino,
// con la mezcla que efectivamente tiene el rugby del país: castellano e italiano
// de base, y una franja británica e irlandesa que viene de los colegios y clubes
// fundadores.

/** Nombres de pila. */
export const FIRST_NAMES: readonly string[] = [
    'Agustín', 'Alejo', 'Ariel', 'Bautista', 'Benjamín', 'Bruno', 'Camilo', 'Ciro',
    'Cristian', 'Damián', 'Diego', 'Emiliano', 'Enrique', 'Facundo', 'Federico',
    'Felipe', 'Francisco', 'Gabriel', 'Gastón', 'Gonzalo', 'Guido', 'Hernán',
    'Ignacio', 'Iván', 'Javier', 'Joaquín', 'Juan', 'Julián', 'Leandro', 'Lisandro',
    'Lucas', 'Luciano', 'Manuel', 'Marcos', 'Martín', 'Mateo', 'Matías', 'Maximiliano',
    'Nahuel', 'Nicolás', 'Pablo', 'Pedro', 'Ramiro', 'Rodrigo', 'Rubén', 'Santiago',
    'Sebastián', 'Simón', 'Tomás', 'Valentín',
];

/** Apellidos castellanos e italianos: el grueso de cualquier plantel. */
const SURNAMES_CRIOLLOS: readonly string[] = [
    'Acosta', 'Aguirre', 'Álvarez', 'Arce', 'Barrionuevo', 'Benítez', 'Bertone',
    'Bianchi', 'Cabrera', 'Cáceres', 'Calvo', 'Carrizo', 'Castro', 'Cavallo',
    'Coronel', 'Correa', 'Domínguez', 'Echeverría', 'Escobar', 'Ferrari', 'Ferreyra',
    'Figueroa', 'Franco', 'Gaitán', 'Gallardo', 'Giménez', 'Godoy', 'Gómez',
    'González', 'Gutiérrez', 'Herrera', 'Ibarra', 'Juárez', 'Ledesma', 'Leiva',
    'Lombardi', 'López', 'Luna', 'Maidana', 'Maldonado', 'Marchesini', 'Medina',
    'Méndez', 'Molina', 'Montenegro', 'Moyano', 'Nieva', 'Ojeda', 'Olivera',
    'Paz', 'Peralta', 'Pereyra', 'Pérez', 'Quiroga', 'Ramírez', 'Ríos', 'Rivero',
    'Rodríguez', 'Rojas', 'Romero', 'Ruiz', 'Salinas', 'Sánchez', 'Sosa', 'Suárez',
    'Tapia', 'Torres', 'Vega', 'Villalba', 'Zárate',
];

/**
 * Apellidos británicos e irlandeses. Son minoría, pero existen de verdad y en el
 * rugby argentino pesan más que en la población general: salen de los colegios y
 * los clubes fundadores. Se los mezcla en proporción, no a partes iguales.
 */
const SURNAMES_BRITANICOS: readonly string[] = [
    'Bennett', 'Blake', 'Brown', 'Cullen', 'Davies', 'Dillon', 'Duggan',
    'Fitzgerald', 'Gallagher', 'Griffiths', 'Hogan', 'Kelly', 'Lynch', 'Mackenzie',
    'Moore', 'Murphy', 'Nolan', 'Phelan', 'Powell', 'Roberts',
    'Ryan', 'Shaw', 'Sullivan', 'Thomson', 'Walsh', 'Ward', 'Williams', 'Young',
];

/**
 * El banco entero, con los criollos repetidos para que pesen ~7 a 1. Es una
 * lista y no un sorteo con pesos a propósito: así el llamador solo necesita un
 * `pick` uniforme y el reparto vive acá, que es donde se puede leer.
 */
export const SURNAMES: readonly string[] = [
    ...SURNAMES_CRIOLLOS,
    ...SURNAMES_CRIOLLOS,
    ...SURNAMES_CRIOLLOS,
    ...SURNAMES_CRIOLLOS,
    ...SURNAMES_CRIOLLOS,
    ...SURNAMES_CRIOLLOS,
    ...SURNAMES_CRIOLLOS,
    ...SURNAMES_BRITANICOS,
];

/** Nombres para el entrenador. Un DT de club tiene diez años más que el plantel. */
export const COACH_FIRST_NAMES: readonly string[] = [
    'Alberto', 'Alejandro', 'Carlos', 'Daniel', 'Eduardo', 'Fernando', 'Gustavo',
    'Horacio', 'Jorge', 'José', 'Luis', 'Marcelo', 'Mariano', 'Miguel', 'Néstor',
    'Osvaldo', 'Raúl', 'Ricardo', 'Roberto', 'Sergio', 'Walter',
];
