// LA FORMA DE UNA DECISIÓN TRADUCIDA.
//
// Espeja `GameEvent` sin repetirlo: acá sólo viaja el TEXTO. Los pesos, los
// efectos y los requisitos son reglas del motor y no cambian con el idioma — si
// vivieran también acá, un evento podría comportarse distinto en inglés, que es
// exactamente lo que esta capa no puede permitirse.
//
// Los desenlaces van en un ARRAY y se leen por índice, igual que
// `decisionLog[].outcomeIndex`: es lo que permite traducir una decisión que ya se
// jugó y quedó guardada en español.

export interface EventOptionTextEn {
    label: string;
    hint?: string;
    /** Un texto por desenlace, en el MISMO orden que `option.outcomes`. */
    outcomes: string[];
}

export interface EventTextEn {
    title: string;
    text: string;
    options: Readonly<Record<string, EventOptionTextEn>>;
}

export type EventTableEn = Readonly<Record<string, EventTextEn>>;
