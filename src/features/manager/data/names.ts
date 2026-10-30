import { random } from '../utils/entropy.ts'
// Pools de nombres y apellidos por país.

export const FIRST_NAMES_ES = [
  'Mateo','Diego','Hugo','Iker','Javier','Pablo','Adrián','Marc','Pol','Bruno',
  'Leo','Nico','Alex','Daniel','Sergio','David','Lucas','Pau','Aitor','Eric',
  'Iván','Carlos','Andrés','Manu','Raúl','Miguel','Joaquín','Asier','Unai','Xavi',
  'Álvaro','Roberto','Gerard','Iago','Joel','Borja','Cristian','Jaime','Nacho',
  'Aaron','Rodrigo','Telmo','Saúl','Fernando','Ignacio','Lautaro','Mikel','Antón','Hector'
]
export const LAST_NAMES_ES = [
  'García','Martínez','López','Sánchez','González','Rodríguez','Fernández','Pérez','Gómez','Ruiz',
  'Hernández','Jiménez','Díaz','Moreno','Álvarez','Romero','Alonso','Gutiérrez','Navarro','Torres',
  'Domínguez','Vázquez','Ramos','Gil','Ramírez','Serrano','Blanco','Suárez','Castro','Ortega',
  'Rubio','Marín','Sanz','Núñez','Iglesias','Medina','Cortés','Garrido','Castillo','Santos',
  'Lozano','Guerrero','Cano','Prieto','Méndez','Cruz','Calvo','Gallego','Vidal','León'
]

export const FIRST_NAMES_FR = [
  'Antoine','Baptiste','Clément','Damien','Étienne','François','Gabriel','Hugo','Julien','Léo',
  'Mathieu','Nicolas','Olivier','Pierre','Quentin','Romain','Sébastien','Thibault','Vincent','Yann',
  'Arthur','Benjamin','Cédric','David','Émile','Florian','Grégoire','Jean','Lucas','Maxime',
  'Paul','Raphaël','Sylvain','Théo','Valentin','Xavier','Adrien','Bastien','Charles','Dimitri'
]
export const LAST_NAMES_FR = [
  'Dupont','Martin','Bernard','Petit','Robert','Richard','Durand','Dubois','Moreau','Laurent',
  'Simon','Michel','Lefebvre','Leroy','Roux','David','Bertrand','Morel','Fournier','Girard',
  'Bonnet','Dupuis','Lambert','Fontaine','Rousseau','Vincent','Muller','Henry','Mercier','Boyer',
  'Garnier','Faure','Lemaire','Marchand','Aubry','Carpentier','Caron','Olivier','Picard','Roche'
]

export const FIRST_NAMES_EN = [
  'James','John','Robert','Michael','William','David','Richard','Charles','Joseph','Thomas',
  'Christopher','Daniel','Paul','Mark','Donald','Steven','Andrew','Kenneth','Joshua','Kevin',
  'Brian','George','Edward','Ronald','Timothy','Jason','Jeffrey','Ryan','Jacob','Gary',
  'Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon','Frank','Benjamin'
]
export const LAST_NAMES_EN = [
  'Smith','Johnson','Williams','Brown','Jones','Miller','Davis','Wilson','Anderson','Taylor',
  'Thomas','Moore','Martin','Jackson','Thompson','White','Harris','Clark','Lewis','Walker',
  'Robinson','Wright','Scott','Green','Adams','Baker','Hall','Allen','Nelson','Hill',
  'King','Carter','Mitchell','Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards'
]

export type CountryCode = 'ESP' | 'FRA' | 'ENG'

export function randomFullName(country: CountryCode): { firstName: string; lastName: string } {
  const pools = {
    ESP: { first: FIRST_NAMES_ES, last: LAST_NAMES_ES },
    FRA: { first: FIRST_NAMES_FR, last: LAST_NAMES_FR },
    ENG: { first: FIRST_NAMES_EN, last: LAST_NAMES_EN }
  }
  const p = pools[country]
  return {
    firstName: p.first[Math.floor(random() * p.first.length)],
    lastName: p.last[Math.floor(random() * p.last.length)]
  }
}

// Compat: alias para llamadas existentes
export function randomFullNameES() { return randomFullName('ESP') }

export const FIRST_NAMES_IE = [
  'Conor','Cian','Sean','Jamie','Ronan','Tadhg','Johnny','Niall','Rory','Iain',
  'Bundee','Joey','Jack','James','Peter','Andrew','Garry','Robbie','Keith','Caelan'
]
export const LAST_NAMES_IE = [
  'Murphy','Kelly','Walsh','Byrne','Ryan','Doyle','Reilly','Lynch','Daly','Brennan',
  'Sexton','Murray','Earls','Conan','Henderson','Furlong','Healy','Best','Heaslip','Stander'
]

export const FIRST_NAMES_SCO = [
  'Finn','Stuart','Ali','Hamish','Duncan','Greig','Stuart','Sam','Chris','Pete',
  'Rory','Magnus','Sione','Darcy','Cameron','Adam','Jack','Ben','Matt','Jonny'
]
export const LAST_NAMES_SCO = [
  'Russell','Hogg','Price','Watson','Taylor','Gray','Maitland','Johnson','Harris','Horne',
  'Sutherland','Bradbury','Fagerson','Tuipulotu','Ritchie','Hastings','Cumming','Toolis','Schoeman','Graham'
]

export const FIRST_NAMES_WAL = [
  'Dan','Liam','Gareth','Rhys','Owen','Alun','Justin','Leigh','Ken','Jonathan',
  'Tomos','Taulupe','Aaron','Josh','Adam','Will','Nick','Louis','Cory','Dewi'
]
export const LAST_NAMES_WAL = [
  'Biggar','Williams','Owens','Davies','Halfpenny','Wyn','Tipuric','Anscombe','Lewis','Adams',
  'Faletau','Beard','Dee','Hardy','Tompkins','Rowlands','Hill','Reynolds','Hawkins','Lake'
]

export const FIRST_NAMES_ITA = [
  'Matteo','Tommaso','Luca','Federico','Pierre','Stephen','Ange','Sebastian','Danilo','Niccolò',
  'Manuel','Marco','Giacomo','Edoardo','Lorenzo','Ivan','Cherif','Paolo','Juan','Hame'
]
export const LAST_NAMES_ITA = [
  'Allan','Negri','Bigi','Cannone','Garbisi','Lucchin','Capuozzo','Padovani','Fischetti','Brex',
  'Zuliani','Fusco','Nicotera','Iachizzi','Cannone','Nemer','Traore','Garbisi','Ignacio','Faiva'
]

// Sudáfrica
export const FIRST_NAMES_ZAF = [
  'Siya','Eben','Pieter','Handre','Damian','Cheslin','Makazole','Lukhanyo','Malcolm','Faf',
  'Cobus','Steven','Frans','Bongi','Trevor','Willie','Duane','Marvin','Kurt','Manie'
]
export const LAST_NAMES_ZAF = [
  'Kolisi','Etzebeth','Steyn','Pollard','de Allende','Kolbe','Mapimpi','Am','Marx','de Klerk',
  'Reinach','Kitshoff','Malherbe','Mbonambi','Nyakane','le Roux','Vermeulen','Orie','Coetzee','Libbok'
]

// Nueva Zelanda
export const FIRST_NAMES_NZL = [
  'Beauden','Richie','Ardie','Sam','Aaron','Codie','Damian','Caleb','Sevu','Will',
  'Jordie','Scott','Patrick','Anton','TJ','Brodie','Rieko','Tyrel','Ofa','Asafo'
]
export const LAST_NAMES_NZL = [
  'Barrett','McCaw','Savea','Cane','Smith','Taylor','McKenzie','Clarke','Reece','Jordan',
  'Mounga','Robertson','Tuipulotu','Lienert-Brown','Perenara','Retallick','Ioane','Lomax','Tuungafasi','Aumua'
]

// Australia
export const FIRST_NAMES_AUS = [
  'Michael','James','David','Marika','Quade','Bernard','Tate','Nic','Hunter','Allan',
  'Tom','Will','Jordan','Andrew','Nick','Rob','Lukhan','Pete','Harry','Folau'
]
export const LAST_NAMES_AUS = [
  'Hooper','Slipper','Pocock','Koroibete','Cooper','Foley','McDermott','White','Paisami','Alaalatoa',
  'Banks','Skelton','Petaia','Kellaway','Frost','Valetini','Tupou','Samu','Salakaia-Loto','Faingaa'
]

// Argentina
export const FIRST_NAMES_ARG = [
  'Agustín','Tomás','Pablo','Nicolás','Emiliano','Matías','Santiago','Juan Martín','Marcos','Julián',
  'Facundo','Joaquín','Bautista','Jerónimo','Lucas','Mateo','Felipe','Rodrigo','Federico','Gonzalo'
]
export const LAST_NAMES_ARG = [
  'Creevy','Cubelli','Matera','Sánchez','Boffelli','Mallía','Carreras','Petti','Kremer','Montoya',
  'Gallo','Cancelliere','Moroni','Bruni','Tetaz Chaparro','Delguy','Orlando','Lavanini','Bertranou','Imhoff'
]

// Japón
export const FIRST_NAMES_JPN = [
  'Kazuki','Yutaka','Takuya','Ryohei','Kotaro','Michael','Shota','Lomano','Kenki','Tevita',
  'Atsushi','Yu','Naoto','Pieter','Amato','Jiwon','Koo','Faulua','Wimpie','Dylan'
]
export const LAST_NAMES_JPN = [
  'Himeno','Nagare','Yamanaka','Hatakeyama','Matsushima','Leitch','Horie','Lavemai','Fakatava','Labuschagne',
  'Sakate','Tatekawa','Hashimoto','Mafi','Saumaki','Inagaki','Riley','van der Walt','Mounga','Tameifuna'
]

// USA
export const FIRST_NAMES_USA = [
  'Blaine','Bryce','MJ','Mike','Marcel','Cam','Joe','Greg','Hanco','AJ',
  'Will','Chris','Nate','Paul','David','Eric','Ben','Sam','Andrew','Ryan'
]
export const LAST_NAMES_USA = [
  'Scully','Campbell','Skene','Teo','Brache','Dolan','Taufetee','Peterson','Germishuys','MacGinty',
  'Hooley','Mulchrone','Augspurger','Lasike','Ailor','Quill','Pinkelman','Schaffel','Welch','Matyas'
]

// Fiji
export const FIRST_NAMES_FIJ = [
  'Semi','Levani','Waisea','Tevita','Frank','Albert','Josua','Vinaya','Tomas','Eroni',
  'Peceli','Mesake','Manasa','Apisai','Sireli','Kini','Viliame','Setareki','Lekima','Bill'
]
export const LAST_NAMES_FIJ = [
  'Radradra','Botia','Nayacalevu','Cuirilo','Lomani','Tuisova','Tagicakibau','Karawalevu','Botitu','Sau',
  'Yato','Doge','Saulo','Naqalevu','Maqala','Murimurivalu','Mata','Tuicuvu','Tagitagivalu','Matai'
]

// Samoa
export const FIRST_NAMES_SAM = [
  'Manu','Tim','Christian','Henry','Jonathan','Theo','Sama','Steven','Logo','UJ',
  'Michael','Charlie','Danny','Rey','Ben','Olajuwon','Lima','Alapati','Niko','Belgium'
]
export const LAST_NAMES_SAM = [
  'Tuilagi','Nanai-Williams','Lealiifano','Taefu','Taumateine','McFarland','Malolo','Luatua','Ole','Seuteni',
  'Alaalatoa','Faleafaga','Toala','Lee-Lo','Lam','Faasalele','Sopoaga','Leiua','Matavesi','Tavita'
]

// Tonga
export const FIRST_NAMES_TGA = [
  'Vaea','Sonatane','Telusa','Kurt','Soane','Sione','Solomone','Pita','William','Latu',
  'Charles','David','James','Inoke','Cooper','Salesi','Toa','Adam','Halaifonua','Sosefo'
]
export const LAST_NAMES_TGA = [
  'Fifita','Takulua','Veainu','Morath','Tongauiha','Vailanu','Kafatolu','Ahki','Halaifonua','Filise',
  'Piutau','Vaipulu','Faiva','Mafi','Vuna','Maafu','Halafihi','Coleman','Lokotui','Sefo'
]

// Georgia
export const FIRST_NAMES_GEO = [
  'Mamuka','Davit','Beka','Merab','Gela','Lasha','Mikheil','Giorgi','Tornike','Sandro',
  'Vasil','Otar','Levan','Akaki','Anzor','Demur','Soso','Irakli','Tedo','Zurab'
]
export const LAST_NAMES_GEO = [
  'Gorgodze','Niniashvili','Saghinadze','Sharikadze','Aprasidze','Khmaladze','Babunashvili','Magradze','Jalagonia','Mamukashvili',
  'Lobzhanidze','Giorgadze','Chilachava','Tabutsadze','Sutiashvili','Tsutskiridze','Tepnadze','Bregvadze','Akhaladze','Asieshvili'
]

// Rumanía
export const FIRST_NAMES_ROU = [
  'Florin','Mihai','Stefan','Vlad','Adrian','Catalin','Tudor','Marius','Cristian','Alexandru',
  'Andrei','Dan','Petre','Daniel','Razvan','Constantin','Bogdan','Ionut','Florian','Ovidiu'
]
export const LAST_NAMES_ROU = [
  'Popescu','Ionescu','Constantinescu','Dumitru','Munteanu','Vasile','Tudor','Cristea','Manole','Mocanu',
  'Vlaicu','Dumbrava','Calafeteanu','Radulescu','Lemnaru','Carpo','Roman','Mitu','Plai','Ursache'
]

// Uruguay
export const FIRST_NAMES_URU = [
  'Andrés','Felipe','Manuel','Nicolás','Santiago','Mateo','Joaquín','Diego','German','Juan',
  'Pablo','Agustín','Tomas','Rodrigo','Ignacio','Federico','Lucas','Bautista','Gastón','Hernán'
]
export const LAST_NAMES_URU = [
  'Vilaseca','Berchesi','Etcheverry','Diana','Civetta','Cardoso','Magno','Ardao','Kessler','Sagario',
  'Inciarte','Gibernau','Bulanti','Klappenbach','Etcheverria','Pujadas','Mieres','Arbelo','Ormaechea','Sosa'
]

// Chile
export const FIRST_NAMES_CHI = [
  'Rodrigo','Matías','Felipe','Domingo','Sebastián','Salvador','José','Marcelo','Cristóbal','Vittorio',
  'Diego','Tomás','Iñaki','Pablo','Augusto','Lukas','Santiago','Benjamín','Javier','Martín'
]
export const LAST_NAMES_CHI = [
  'Saavedra','Garafulic','Brandes','Burdiles','Lues','Larenas','Vidal','Lobos','Lagos','Trecek',
  'Carrasco','Dittus','Silva','Bohme','Saldias','Videla','Urroz','Sigren','Strauch','Pais'
]

// Pool genérico para naciones sin pool específico
export const FIRST_NAMES_GEN = [
  'Aleksi','Andrei','Carlos','Dmitri','Erik','Felix','Hans','Ivan','Jakob','Lars',
  'Mikael','Nils','Oskar','Pavel','Rasmus','Sergei','Tomas','Viktor','Wei','Yusuf'
]
export const LAST_NAMES_GEN = [
  'Andersson','Becker','Cohen','Dvorak','Eriksson','Fischer','Gomes','Hansen','Ivanov','Janssen',
  'Kowalski','Lindberg','Muller','Nielsen','Olsen','Petrov','Schmidt','Tanaka','Volkov','Zhang'
]

export type NatlCountryCode =
  | 'IRL' | 'SCO' | 'WAL' | 'ITA' | 'ZAF'
  | 'NZL' | 'AUS' | 'ARG' | 'JPN' | 'USA'
  | 'FIJ' | 'SAM' | 'TGA' | 'GEO' | 'ROU'
  | 'URU' | 'CHI' | 'GEN'

export function randomNationalName(code: NatlCountryCode): { firstName: string; lastName: string } {
  const pools: Record<NatlCountryCode, { first: string[]; last: string[] }> = {
    IRL: { first: FIRST_NAMES_IE, last: LAST_NAMES_IE },
    SCO: { first: FIRST_NAMES_SCO, last: LAST_NAMES_SCO },
    WAL: { first: FIRST_NAMES_WAL, last: LAST_NAMES_WAL },
    ITA: { first: FIRST_NAMES_ITA, last: LAST_NAMES_ITA },
    ZAF: { first: FIRST_NAMES_ZAF, last: LAST_NAMES_ZAF },
    NZL: { first: FIRST_NAMES_NZL, last: LAST_NAMES_NZL },
    AUS: { first: FIRST_NAMES_AUS, last: LAST_NAMES_AUS },
    ARG: { first: FIRST_NAMES_ARG, last: LAST_NAMES_ARG },
    JPN: { first: FIRST_NAMES_JPN, last: LAST_NAMES_JPN },
    USA: { first: FIRST_NAMES_USA, last: LAST_NAMES_USA },
    FIJ: { first: FIRST_NAMES_FIJ, last: LAST_NAMES_FIJ },
    SAM: { first: FIRST_NAMES_SAM, last: LAST_NAMES_SAM },
    TGA: { first: FIRST_NAMES_TGA, last: LAST_NAMES_TGA },
    GEO: { first: FIRST_NAMES_GEO, last: LAST_NAMES_GEO },
    ROU: { first: FIRST_NAMES_ROU, last: LAST_NAMES_ROU },
    URU: { first: FIRST_NAMES_URU, last: LAST_NAMES_URU },
    CHI: { first: FIRST_NAMES_CHI, last: LAST_NAMES_CHI },
    GEN: { first: FIRST_NAMES_GEN, last: LAST_NAMES_GEN }
  }
  const p = pools[code]
  return {
    firstName: p.first[Math.floor(random() * p.first.length)],
    lastName: p.last[Math.floor(random() * p.last.length)]
  }
}
