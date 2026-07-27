// Eventos según el ENTORNO contractual del jugador. Un solo pool, filtrado por
// `requires` (no cinco motores paralelos). Cubren los huecos temáticos de cada
// contexto: amateur, compensado, desarrollo, semipro, profesional y élite.
//
// La UI solo muestra situación + texto + 2-3 opciones + hint cualitativo.
// Nunca números, probabilidades ni salarios.

import type { GameEvent } from '../../types/event.ts';

export const ENVIRONMENT_EVENTS: GameEvent[] = [
    // ── Amateur ──────────────────────────────────────────────────────────────
    {
        id: 'env-amateur-work-vs-training',
        category: 'personal',
        title: 'Trabajo y entrenamiento',
        text: 'El laburo te pisa los horarios de entrenamiento. Algo tenés que resignar.',
        weight: 9, repeatable: true, cooldown: 4,
        requires: { employment: ['amateur', 'amateur-compensated'] },
        options: [
            { id: 'training', label: 'Priorizar el rugby', hint: 'Menos ingresos, más juego.', outcomes: [{ weight: 1, effect: { stamina: 2, technique: 1, morale: 3, fatigue: 4 }, resultText: 'Recortás horas de trabajo para entrenar más. Se nota en la cancha.' }] },
            { id: 'work', label: 'Cumplir con el trabajo', hint: 'Estabilidad fuera de la cancha.', outcomes: [{ weight: 1, effect: { mental: 2, morale: -2, form: -3 }, resultText: 'Priorizás el sueldo. El rugby queda para los ratos libres.' }] },
        ],
    },
    {
        id: 'env-amateur-derby',
        category: 'club',
        title: 'Clásico del pueblo',
        text: 'Se viene el clásico contra el rival de toda la vida. El club entero vibra.',
        weight: 8, repeatable: true, cooldown: 3,
        requires: { economicModels: ['amateur'] },
        options: [
            { id: 'lead', label: 'Ponerte el equipo al hombro', hint: 'Presión y gloria local.', outcomes: [{ weight: 0.6, effect: { fame: 4, morale: 6, mental: 2 }, resultText: 'Jugás un partidazo y sos figura del clásico.' }, { weight: 0.4, effect: { morale: -3, fatigue: 5 }, resultText: 'La presión te pasa por encima en un día caliente.' }] },
            { id: 'team', label: 'Jugar para el equipo', hint: 'Sin sobreexponerte.', outcomes: [{ weight: 1, effect: { tackle: 1, morale: 3, flags: { corazon: 1 } }, resultText: 'Aportás desde el laburo silencioso. El vestuario lo valora.' }] },
        ],
    },
    // ── Compensado ───────────────────────────────────────────────────────────
    {
        id: 'env-compensated-semi-offer',
        category: 'club',
        title: 'Propuesta semiprofesional',
        text: 'Un club te ofrece un vínculo con más dedicación y algo de estructura.',
        weight: 7, repeatable: true, cooldown: 5,
        requires: { employment: ['amateur-compensated'], maxAge: 30 },
        options: [
            { id: 'commit', label: 'Comprometerte más', hint: 'Más rugby, menos margen.', outcomes: [{ weight: 1, effect: { technique: 2, stamina: 2, morale: 4, flags: { ambicioso: 1 } }, resultText: 'Aceptás el paso adelante y reorganizás tu vida alrededor del rugby.' }] },
            { id: 'keep', label: 'Mantener el equilibrio', hint: 'Trabajo y rugby a la par.', outcomes: [{ weight: 1, effect: { mental: 2, morale: 1 }, resultText: 'Preferís no arriesgar la estabilidad. Seguís como estás.' }] },
        ],
    },
    // ── Desarrollo ───────────────────────────────────────────────────────────
    {
        id: 'env-dev-train-with-first',
        category: 'club',
        title: 'Entrenar con la primera',
        text: 'El cuerpo técnico te sube a entrenar con el plantel principal.',
        weight: 10, repeatable: true, cooldown: 3,
        requires: { squadTrack: ['development'] },
        options: [
            { id: 'shine', label: 'Mostrarte sin miedo', hint: 'Buscar la vidriera.', outcomes: [{ weight: 0.55, effect: { technique: 2, mental: 2, fame: 3, form: 4 }, resultText: 'Dejás una gran impresión entrenando con los grandes.' }, { weight: 0.45, effect: { fatigue: 6, morale: -2 }, resultText: 'Te exigís de más y terminás fundido.' }] },
            { id: 'learn', label: 'Observar y aprender', hint: 'Sumar de a poco.', outcomes: [{ weight: 1, effect: { mental: 3, vision: 2 }, resultText: 'Absorbés todo lo que podés de los referentes.' }] },
        ],
    },
    {
        id: 'env-dev-loan',
        category: 'club',
        title: 'Cesión para sumar minutos',
        text: 'El club evalúa cederte para que juegues seguido en otro lado.',
        weight: 8, repeatable: true, cooldown: 4,
        requires: { squadTrack: ['development'], maxAge: 23 },
        options: [
            { id: 'accept', label: 'Aceptar la cesión', hint: 'Jugar es prioridad.', outcomes: [{ weight: 1, effect: { stamina: 2, technique: 1, morale: 3, flags: { rodaje: 1 } }, resultText: 'Te vas a jugar y sumás la experiencia que te faltaba.' }] },
            { id: 'stay', label: 'Quedarte a pelearla', hint: 'Ganarte el lugar acá.', outcomes: [{ weight: 1, effect: { mental: 2, morale: -1 }, resultText: 'Decidís quedarte y disputar el puesto desde adentro.' }] },
        ],
    },
    // ── Semiprofesional ──────────────────────────────────────────────────────
    {
        id: 'env-semi-pro-offer',
        category: 'club',
        title: 'Oferta profesional',
        text: 'Aparece la chance de dar el salto al profesionalismo full-time.',
        weight: 7, repeatable: true, cooldown: 5,
        requires: { employment: ['semi-professional'], maxAge: 31 },
        options: [
            { id: 'jump', label: 'Ir por el contrato', hint: 'Dedicarte por completo.', outcomes: [{ weight: 1, effect: { morale: 6, form: 3, flags: { ambicioso: 1 } }, resultText: 'Firmás tu primer contrato full-time. Ahora es tu trabajo.' }] },
            { id: 'weigh', label: 'Pensarlo con calma', hint: 'No dejar lo seguro.', outcomes: [{ weight: 1, effect: { mental: 3, morale: -1 }, resultText: 'Evaluás los riesgos antes de dejar tu vida actual.' }] },
        ],
    },
    // ── Profesional ──────────────────────────────────────────────────────────
    {
        id: 'env-pro-rotation',
        category: 'tactical',
        title: 'Competencia por el puesto',
        text: 'El club sumó un refuerzo en tu posición. Vas a tener que pelearla.',
        weight: 9, repeatable: true, cooldown: 3,
        requires: { employment: ['full-time-professional'], squadTrack: ['senior'] },
        options: [
            { id: 'fight', label: 'Redoblar la apuesta', hint: 'Ganarte el puesto en la cancha.', outcomes: [{ weight: 0.55, effect: { technique: 2, mental: 2, form: 4 }, resultText: 'Respondés en cancha y te quedás con la titularidad.' }, { weight: 0.45, effect: { morale: -4, form: -3 }, resultText: 'La competencia te gana y perdés protagonismo.' }] },
            { id: 'adapt', label: 'Aportar desde otro rol', hint: 'Sumar al grupo.', outcomes: [{ weight: 1, effect: { mental: 3, vision: 1, flags: { revulsivo: 1 } }, resultText: 'Te hacés fuerte entrando desde el banco y cambiando partidos.' }] },
        ],
    },
    {
        id: 'env-pro-agent',
        category: 'media',
        title: 'Tu representante',
        text: 'Tu agente te trae opciones y te pide que pienses el próximo paso.',
        weight: 6, repeatable: true, cooldown: 4,
        requires: { employment: ['full-time-professional'] },
        options: [
            { id: 'ambition', label: 'Apuntar más alto', hint: 'Buscar un club mayor.', outcomes: [{ weight: 1, effect: { fame: 4, morale: 2, flags: { ambicioso: 1 } }, resultText: 'Le pedís que te consiga un desafío más grande.' }] },
            { id: 'loyal', label: 'Priorizar el proyecto actual', hint: 'Estabilidad y confianza.', outcomes: [{ weight: 1, effect: { morale: 3, flags: { leal: 1 } }, resultText: 'Elegís seguir el proyecto donde estás cómodo.' }] },
        ],
    },
    // ── Élite (banda alta + internacional) ───────────────────────────────────
    {
        id: 'env-elite-calendar',
        category: 'national-team',
        title: 'Calendario cargado',
        text: 'Entre club, copa y selección, el calendario no da respiro. Hay que gestionar el cuerpo.',
        weight: 7, repeatable: true, cooldown: 3,
        requires: { minSportingBand: 7, requiresInternationalLoad: true },
        options: [
            { id: 'push', label: 'Jugar todo', hint: 'No aflojar en ningún frente.', outcomes: [{ weight: 0.5, effect: { fame: 5, fatigue: 12, injuryRisk: 4 }, resultText: 'Jugás absolutamente todo. El cuerpo lo paga.' }, { weight: 0.5, effect: { fame: 3, fatigue: 8 }, resultText: 'Cumplís en todos los frentes, al límite.' }] },
            { id: 'manage', label: 'Dosificar cargas', hint: 'Cuidar el físico.', outcomes: [{ weight: 1, effect: { stamina: 1, fatigue: -4, injuryRisk: -3, mental: 2 }, resultText: 'Te tomás descansos estratégicos para llegar entero a lo importante.' }] },
        ],
    },
    {
        id: 'env-elite-press',
        category: 'media',
        title: 'Presión mediática',
        text: 'Sos noticia. La prensa amplifica cada partido, para bien y para mal.',
        weight: 6, repeatable: true, cooldown: 4,
        requires: { minSportingBand: 7 },
        options: [
            { id: 'embrace', label: 'Bancar la exposición', hint: 'Convertir la presión en energía.', outcomes: [{ weight: 0.6, effect: { fame: 6, mental: 2, morale: 2 }, resultText: 'Te hacés fuerte bajo los focos y respondés en cancha.' }, { weight: 0.4, effect: { morale: -4, form: -2 }, resultText: 'El ruido de afuera te desconcentra.' }] },
            { id: 'ignore', label: 'Aislarte del ruido', hint: 'Foco en el juego.', outcomes: [{ weight: 1, effect: { mental: 3, morale: 1 }, resultText: 'Te blindás de la prensa y te concentrás en jugar.' }] },
        ],
    },
];
