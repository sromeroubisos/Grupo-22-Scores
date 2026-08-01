// EL TEXTO DE LA INTERFAZ, EN LOS DOS IDIOMAS.
//
// Está tipado como `Record<Locale, UiStrings>` y no como un objeto suelto: si
// mañana se agrega una frase al español y se olvida el inglés, falla `tsc` en vez
// de aparecer en blanco en la pantalla.
//
// Lo que NO está acá es lo que emite el motor —eventos, arquetipos, hitos,
// ejes—: eso vive en `catalog.ts` y en `events/`, indexado por id. Acá va sólo lo
// que escribe un componente.
//
// Las frases con números van como FUNCIÓN y no con marcadores de posición
// (`{n} temporadas`): el plural del español y el del inglés no se resuelven
// igual, y una función deja que cada idioma haga la suya sin una librería de por
// medio.

import type { Locale } from './locale.ts';

export interface UiStrings {
    // ── Portada y navegación ─────────────────────────────────────────────────
    backToGames: string;
    eyebrow: string;
    gameTitle: string;
    lead: string;
    outdatedNotice: string;
    resuming: string;
    continueCareer: string;
    startCareer: string;
    startOver: string;
    confirmStartOverLabel: string;
    confirmStartOverText: string;
    deleteAndStartOver: string;
    cancel: string;
    languageLabel: string;

    // ── Tarjeta de partida guardada ──────────────────────────────────────────
    yearsOld: string;
    noSeasonsPlayed: string;
    seasonsCount: (n: number) => string;
    ovr: string;

    // ── Temporadas tranquilas ────────────────────────────────────────────────
    seasonNumber: (n: number) => string;
    seasonRange: (from: number, to: number) => string;
    quietSingle: string;
    quietSpan: (n: number) => string;
    playSeason: string;
    playSeasons: (n: number) => string;

    // ── Crear jugador ────────────────────────────────────────────────────────
    steps: readonly [string, string, string, string, string];
    createEyebrow: string;
    createTitle: string;
    createLead: string;
    stepCount: (current: number, total: number) => string;
    stepAria: (current: number, total: number, name: string) => string;
    identity: string;
    surname: string;
    surnamePlaceholder: string;
    surnameHint: string;
    pickYourNumber: string;
    nationality: string;
    position: string;
    tapPositionHint: string;
    pace: string;
    back: string;
    next: string;
    missingNationality: string;
    missingPosition: string;
    missingList: (parts: string[]) => string;
    stepMissingNationality: string;
    stepMissingPosition: string;
    paces: readonly { id: 'intense' | 'normal' | 'express'; label: string; text: string; tag: string }[];

    // ── Club de inicio ───────────────────────────────────────────────────────
    startClub: string;
    startClubRandom: string;
    startClubRandomText: string;
    startClubChoose: string;
    startClubChooseText: string;
    startClubNoLadder: string;
    startClubPickFirst: string;
    startClubChange: string;
    pickClubTitle: string;
    pickClubLead: string;
    searchClub: string;
    noClubMatches: string;
    clubsFound: (n: number) => string;
    useThisClub: string;

    // ── Selector de país ─────────────────────────────────────────────────────
    searchCountry: string;
    noCountryMatches: string;
    countriesFound: (n: number) => string;
    moreCountries: (n: number) => string;
    seeMore: (n: number) => string;
    seeLess: string;

    // ── Tarjeta de decisión ──────────────────────────────────────────────────
    continueLabel: string;
    signFor: string;
    stayAt: string;
    noChanges: string;
    outcomeChance: string;

    // ── Cabecera ─────────────────────────────────────────────────────────────
    age: string;
    steppedUpSr: string;
    hideStatsAndLadder: string;
    showStatsAndLadder: string;
    matches: string;
    points: string;
    tries: string;
    tackles: string;
    tenureCounter: (n: number) => string;

    // ── Escalafón ────────────────────────────────────────────────────────────
    ladderTitle: string;
    steppedUp: string;
    youAreNow: (label: string) => string;
    hide: string;
    seeWhatYouGained: string;
    seeWhatChanges: string;
    inAcademyNote: string;
    academyFoot: (quality: number, load: number) => string;
    dimensions: readonly { key: 'trainingQuality' | 'trainingLoad' | 'recoverySupport' | 'medicalSupport' | 'lifeLoad'; label: string; inverted?: boolean; note?: string }[];

    // ── Espina ───────────────────────────────────────────────────────────────
    careerColumn: string;
    club: string;
    matchesPlayed: string;
    pickingClub: string;
    inPlay: string;
    notPlayedYet: (label: string) => string;
    clubChange: string;
    stepUp: string;
    champion: string;
    titlesCount: (n: number) => string;
    seriousInjury: string;
    leaguePlace: (place: number, teams: number) => string;
    promotedTo: (competition: string) => string;
    relegatedTo: (competition: string) => string;
    nationalStatus: Readonly<Record<'starter' | 'squad' | 'trial' | 'dropped' | 'none' | 'no-union', string>>;
    nationalNote: Readonly<Record<'starter' | 'squad' | 'trial' | 'dropped' | 'in-contention', string>>;
    noUnionNote: (country: string) => string;
    callUpGap: (points: number) => string;
    nationalHeading: (union: string, rank: number, total: number, movement: string) => string;
    rankMovement: (delta: number) => string;
    unionAbsence: (country: string, reason: 'suspendida' | 'sin-federacion') => string;
    nationalTitles: (n: number) => string;
    championWithCountry: string;
    careerTotals: string;
    caps: string;
    won: string;
    yearsLabel: string;

    // ── Resultado de temporada ───────────────────────────────────────────────
    seasonResultLabel: string;
    blockResultLabel: string;
    seasonTag: (n: number) => string;
    seasonRangeTag: (from: number, to: number) => string;
    atCeiling: string;
    promotionBadge: string;
    relegationBadge: string;
    clubChampionOf: (competition: string) => string;
    newClub: string;
    fromTo: (from: string, to: string) => string;
    seasonsAt: (n: number, club: string) => string;
    growthSeason: (club: string) => string;
    hardSeason: (club: string) => string;
    busySeason: (club: string) => string;
    anotherSeason: (club: string) => string;
    bestTestSeason: string;
    bestPointsHaul: string;
    bestTrySeason: string;
    bestTackleSeason: string;
    mostGameTime: string;

    // ── Retiro ───────────────────────────────────────────────────────────────
    careerOver: string;
    debutAndRetirement: (debut: number, retirement: number, reason: string) => string;
    goalPct: string;
    titles: string;
    peakOvr: string;
    seasons: string;
    honours: string;
    achievements: string;
    shareCareer: string;
    playAgain: string;

    // ── Capa de compartir ────────────────────────────────────────────────────
    shareDialogLabel: string;
    shareTitle: string;
    closeSummary: string;
    formatPickerLabel: string;
    formatFeed: string;
    formatStory: string;
    preparingImage: string;
    imageFailed: string;
    shareImage: string;
    downloadImage: string;
    linkCopied: string;
    copyLink: string;
    copyLinkManually: string;
    shareNote: string;
    shareSystemTitle: string;

    // ── Revelado ─────────────────────────────────────────────────────────────
    plusSr: string;
    minusSr: string;
    noOvrChange: string;

    // ── Festejos ─────────────────────────────────────────────────────────────
    celebrationChampion: string;
    celebrationFirstCap: string;
    celebrationSeniorSquad: string;
    celebrationStepUp: string;
    celebrationAward: string;
    /** Encabezado de la pantalla ÚNICA cuando la temporada dejó más de un festejo. */
    celebrationSeasonRecap: string;
    celebrationSeasonRecapSub: (age: number, count: number) => string;
    celebrationInternationalDebut: (age: number) => string;
    celebrationNoLongerAProspect: (age: number) => string;
    celebrationAgeAnd: (age: number, what: string) => string;

    // ── Tarjeta compartible ──────────────────────────────────────────────────
    cardSeasons: string;
    cardMatches: string;
    cardCaps: string;
    cardTitles: string;
    cardPeakOvr: string;
    cardPoints: string;
    cardGoalPct: string;
    cardSpan: (debut: number, retirement: number) => string;
    cardReceiptNotice: string;

    // ── Página pública del link compartido ───────────────────────────────────
    sharePageReplayNote: string;
    sharePageReceiptNote: string;
    sharePageCta: string;
    shareBrokenLinkTitle: string;
    shareBrokenLinkDetail: string;
    shareOldEngineTitle: string;
    shareOldEngineDetail: string;
    shareReplayFailedTitle: string;
    shareReplayFailedDetail: string;
    shareMetaDescription: (position: string, nationality: string, span: string) => string;

    // ── Metadatos de la página ───────────────────────────────────────────────
    pageTitle: string;
    pageDescription: string;
}

const ES: UiStrings = {
    backToGames: 'Volver a Juegos',
    eyebrow: 'Minijuegos',
    gameTitle: 'Carrera de Rugby',
    lead: 'Creá un jugador y llevá su carrera del debut al retiro.',
    outdatedNotice: 'El juego se actualizó y tu partida anterior no se puede seguir. Podés empezar una nueva.',
    resuming: 'Retomando tu carrera…',
    continueCareer: 'Continuar carrera',
    startCareer: 'Comenzar carrera',
    startOver: 'Empezar de nuevo',
    confirmStartOverLabel: 'Confirmar empezar de nuevo',
    confirmStartOverText: 'Empezar de nuevo borra la carrera guardada. No se puede deshacer.',
    deleteAndStartOver: 'Borrar y empezar de nuevo',
    cancel: 'Cancelar',
    languageLabel: 'Idioma',

    yearsOld: 'años',
    noSeasonsPlayed: 'Sin temporadas jugadas',
    seasonsCount: (n) => `${n} ${n === 1 ? 'temporada' : 'temporadas'}`,
    ovr: 'OVR',

    seasonNumber: (n) => `Temporada ${n}`,
    seasonRange: (from, to) => `Temporadas ${from} a ${to}`,
    quietSingle: 'Una temporada más de trabajo, sin grandes novedades fuera de la cancha.',
    quietSpan: (n) => `${n === 2 ? 'Dos' : n === 3 ? 'Tres' : n} temporadas de trabajo, sin decisiones a la vista. Si se abre el mercado, frenamos ahí.`,
    playSeason: 'Jugar temporada',
    playSeasons: (n) => `Jugar ${n === 2 ? 'dos' : n === 3 ? 'tres' : n} temporadas`,

    steps: ['Nacionalidad', 'Club', 'Posición', 'Identidad', 'Ritmo'],
    createEyebrow: 'Crear jugador',
    createTitle: 'Elegí y arrancá',
    createLead: 'Tu nombre, tu bandera, tu puesto y desde dónde arrancás.',
    stepCount: (current, total) => `${current} de ${total}`,
    stepAria: (current, total, name) => `Paso ${current} de ${total}: ${name}`,
    identity: 'Identidad',
    surname: 'Apellido',
    surnamePlaceholder: 'El de la camiseta',
    surnameHint: 'Opcional. Si lo dejás vacío, te ponemos uno.',
    pickYourNumber: 'Elegí tu número',
    nationality: 'Nacionalidad',
    position: 'Posición',
    tapPositionHint: 'Tocá el puesto en la cancha.',
    pace: 'Ritmo',
    back: 'Volver',
    next: 'Continuar',
    missingNationality: 'una nacionalidad',
    missingPosition: 'una posición',
    missingList: (parts) => `Elegí ${parts.slice(0, -1).join(', ')}${parts.length > 1 ? ' y ' : ''}${parts[parts.length - 1]}.`,
    stepMissingNationality: 'Elegí tu nacionalidad para seguir.',
    stepMissingPosition: 'Tocá tu puesto en la cancha para seguir.',
    paces: [
        { id: 'intense', label: 'Intensa', text: 'Una decisión por temporada. La carrera entera, año por año.', tag: '1 temporada' },
        { id: 'normal', label: 'Normal', text: 'Dos temporadas por decisión. Avanzás más rápido y te perdés algún año.', tag: '2 temporadas' },
        { id: 'express', label: 'Exprés', text: 'Tres temporadas por decisión. Del debut al retiro en un rato.', tag: '3 temporadas' },
    ],

    startClub: 'Club de inicio',
    startClubRandom: 'Al azar',
    startClubRandomText: 'El motor te ubica donde te toque. Puede tocarte una academia profesional.',
    startClubChoose: 'Elegir club',
    startClubChooseText: 'Empezás donde vos digas, en el amateurismo de tu país.',
    startClubNoLadder: 'Tu país no tiene liga propia en el juego: el club lo pone el motor.',
    startClubPickFirst: 'Elegí primero tu nacionalidad.',
    startClubChange: 'Cambiar',
    pickClubTitle: 'Elegí tu club',
    pickClubLead: 'Donde arranca todo. De la primera categoría al último local.',
    searchClub: 'Buscar club',
    noClubMatches: 'Ningún club coincide',
    clubsFound: (n) => `${n} ${n === 1 ? 'club' : 'clubes'}`,
    useThisClub: 'Empezar acá',

    searchCountry: 'Buscar país',
    noCountryMatches: 'Ningún país coincide',
    countriesFound: (n) => `${n} ${n === 1 ? 'país' : 'países'}`,
    moreCountries: (n) => `Hay ${n} ${n === 1 ? 'país' : 'países'} más. Buscalo por nombre.`,
    seeMore: (n) => `Ver más (${n})`,
    seeLess: 'Ver menos',

    continueLabel: 'Continuar',
    signFor: 'Fichar por',
    stayAt: 'Quedarse en',
    noChanges: 'sin cambios',
    outcomeChance: 'Probabilidad de este desenlace: ',

    age: 'Edad',
    steppedUpSr: ' — subiste de escalón',
    hideStatsAndLadder: 'Ocultar planilla y escalafón',
    showStatsAndLadder: 'Ver planilla y escalafón',
    matches: 'Partidos',
    points: 'Puntos',
    tries: 'Tries',
    tackles: 'Tackles',
    tenureCounter: (n) => `${n}ª temporada`,

    ladderTitle: 'Escalafón',
    steppedUp: 'Subiste de escalón',
    youAreNow: (label) => `Ahora sos ${label}.`,
    hide: 'Ocultar',
    seeWhatYouGained: 'Ver qué ganaste',
    seeWhatChanges: 'Ver qué cambia al subir',
    inAcademyNote: 'Estás en la academia: entrenás como un profesional aunque tu vínculo todavía no lo sea.',
    academyFoot: (quality, load) => `La academia ya te da ${quality} de calidad y ${load} de volumen, por encima de tu escalón.`,
    dimensions: [
        { key: 'trainingQuality', label: 'Calidad de entrenamiento' },
        { key: 'trainingLoad', label: 'Volumen de trabajo' },
        { key: 'recoverySupport', label: 'Recuperación' },
        { key: 'medicalSupport', label: 'Cuerpo médico' },
        { key: 'lifeLoad', label: 'Vida fuera del rugby', inverted: true, note: 'menos carga es mejor' },
    ],

    careerColumn: 'Carrera',
    club: 'Club',
    matchesPlayed: 'Partidos jugados',
    pickingClub: 'Eligiendo club…',
    inPlay: 'en juego',
    notPlayedYet: (label) => `${label} años · todavía no jugada`,
    clubChange: 'Cambio de club',
    stepUp: 'Subida de escalón',
    champion: 'Campeón',
    titlesCount: (n) => `${n} ${n === 1 ? 'título' : 'títulos'}`,
    seriousInjury: 'Lesión grave',
    leaguePlace: (place, teams) => `${place}° de ${teams} en la liga`,
    promotedTo: (competition) => `asciende a ${competition}`,
    relegatedTo: (competition) => `desciende a ${competition}`,
    nationalStatus: {
        starter: 'titular',
        squad: 'en el plantel',
        trial: 'de gira',
        dropped: 'ex internacional',
        none: 'sin convocatorias',
        'no-union': 'sin selección',
    },
    nationalNote: {
        starter: 'Titular de la selección.',
        squad: 'En el plantel.',
        trial: 'A prueba: te llevan de gira, todavía no sos del plantel.',
        dropped: 'Perdiste el puesto. Se puede volver.',
        'in-contention': 'Convocatoria: estás en consideración.',
    },
    noUnionNote: (country) => `${country} no tiene selección afiliada. No vas a recibir convocatorias.`,
    callUpGap: (points) => `Convocatoria: te faltan ${points} ${points === 1 ? 'punto' : 'puntos'} de OVR.`,
    nationalHeading: (union, rank, total, movement) => `Selección de ${union}, ${rank}ª de ${total} del ranking mundial${movement}`,
    rankMovement: (delta) => `, ${delta > 0 ? 'subió' : 'bajó'} ${Math.abs(delta)}`,
    unionAbsence: (country, reason) => `${country}: ${reason === 'suspendida' ? 'unión suspendida' : 'sin selección afiliada'}`,
    nationalTitles: (n) => `${n} ${n === 1 ? 'título' : 'títulos'} con la selección`,
    championWithCountry: 'Campeón con la selección',
    careerTotals: 'acumulado de carrera',
    caps: 'caps',
    won: 'ganados',
    yearsLabel: 'años',

    seasonResultLabel: 'Resultado de la temporada',
    blockResultLabel: 'Resultado del tramo',
    seasonTag: (n) => `Temporada ${n}`,
    seasonRangeTag: (from, to) => `Temporadas ${from} a ${to}`,
    atCeiling: 'en tu techo',
    promotionBadge: '▲ Ascenso a ',
    relegationBadge: '▼ Descenso a ',
    clubChampionOf: (competition) => `El club: campeón de ${competition}`,
    newClub: 'Nuevo club',
    fromTo: (from, to) => `De ${from} a ${to}`,
    seasonsAt: (n, club) => `${n === 2 ? 'Dos' : n === 3 ? 'Tres' : n} temporadas en ${club}`,
    growthSeason: (club) => `Temporada de crecimiento en ${club}`,
    hardSeason: (club) => `Temporada difícil en ${club}`,
    busySeason: (club) => `Temporada de mucho rodaje en ${club}`,
    anotherSeason: (club) => `Otra temporada en ${club}`,
    bestTestSeason: 'Tu mejor temporada con el seleccionado',
    bestPointsHaul: 'Tu mejor cosecha de puntos',
    bestTrySeason: 'Tu mejor temporada de tries',
    bestTackleSeason: 'Tu mejor temporada de tackles',
    mostGameTime: 'Tu temporada de más rodaje',

    careerOver: 'Fin de la carrera',
    debutAndRetirement: (debut, retirement, reason) => `Debut a los ${debut} · Retiro a los ${retirement}. ${reason}.`,
    goalPct: 'Al palo',
    titles: 'Títulos',
    peakOvr: 'Mejor OVR',
    seasons: 'Temporadas',
    honours: 'Títulos',
    achievements: 'Logros',
    shareCareer: 'Compartir carrera',
    playAgain: 'Volver a jugar',

    shareDialogLabel: 'Compartir tu carrera',
    shareTitle: 'Tu carrera, para compartir',
    closeSummary: 'Cerrar el resumen',
    formatPickerLabel: 'Formato de la imagen',
    formatFeed: 'Feed',
    formatStory: 'Historia',
    preparingImage: 'Preparando la imagen…',
    imageFailed: 'No se pudo preparar la imagen. Probá de nuevo.',
    shareImage: 'Compartir la imagen',
    downloadImage: 'Bajar la imagen',
    linkCopied: 'Link copiado',
    copyLink: 'Copiar el link',
    copyLinkManually: 'Copiá el link',
    shareNote: 'La imagen se arma en el servidor, así que sale igual en cualquier teléfono. El link vuelve a jugar tu carrera entera.',
    shareSystemTitle: 'Mi carrera en G22 Scores',

    plusSr: 'más ',
    minusSr: 'menos ',
    noOvrChange: 'Sin cambios en el OVR',

    celebrationChampion: 'Campeón',
    celebrationFirstCap: 'Primera convocatoria',
    celebrationSeniorSquad: 'Plantel principal',
    celebrationStepUp: 'Subiste de escalón',
    celebrationAward: 'Distinción',
    celebrationSeasonRecap: 'Tu temporada',
    celebrationSeasonRecapSub: (age, count) => `${age} años · ${count} motivos para festejar`,
    celebrationInternationalDebut: (age) => `${age} años · debut internacional`,
    celebrationNoLongerAProspect: (age) => `${age} años · ya no sos una promesa`,
    celebrationAgeAnd: (age, what) => `${age} años · ${what}`,

    cardSeasons: 'Temporadas',
    cardMatches: 'Partidos',
    cardCaps: 'Caps',
    cardTitles: 'Títulos',
    cardPeakOvr: 'Mejor OVR',
    cardPoints: 'Puntos',
    cardGoalPct: 'Al palo',
    cardSpan: (debut, retirement) => `Debut a los ${debut} · Retiro a los ${retirement}`,
    cardReceiptNotice: 'Esta carrera se jugó con una versión anterior del simulador. Esto es lo que quedó registrado al compartirla.',

    sharePageReplayNote: 'Esta carrera se reconstruye entera desde el link: misma semilla, mismas decisiones, mismo resultado.',
    sharePageReceiptNote: 'El link guardó el resultado de la carrera, pero el simulador cambió desde entonces y ya no puede volver a jugarla igual. Esto es el recibo de lo que era cierto al compartirla.',
    sharePageCta: 'Jugar tu propia carrera',
    shareBrokenLinkTitle: 'Este link no se puede abrir',
    shareBrokenLinkDetail: 'Puede haberse cortado al copiarlo. Pedile a quien te lo pasó que lo comparta de nuevo.',
    shareOldEngineTitle: 'Esta carrera es de una versión anterior del juego',
    shareOldEngineDetail: 'El simulador cambió desde que se jugó, así que no se puede reconstruir tal cual fue. Antes que mostrarte otra carrera parecida, preferimos decírtelo.',
    shareReplayFailedTitle: 'Esta carrera no se pudo reconstruir',
    shareReplayFailedDetail: 'El link es válido pero la carrera no volvió a dar lo mismo. Es un problema nuestro, no tuyo.',
    shareMetaDescription: (position, nationality, span) => `${position} ${nationality}. ${span}.`,

    pageTitle: 'Carrera de Rugby | G22 Scores',
    pageDescription: 'Simulá una carrera completa de rugby: posición, club y selección, decisiones por temporada y un retiro para el recuerdo.',
};

const EN: UiStrings = {
    backToGames: 'Back to Games',
    eyebrow: 'Mini-games',
    gameTitle: 'Rugby Career',
    lead: 'Create a player and take his career from debut to retirement.',
    outdatedNotice: 'The game has been updated and your saved career cannot be continued. You can start a new one.',
    resuming: 'Picking your career back up…',
    continueCareer: 'Continue career',
    startCareer: 'Start a career',
    startOver: 'Start again',
    confirmStartOverLabel: 'Confirm starting again',
    confirmStartOverText: 'Starting again deletes the saved career. This cannot be undone.',
    deleteAndStartOver: 'Delete and start again',
    cancel: 'Cancel',
    languageLabel: 'Language',

    yearsOld: 'years old',
    noSeasonsPlayed: 'No seasons played',
    seasonsCount: (n) => `${n} ${n === 1 ? 'season' : 'seasons'}`,
    ovr: 'OVR',

    seasonNumber: (n) => `Season ${n}`,
    seasonRange: (from, to) => `Seasons ${from} to ${to}`,
    quietSingle: 'Another season of work, with nothing much happening off the pitch.',
    quietSpan: (n) => `${n === 2 ? 'Two' : n === 3 ? 'Three' : n} seasons of work, with no decisions in sight. If the window opens, we stop there.`,
    playSeason: 'Play the season',
    playSeasons: (n) => `Play ${n === 2 ? 'two' : n === 3 ? 'three' : n} seasons`,

    steps: ['Nationality', 'Club', 'Position', 'Identity', 'Pace'],
    createEyebrow: 'Create a player',
    createTitle: 'Choose and get going',
    createLead: 'Your name, your flag, your position and where you start from.',
    stepCount: (current, total) => `${current} of ${total}`,
    stepAria: (current, total, name) => `Step ${current} of ${total}: ${name}`,
    identity: 'Identity',
    surname: 'Surname',
    surnamePlaceholder: 'The one on the shirt',
    surnameHint: 'Optional. Leave it empty and we will give you one.',
    pickYourNumber: 'Pick your number',
    nationality: 'Nationality',
    position: 'Position',
    tapPositionHint: 'Tap your position on the pitch.',
    pace: 'Pace',
    back: 'Back',
    next: 'Continue',
    missingNationality: 'a nationality',
    missingPosition: 'a position',
    missingList: (parts) => `Choose ${parts.slice(0, -1).join(', ')}${parts.length > 1 ? ' and ' : ''}${parts[parts.length - 1]}.`,
    stepMissingNationality: 'Choose your nationality to continue.',
    stepMissingPosition: 'Tap your position on the pitch to continue.',
    paces: [
        { id: 'intense', label: 'Full', text: 'One decision per season. The whole career, year by year.', tag: '1 season' },
        { id: 'normal', label: 'Normal', text: 'Two seasons per decision. You move faster and miss the odd year.', tag: '2 seasons' },
        { id: 'express', label: 'Express', text: 'Three seasons per decision. Debut to retirement in one sitting.', tag: '3 seasons' },
    ],

    startClub: 'Starting club',
    startClubRandom: 'Random',
    startClubRandomText: 'The engine places you wherever you land. A pro academy is on the table.',
    startClubChoose: 'Pick a club',
    startClubChooseText: 'You start where you say, in your country’s amateur game.',
    startClubNoLadder: 'Your country has no league of its own in the game: the engine picks the club.',
    startClubPickFirst: 'Choose your nationality first.',
    startClubChange: 'Change',
    pickClubTitle: 'Pick your club',
    pickClubLead: 'Where it all starts. From the top flight to the last local side.',
    searchClub: 'Search for a club',
    noClubMatches: 'No club matches',
    clubsFound: (n) => `${n} ${n === 1 ? 'club' : 'clubs'}`,
    useThisClub: 'Start here',

    searchCountry: 'Search for a country',
    noCountryMatches: 'No country matches',
    countriesFound: (n) => `${n} ${n === 1 ? 'country' : 'countries'}`,
    moreCountries: (n) => `There ${n === 1 ? 'is' : 'are'} ${n} more ${n === 1 ? 'country' : 'countries'}. Search by name.`,
    seeMore: (n) => `See more (${n})`,
    seeLess: 'See less',

    continueLabel: 'Continue',
    signFor: 'Sign for',
    stayAt: 'Stay at',
    noChanges: 'no change',
    outcomeChance: 'Chance of this outcome: ',

    age: 'Age',
    steppedUpSr: ' — you moved up a rung',
    hideStatsAndLadder: 'Hide stats and ladder',
    showStatsAndLadder: 'Show stats and ladder',
    matches: 'Games',
    points: 'Points',
    tries: 'Tries',
    tackles: 'Tackles',
    tenureCounter: (n) => `Season ${n}`,

    ladderTitle: 'Employment ladder',
    steppedUp: 'You moved up a rung',
    youAreNow: (label) => `You are now ${label}.`,
    hide: 'Hide',
    seeWhatYouGained: 'See what you gained',
    seeWhatChanges: 'See what changes when you move up',
    inAcademyNote: 'You are in the academy: you train like a professional even though your deal is not one yet.',
    academyFoot: (quality, load) => `The academy already gives you ${quality} on quality and ${load} on volume, above your rung.`,
    dimensions: [
        { key: 'trainingQuality', label: 'Training quality' },
        { key: 'trainingLoad', label: 'Training volume' },
        { key: 'recoverySupport', label: 'Recovery' },
        { key: 'medicalSupport', label: 'Medical support' },
        { key: 'lifeLoad', label: 'Life outside rugby', inverted: true, note: 'less load is better' },
    ],

    careerColumn: 'Career',
    club: 'Club',
    matchesPlayed: 'Games played',
    pickingClub: 'Choosing a club…',
    inPlay: 'in play',
    notPlayedYet: (label) => `age ${label} · not played yet`,
    clubChange: 'Change of club',
    stepUp: 'Moved up a rung',
    champion: 'Champion',
    titlesCount: (n) => `${n} ${n === 1 ? 'title' : 'titles'}`,
    seriousInjury: 'Serious injury',
    leaguePlace: (place, teams) => `${place} of ${teams} in the league`,
    promotedTo: (competition) => `promoted to ${competition}`,
    relegatedTo: (competition) => `relegated to ${competition}`,
    nationalStatus: {
        starter: 'starter',
        squad: 'in the squad',
        trial: 'on tour',
        dropped: 'former international',
        none: 'never called up',
        'no-union': 'no Test side',
    },
    nationalNote: {
        starter: 'Test starter.',
        squad: 'In the squad.',
        trial: 'On trial: they take you on tour, you are not squad yet.',
        dropped: 'You lost your place. It can be won back.',
        'in-contention': 'Selection: you are in contention.',
    },
    noUnionNote: (country) => `${country} has no affiliated union. You will not be called up.`,
    callUpGap: (points) => `Selection: you are ${points} OVR ${points === 1 ? 'point' : 'points'} short.`,
    nationalHeading: (union, rank, total, movement) => `${union}, ranked ${rank} of ${total} in the world${movement}`,
    rankMovement: (delta) => `, ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}`,
    unionAbsence: (country, reason) => `${country}: ${reason === 'suspendida' ? 'union suspended' : 'no affiliated union'}`,
    nationalTitles: (n) => `${n} ${n === 1 ? 'title' : 'titles'} with the Test side`,
    championWithCountry: 'Champion with your country',
    careerTotals: 'career totals',
    caps: 'caps',
    won: 'won',
    yearsLabel: 'years old',

    seasonResultLabel: 'Season result',
    blockResultLabel: 'Result of the run',
    seasonTag: (n) => `Season ${n}`,
    seasonRangeTag: (from, to) => `Seasons ${from} to ${to}`,
    atCeiling: 'at your ceiling',
    promotionBadge: '▲ Promoted to ',
    relegationBadge: '▼ Relegated to ',
    clubChampionOf: (competition) => `The club: champions of ${competition}`,
    newClub: 'New club',
    fromTo: (from, to) => `From ${from} to ${to}`,
    seasonsAt: (n, club) => `${n === 2 ? 'Two' : n === 3 ? 'Three' : n} seasons at ${club}`,
    growthSeason: (club) => `A season of growth at ${club}`,
    hardSeason: (club) => `A hard season at ${club}`,
    busySeason: (club) => `A season of plenty of rugby at ${club}`,
    anotherSeason: (club) => `Another season at ${club}`,
    bestTestSeason: 'Your best season with the Test side',
    bestPointsHaul: 'Your best points haul',
    bestTrySeason: 'Your best season for tries',
    bestTackleSeason: 'Your best season for tackles',
    mostGameTime: 'Your season with the most rugby',

    careerOver: 'End of the career',
    debutAndRetirement: (debut, retirement, reason) => `Debut at ${debut} · Retired at ${retirement}. ${reason}.`,
    goalPct: 'Goal %',
    titles: 'Titles',
    peakOvr: 'Peak OVR',
    seasons: 'Seasons',
    honours: 'Titles',
    achievements: 'Honours',
    shareCareer: 'Share your career',
    playAgain: 'Play again',

    shareDialogLabel: 'Share your career',
    shareTitle: 'Your career, ready to share',
    closeSummary: 'Close the summary',
    formatPickerLabel: 'Image format',
    formatFeed: 'Feed',
    formatStory: 'Story',
    preparingImage: 'Preparing the image…',
    imageFailed: 'The image could not be prepared. Try again.',
    shareImage: 'Share the image',
    downloadImage: 'Download the image',
    linkCopied: 'Link copied',
    copyLink: 'Copy the link',
    copyLinkManually: 'Copy the link',
    shareNote: 'The image is built on the server, so it comes out the same on any phone. The link replays your whole career.',
    shareSystemTitle: 'My career on G22 Scores',

    plusSr: 'plus ',
    minusSr: 'minus ',
    noOvrChange: 'No change in OVR',

    celebrationChampion: 'Champion',
    celebrationFirstCap: 'First call-up',
    celebrationSeniorSquad: 'Senior squad',
    celebrationStepUp: 'You moved up a rung',
    celebrationAward: 'Award',
    celebrationSeasonRecap: 'Your season',
    celebrationSeasonRecapSub: (age, count) => `age ${age} · ${count} things to celebrate`,
    celebrationInternationalDebut: (age) => `age ${age} · Test debut`,
    celebrationNoLongerAProspect: (age) => `age ${age} · no longer a prospect`,
    celebrationAgeAnd: (age, what) => `age ${age} · ${what}`,

    cardSeasons: 'Seasons',
    cardMatches: 'Games',
    cardCaps: 'Caps',
    cardTitles: 'Titles',
    cardPeakOvr: 'Peak OVR',
    cardPoints: 'Points',
    cardGoalPct: 'Goal %',
    cardSpan: (debut, retirement) => `Debut at ${debut} · Retired at ${retirement}`,
    cardReceiptNotice: 'This career was played on an earlier version of the simulator. This is what was recorded when it was shared.',

    sharePageReplayNote: 'This career is rebuilt in full from the link: same seed, same decisions, same result.',
    sharePageReceiptNote: 'The link saved the result of the career, but the simulator has changed since then and can no longer replay it exactly. This is the receipt of what was true when it was shared.',
    sharePageCta: 'Play your own career',
    shareBrokenLinkTitle: 'This link cannot be opened',
    shareBrokenLinkDetail: 'It may have been cut off when copied. Ask whoever sent it to share it again.',
    shareOldEngineTitle: 'This career is from an earlier version of the game',
    shareOldEngineDetail: 'The simulator has changed since it was played, so it cannot be rebuilt exactly as it was. Rather than show you a similar career, we would rather tell you.',
    shareReplayFailedTitle: 'This career could not be rebuilt',
    shareReplayFailedDetail: 'The link is valid but the career did not come out the same. That is a problem on our side, not yours.',
    shareMetaDescription: (position, nationality, span) => `${nationality} ${position}. ${span}.`,

    pageTitle: 'Rugby Career | G22 Scores',
    pageDescription: 'Simulate a full rugby career: position, club and country, a decision every season and a retirement worth remembering.',
};

export const UI: Readonly<Record<Locale, UiStrings>> = { es: ES, en: EN };

export function stringsFor(locale: Locale): UiStrings {
    return UI[locale];
}
