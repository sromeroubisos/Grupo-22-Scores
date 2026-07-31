import type { EventTableEn } from './types.ts';

/**
 * Familia `dis-` — la tarjeta y la citación.
 *
 * La distinción del original se mantiene en inglés porque es la del deporte: una
 * amarilla son diez minutos en el sin-bin y ningún partido, una roja puede quedar
 * en nada si la comisión no cita, y una citación suspende sin que el referí haya
 * visto nada.
 */
export const DISCIPLINE_EVENTS_EN: EventTableEn = {
    'dis-repeated-fouls': {
        title: 'The referee has your number',
        text: 'That is three penalties of yours at the ruck. The referee calls you over, warns you in front of everyone, and the next one is going to cost.',
        options: {
            'keep-hard': {
                label: 'Keep playing on the edge',
                hint: 'It is how you play. The next one is paid for by the team.',
                outcomes: [
                    'You keep squeezing at every ruck and the referee does not call you again. Your side wins that battle.',
                    'Twenty minutes in comes the yellow. Ten minutes off, watching from the side.',
                    'The second yellow is a red. You are sent off and the panel give you two matches.',
                ],
            },
            'ease-off': {
                label: 'Take the edge off',
                hint: 'You do not get sent off. They will not feel you in contact either.',
                outcomes: ['You play the rest of the game with the handbrake on. No sanction and no impact.'],
            },
        },
    },
    'dis-referee-comments': {
        title: 'They ask you about the officiating',
        text: 'You lost to a try that never was. In the mixed zone they ask you about the referee and you have the answer ready.',
        options: {
            speak: {
                label: 'Say what you think',
                hint: 'The stands will applaud. The panel is listening too.',
                outcomes: [
                    'You say it straight and nothing comes of it. Half the support takes you as their own.',
                    'The quote goes round and the panel bans you for a match over your comments.',
                ],
            },
            quiet: {
                label: 'Keep the opinion to yourself',
                hint: 'You save yourself the trouble and swallow the anger.',
                outcomes: ['You give two stock answers and head for the changing room. It had to be learned at some point.'],
            },
        },
    },
    'dis-post-match-shove': {
        title: 'The shove after the whistle',
        text: 'The game is over and an opponent comes looking for you. He says something in your ear and shoulders you.',
        options: {
            respond: {
                label: 'Give it back',
                hint: 'The changing room will back you. The citing comes anyway.',
                outcomes: [
                    'You give it back and you end up face to face. A match each and it ends there.',
                    'The referee had not left the pitch. Red after the whistle and two matches.',
                ],
            },
            walk: {
                label: 'Walk to the changing room',
                hint: 'Nothing happens. You leave chewing on it.',
                outcomes: ['You hold his eye and keep walking. The captain points it out to you afterwards.'],
            },
        },
    },
    'dis-citing': {
        title: 'The citing',
        text: 'The panel have cited you for a high tackle the referee missed. There is a hearing on Wednesday.',
        options: {
            appeal: {
                label: 'Go and defend yourself',
                hint: 'If they believe you, you lose nothing. If not, the ban goes up.',
                outcomes: [
                    'You take the full footage and it shows the opponent dropped into it. The citing falls away.',
                    'Your explanation is not enough and the aggravating factor costs you an extra match: three in total.',
                ],
            },
            accept: {
                label: 'Accept the ban',
                hint: 'Two matches and done. You do not argue something you did.',
                outcomes: ['You own the tackle and take the two matches. The panel appreciate that you do not drag it out.'],
            },
        },
    },
};
