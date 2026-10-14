// El mismo club con otro nombre en cada catálogo.
//
// El cruce de escudos (`scripts/build-coach-crests.ts`) empareja los 554 clubes
// del juego contra el canon argentino de Carrera de Rugby por nombre
// normalizado. Alcanza para 141 de los 227 dirigibles; el resto son el mismo
// club escrito distinto —"Club Atletico de San Isidro" es el CASI, "Club
// Universitario de Buenos Aires" es CUBA— y eso no lo resuelve ninguna
// normalización. Se declaran a mano, id contra id, y SOLO cuando no hay duda:
// un escudo ajeno es peor que el escudo de color, porque el de color por lo
// menos no miente.
//
// Quedaron afuera a propósito por duda razonable: Jorge Ross (La Carlota) contra
// "Social La Carlota", Sporting de Mar del Plata contra "IPR Sporting".

/** id del juego → id del club en `features/career` (el que tiene el PNG). */
export const CREST_ALIASES: Readonly<Record<string, string>> = {
    ARG_AGUARA_FORMOSA: 'sb-aguara',
    ARG_AND_SAN_MIGUEL: 'sb-san-miguel-r-c',
    ARG_ATENEO_CULTURAL_RAMOS_MEJIA: 'sb-don-bosco',
    ARG_ATENEO_INMACULADA_SANTA_FE: 'sb-crai',
    ARG_BANCO_NACION_BUENOS_AIRES: 'sb-banco-nacion',
    ARG_CASI_SAN_ISIDRO: 'sb-casi',
    ARG_CENTRO_CAZADORES_POSADAS: 'sb-centro-cazadores',
    ARG_CIRCULO_EX_BUENOS_AIRES: 'sb-liceo-militar',
    ARG_CIRCULO_RAFAELINO_RAFAELA: 'sb-crar',
    ARG_CIRCULO_UNIVERSITARIO_QUILMES: 'sb-cuq',
    ARG_CRICKET_BUENOS_AIRES: 'sb-buenos-aires-crc',
    ARG_ESTUDIANTES_PARANA: 'sb-estudiantes-de-parana',
    ARG_GIMNASIA_ESGRIMA_BUENOS_AIRES: 'sb-geba',
    ARG_GIMNASIA_TIRO_SALTA: 'sb-gimnasia-y-tiro',
    ARG_HIPICO_PAI_MERCEDES: 'sb-pay-ubre',
    ARG_HUIRAPUCA_CONCEPCION: 'sb-huirapuca',
    ARG_ITALIANA_SOCORROS_CHARATA: 'sb-italiana-de-charata',
    ARG_JORGE_SAN_RAFAEL: 'sb-san-jorge-r-c',
    ARG_PERSONAL_BANCO_CHACRAS_DE_CORIA: 'sb-c-p-b-m',
    ARG_PORTENO_BUENOS_AIRES: 'ar-porteno',
    ARG_PROVINCIAL_GENERAL_LAGOS: 'sb-c-a-provincial',
    ARG_SAN_ANTONIO_SAN_ANTONIO_DE_PADUA: 'sb-casa-de-padua',
    ARG_SAN_MARTIN_VILLA_MARIA: 'ar-san-martin-de-villa-maria',
    ARG_SIC_SAN_ISIDRO: 'sb-san-isidro-club',
    ARG_SOCIEDAD_HEBRAICA_BUENOS_AIRES: 'ar-sociedad-hebraica',
    ARG_SOCIEDAD_ITALIANA_BUENOS_AIRES: 'sb-sitas',
    ARG_SPORTING_ALFILES_SAN_JUAN: 'sb-alfiles-s-c',
    ARG_ST_BRENDANS_BUENOS_AIRES: 'sb-st-brendan-s',
    ARG_UNIVERSIDAD_NACIONAL_SAN_JUAN: 'sb-universitario-de-san-juan',
    ARG_UNIVERSITARIO_BUENOS_AIRES: 'sb-cuba',
    ARG_UNIVERSITARIO_NORESTE_RESISTENCIA: 'sb-curne',
    ARG_VICENTINOS_BUENOS_AIRES: 'sb-vicentinos',
};
