/*
 * Nombres ficticios de los jugadores, según de dónde viene cada selección.
 * Son combinaciones al azar de nombres y apellidos comunes de cada región:
 * no representan a jugadores reales. La semilla es el equipo, así un plantel
 * se llama siempre igual.
 */

import type { SevenTeam } from './teams';

interface Pool {
    first: string[];
    last: string[];
}

const P: Record<string, Pool> = {
    rio: {
        first: ['Facundo', 'Tomás', 'Joaquín', 'Santiago', 'Matías', 'Nicolás', 'Agustín', 'Lautaro', 'Bautista', 'Ignacio', 'Franco', 'Martín'],
        last: ['Ferreyra', 'Aguirre', 'Bustos', 'Correa', 'Domínguez', 'Ledesma', 'Medina', 'Olivera', 'Quiroga', 'Sosa', 'Vera', 'Zárate', 'Cabral', 'Ojeda', 'Paredes', 'Villalba'],
    },
    latam: {
        first: ['Andrés', 'Felipe', 'Sebastián', 'Diego', 'Cristian', 'Camilo', 'Javier', 'Esteban', 'Luis', 'Raúl', 'Óscar', 'Mauricio'],
        last: ['Rojas', 'Muñoz', 'Castillo', 'Vargas', 'Espinoza', 'Salazar', 'Cárdenas', 'Mendoza', 'Herrera', 'Guzmán', 'Montoya', 'Peralta', 'Arias', 'Navarro', 'Fuentes', 'Pizarro'],
    },
    luso: {
        first: ['João', 'Pedro', 'Rafael', 'Tiago', 'Gonçalo', 'Duarte', 'Lucas', 'Bruno', 'Vasco', 'Rodrigo', 'Caio', 'Henrique'],
        last: ['Almeida', 'Carvalho', 'Pereira', 'Teixeira', 'Moreira', 'Barbosa', 'Rocha', 'Nogueira', 'Pinto', 'Lopes', 'Correia', 'Azevedo', 'Campos', 'Freitas', 'Magalhães', 'Sardinha'],
    },
    iber: {
        first: ['Álvaro', 'Pablo', 'Jaime', 'Iñaki', 'Unai', 'Marc', 'Jordi', 'Gonzalo', 'Rubén', 'Adrián', 'Íker', 'Sergio'],
        last: ['Etxeberria', 'Gutiérrez', 'Ibarra', 'Lozano', 'Martí', 'Ortega', 'Prieto', 'Salinas', 'Urrutia', 'Vidal', 'Zubiri', 'Arrieta', 'Bravo', 'Calvo', 'Garrido', 'Iglesias'],
    },
    anglo: {
        first: ['Jack', 'Harry', 'Oliver', 'George', 'Sam', 'Ben', 'Will', 'Tom', 'Josh', 'Luke', 'Matt', 'Dan'],
        last: ['Barker', 'Cole', 'Dawson', 'Fletcher', 'Granger', 'Holt', 'Kemp', 'Lambert', 'Marsh', 'Norris', 'Payne', 'Reeve', 'Shaw', 'Tate', 'Walsh', 'Whitley'],
    },
    celta: {
        first: ['Ciarán', 'Conor', 'Rhys', 'Gethin', 'Ewan', 'Callum', 'Dafydd', 'Seán', 'Fraser', 'Owain', 'Rory', 'Niall'],
        last: ['Gallagher', 'Kerrigan', 'McAllister', 'Moynihan', 'Pritchard', 'Rees', 'Llewellyn', 'Fitzgerald', 'MacLeod', 'Dunne', 'Hughes', 'Gillespie', 'Brennan', 'Morgan', 'Cullen', 'Duncan'],
    },
    franco: {
        first: ['Antoine', 'Baptiste', 'Clément', 'Hugo', 'Louis', 'Maxime', 'Romain', 'Théo', 'Julien', 'Arthur', 'Mathis', 'Quentin'],
        last: ['Berthelot', 'Castaing', 'Delmas', 'Fabre', 'Garnier', 'Lacombe', 'Marchand', 'Pujol', 'Roussel', 'Vidaillac', 'Bonnet', 'Laporte', 'Mercier', 'Soulié', 'Tessier', 'Verdier'],
    },
    italo: {
        first: ['Luca', 'Matteo', 'Lorenzo', 'Federico', 'Giacomo', 'Tommaso', 'Andrea', 'Simone', 'Riccardo', 'Davide', 'Marco', 'Pietro'],
        last: ['Bianchi', 'Colombo', 'De Santis', 'Ferraro', 'Galli', 'Lombardi', 'Moretti', 'Rinaldi', 'Sartori', 'Vitale', 'Zanetti', 'Barbieri', 'Caruso', 'Fontana', 'Marino', 'Testa'],
    },
    germ: {
        first: ['Lukas', 'Jonas', 'Felix', 'Leon', 'Niklas', 'Moritz', 'Paul', 'Jan', 'Tim', 'Florian', 'Maximilian', 'Erik'],
        last: ['Becker', 'Hoffmann', 'Krause', 'Lehmann', 'Meier', 'Neumann', 'Schäfer', 'Vogel', 'Wagner', 'Zimmer', 'Brandt', 'Fuchs', 'Haas', 'Keller', 'Peters', 'Roth'],
    },
    nordic: {
        first: ['Mikkel', 'Oskar', 'Emil', 'Elias', 'Anton', 'Viktor', 'Aksel', 'Rasmus', 'Henrik', 'Mats', 'Juho', 'Kristian'],
        last: ['Andersen', 'Berg', 'Dahl', 'Holm', 'Lindqvist', 'Nyberg', 'Sandvik', 'Virtanen', 'Lund', 'Strand', 'Eklund', 'Hagen', 'Korhonen', 'Nygaard', 'Sørensen', 'Tamm'],
    },
    eslavo: {
        first: ['Marko', 'Ivan', 'Luka', 'Petr', 'Tomáš', 'Nikola', 'Dmytro', 'Andrii', 'Stefan', 'Matej', 'Vuk', 'Jonas'],
        last: ['Novák', 'Horvat', 'Kovačević', 'Petrović', 'Marković', 'Dvořák', 'Kovalenko', 'Bondarenko', 'Jovanović', 'Kazlauskas', 'Krasniqi', 'Popović', 'Šimić', 'Vuković', 'Zelenko', 'Hrubý'],
    },
    georgia: {
        first: ['Giorgi', 'Levan', 'Luka', 'Beka', 'Davit', 'Nika', 'Lasha', 'Sandro', 'Tornike', 'Vakhtang', 'Mamuka', 'Shalva'],
        last: ['Abuladze', 'Beridze', 'Chikvaidze', 'Gelashvili', 'Kapanadze', 'Lomidze', 'Maisuradze', 'Nozadze', 'Tsiklauri', 'Kvirikashvili', 'Jgenti', 'Gogichadze', 'Mchedlidze', 'Sharvashidze', 'Dolidze', 'Tabatadze'],
    },
    rumano: {
        first: ['Andrei', 'Mihai', 'Ionuț', 'Florin', 'Alexandru', 'Cosmin', 'Vlad', 'Radu', 'Sorin', 'Dragoș', 'Marius', 'Ovidiu'],
        last: ['Popescu', 'Ionescu', 'Dumitrescu', 'Stan', 'Munteanu', 'Rusu', 'Ciobanu', 'Lungu', 'Toma', 'Moldovan', 'Barbu', 'Nistor', 'Oprea', 'Sârbu', 'Vasile', 'Zamfir'],
    },
    griego: {
        first: ['Giorgos', 'Nikos', 'Dimitris', 'Kostas', 'Yannis', 'Christos', 'Andreas', 'Stelios', 'Panos', 'Michalis', 'Vasilis', 'Petros'],
        last: ['Papadopoulos', 'Georgiou', 'Konstantinou', 'Nikolaidis', 'Christodoulou', 'Ioannou', 'Karagiannis', 'Makris', 'Pappas', 'Antoniou', 'Vlachos', 'Stavrou', 'Theodorou', 'Kyriakou', 'Lambrou', 'Sotiriou'],
    },
    turco: {
        first: ['Emre', 'Burak', 'Mert', 'Can', 'Kerem', 'Arda', 'Barış', 'Onur', 'Tolga', 'Serkan', 'Deniz', 'Umut'],
        last: ['Yılmaz', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Kılıç', 'Koç', 'Kaya', 'Aksoy', 'Erdem', 'Polat', 'Tekin', 'Yavuz'],
    },
    hebreo: {
        first: ['Noam', 'Itai', 'Omer', 'Yonatan', 'Eitan', 'Ariel', 'Daniel', 'Guy', 'Tomer', 'Amit', 'Ido', 'Lior'],
        last: ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton', 'Friedman', 'Azulay', 'Katz', 'Shapiro', 'Ben-David', 'Golan', 'Hadad', 'Navon', 'Oren', 'Segal', 'Tal'],
    },
    pacifico: {
        first: ['Sione', 'Viliami', 'Semi', 'Josaia', 'Tevita', 'Ioane', 'Filipo', 'Mosese', 'Waisea', 'Losi', 'Pita', 'Taniela'],
        last: ['Tuilagi', 'Vainikolo', 'Ratuva', 'Nakarawa', 'Fifita', 'Faleolo', 'Tupou', 'Leota', 'Vunipola', 'Naivalu', 'Mataele', 'Seiuli', 'Taufa', 'Koroibete', 'Lealaiauloto', 'Havili'],
    },
    japon: {
        first: ['Kenta', 'Yuto', 'Haruto', 'Daiki', 'Shota', 'Ryo', 'Takumi', 'Kaito', 'Sora', 'Riku', 'Naoki', 'Yuki'],
        last: ['Tanaka', 'Suzuki', 'Watanabe', 'Kobayashi', 'Yamamoto', 'Nakamura', 'Saito', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Mori', 'Ikeda', 'Hashimoto', 'Ogawa'],
    },
    hk: {
        first: ['Ka-ho', 'Wing', 'Chun', 'Tom', 'Max', 'Ryan', 'Kit', 'Jamie', 'Hon', 'Ethan', 'Lok', 'Alex'],
        last: ['Chan', 'Wong', 'Leung', 'Lau', 'Cheung', 'Ho', 'Ng', 'Tse', 'Hamilton', 'Brook', 'Lam', 'Yip', 'Fung', 'Kwok', 'Mok', 'Barlow'],
    },
    sudafrica: {
        first: ['Pieter', 'Ruan', 'Sipho', 'Thabo', 'Jaco', 'Lwazi', 'Kwagga', 'Bongi', 'Siya', 'Morné', 'Andile', 'Wian'],
        last: ['Van der Merwe', 'Botha', 'Nkosi', 'Mthembu', 'Du Plessis', 'Pretorius', 'Ndlovu', 'Jansen', 'Mokoena', 'Kruger', 'Dlamini', 'Steyn', 'Coetzee', 'Zulu', 'Venter', 'Malherbe'],
    },
    africa: {
        first: ['Tendai', 'Brian', 'Collins', 'Kevin', 'Tinashe', 'Dennis', 'Eric', 'Farai', 'Alvin', 'Kudzai', 'Jacob', 'Nelson'],
        last: ['Odhiambo', 'Mwangi', 'Otieno', 'Kamau', 'Moyo', 'Chikwanha', 'Mutasa', 'Wekesa', 'Ochieng', 'Ndoro', 'Gumbo', 'Kariuki', 'Nyoni', 'Mbugua', 'Sibanda', 'Wanyama'],
    },
    africaFr: {
        first: ['Moussa', 'Ibrahima', 'Koffi', 'Serge', 'Amadou', 'Yao', 'Cheikh', 'Didier', 'Mamadou', 'Franck', 'Ousmane', 'Arnaud'],
        last: ['Diallo', 'Koné', 'Traoré', 'Ndiaye', 'Kouassi', 'Diop', 'Bamba', 'Sow', 'Yao', 'Coulibaly', 'Faye', 'Konan', 'Sarr', 'Touré', 'Gueye', 'Kouamé'],
    },
    magreb: {
        first: ['Karim', 'Yacine', 'Mehdi', 'Sofiane', 'Amine', 'Bilal', 'Nassim', 'Rayan', 'Walid', 'Samir', 'Anis', 'Hakim'],
        last: ['Benali', 'Haddad', 'Mansouri', 'Belkacem', 'Saidi', 'Boudiaf', 'Kaci', 'Brahimi', 'Meziane', 'Amrani', 'Cherif', 'Hamidi', 'Bouzid', 'Taleb', 'Rahmani', 'Ziani'],
    },
    namibia: {
        first: ['Johan', 'Gerhard', 'Petrus', 'Tjiuee', 'Wian', 'Divan', 'Riaan', 'Le Roux', 'Andre', 'Cliven', 'Danco', 'Hanru'],
        last: ['van Wyk', 'Steenkamp', 'Tjituka', 'Loubser', 'Kasera', 'de Klerk', 'Swanepoel', 'Hamukwaya', 'Malgas', 'Greeff', 'Uanivi', 'Nortje', 'Kotze', 'Shipanga', 'Theron', 'Mouton'],
    },
    corea: {
        first: ['Min-jun', 'Seo-jun', 'Ji-ho', 'Hyun-woo', 'Jae-won', 'Dong-hyun', 'Sung-min', 'Tae-yang', 'Joon-ho', 'Woo-jin', 'Sang-hoon', 'Kyung-soo'],
        last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin', 'Kwon', 'Hwang'],
    },
    malasia: {
        first: ['Ahmad', 'Faiz', 'Hafiz', 'Amirul', 'Izzat', 'Danial', 'Syafiq', 'Kumar', 'Wei Jie', 'Arif', 'Zul', 'Haziq'],
        last: ['Abdullah', 'Rahman', 'Ismail', 'Hassan', 'Tan', 'Lim', 'Rajan', 'Yusof', 'Osman', 'Ibrahim', 'Wong', 'Hamzah', 'Razak', 'Nair', 'Aziz', 'Salleh'],
    },
    golfo: {
        first: ['Omar', 'Saeed', 'Ben', 'Khalid', 'Tom', 'Rashid', 'Callum', 'Hamad', 'Josh', 'Faisal', 'Liam', 'Sultan'],
        last: ['Al Mansoori', 'Al Shamsi', 'Hughes', 'Al Mazrouei', 'Clarke', 'Al Ketbi', 'Davies', 'Al Dhaheri', 'Murphy', 'Al Nuaimi', 'Ward', 'Al Hammadi', 'Shaw', 'Al Suwaidi', 'Price', 'Al Falasi'],
    },
    neer: {
        first: ['Daan', 'Bram', 'Sem', 'Lars', 'Thijs', 'Ruben', 'Jesse', 'Niels', 'Stijn', 'Wouter', 'Joost', 'Koen'],
        last: ['de Jong', 'Jansen', 'de Vries', 'van den Berg', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Dijk', 'Kuipers'],
    },
};

const POOL_BY_CODE: Record<string, keyof typeof P> = {
    ARG: 'rio', URU: 'rio', PAR: 'rio',
    CHI: 'latam', COL: 'latam', PER: 'latam', ECU: 'latam', VEN: 'latam', GUA: 'latam', HON: 'latam', DOM: 'latam',
    BRA: 'luso', POR: 'luso',
    ESP: 'iber', AND: 'iber', GIB: 'iber',
    ENG: 'anglo', USA: 'anglo', CAN: 'anglo', AUS: 'anglo', NZL: 'anglo',
    IRL: 'celta', SCO: 'celta', WAL: 'celta',
    FRA: 'franco', BEL: 'franco', LUX: 'franco',
    ITA: 'italo', MLT: 'italo',
    GER: 'germ', AUT: 'germ',
    DEN: 'nordic', SWE: 'nordic', NOR: 'nordic', FIN: 'nordic', EST: 'nordic',
    CZE: 'eslavo', CRO: 'eslavo', SLO: 'eslavo', SRB: 'eslavo', MNE: 'eslavo', BUL: 'eslavo', UKR: 'eslavo', LTU: 'eslavo', KOS: 'eslavo',
    GEO: 'georgia',
    ROU: 'rumano', MDA: 'rumano',
    GRE: 'griego', CYP: 'griego',
    TUR: 'turco',
    ISR: 'hebreo',
    FIJ: 'pacifico', SAM: 'pacifico', TGA: 'pacifico',
    JPN: 'japon',
    HKG: 'hk',
    RSA: 'sudafrica',
    ZIM: 'africa', KEN: 'africa', UGA: 'africa', ZAM: 'africa',
    NAM: 'namibia', ALG: 'magreb', CIV: 'africaFr', SEN: 'africaFr',
    KOR: 'corea', MAS: 'malasia', UAE: 'golfo',
    NED: 'neer', SUI: 'germ',
};

/** Puestos del seven, del 1 al 7. El 7 es el que defiende de fullback. */
export const POSITIONS = ['Pilar', 'Hooker', 'Pilar', 'Medio scrum', 'Apertura', 'Centro', 'Wing'];

function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

export interface PlayerName {
    first: string;
    last: string;
    short: string; // "F. Ferreyra", para el marcador
}

const cache = new Map<string, PlayerName[]>();

const poolOf = (team: SevenTeam): Pool => {
    const code = team.id.startsWith('nat-') ? team.id.slice(4).toUpperCase() : '';
    return P[(team.namePool && P[team.namePool] ? team.namePool : null) ?? POOL_BY_CODE[code] ?? 'rio'];
};

/** Un nombre del país del equipo a partir de una semilla (los que llegan a reemplazar a un retirado). */
export function nameFromSeed(team: SevenTeam, seed: string): PlayerName {
    const pool = poolOf(team);
    const r = seeded(hash(seed));
    const first = pool.first[Math.floor(r() * pool.first.length)];
    const last = pool.last[Math.floor(r() * pool.last.length)];
    return { first, last, short: `${first[0]}. ${last}` };
}

/** Arma un nombre a partir de lo que escribió el usuario ("Nombre Apellido"). */
export function nameFromText(text: string): PlayerName {
    const parts = text.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: '', last: '', short: '' };
    if (parts.length === 1) return { first: '', last: parts[0], short: parts[0] };
    const [first, ...rest] = parts;
    const last = rest.join(' ');
    return { first, last, short: `${first[0]}. ${last}` };
}

/** Los siete nombres de un equipo, siempre los mismos para el mismo equipo (salvo que traiga su plantel). */
export function playerNames(team: SevenTeam): PlayerName[] {
    if (team.names?.length === 7) return team.names;
    return defaultNames(team);
}

/** Los nombres de fábrica del equipo, sin plantel propio. */
export function defaultNames(team: SevenTeam): PlayerName[] {
    const hit = cache.get(team.id);
    if (hit) return hit;
    const pool = poolOf(team);
    const r = seeded(hash(team.id));
    const used = new Set<string>();
    const names = Array.from({ length: 7 }, () => {
        let last = pool.last[Math.floor(r() * pool.last.length)];
        for (let tries = 0; used.has(last) && tries < 20; tries++) last = pool.last[Math.floor(r() * pool.last.length)];
        used.add(last);
        const first = pool.first[Math.floor(r() * pool.first.length)];
        return { first, last, short: `${first[0]}. ${last}` };
    });
    cache.set(team.id, names);
    return names;
}
