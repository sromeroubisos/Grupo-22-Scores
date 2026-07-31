import type { EventTableEn } from './types.ts';

/**
 * Familia `per-` — la vida fuera de la cancha.
 *
 * `per-loyalty-test` es el único evento del pool que habla de dinero, y lo hace
 * como lo que es —una oferta de afuera del rugby de arriba, no un valor de
 * mercado del jugador—. La regla del §5 sigue vigente en inglés: nadie tiene un
 * precio.
 */
export const PERSONAL_EVENTS_EN: EventTableEn = {
    'per-study-vs-train': {
        title: 'Study or rugby full time',
        text: 'You are young: you can go to university or give yourself over to rugby completely.',
        options: {
            fulltime: {
                label: 'Rugby full time',
                hint: 'You speed up your physical development.',
                outcomes: ['You put everything into rugby. The body and the game show it.'],
            },
            study: {
                label: 'Study alongside it',
                hint: 'A better-furnished head, less physical focus.',
                outcomes: ['You combine study and rugby. You gain tools for life.'],
            },
        },
    },
    'per-family': {
        title: 'Starting a family',
        text: 'Your partner wants to take a big step. A family can change your priorities.',
        options: {
            yes: {
                label: 'Put the family first',
                hint: 'Emotional stability, fewer nights in the gym.',
                outcomes: ['You start a family. You play with a fuller heart.'],
            },
            later: {
                label: 'Wait for the career',
                hint: 'Total focus, at a personal cost.',
                outcomes: ['You choose to wait. Your head stays entirely on rugby.'],
            },
        },
    },
    'per-nutrition': {
        title: 'Change of diet',
        text: 'A nutritionist offers you a strict plan that could change your body.',
        options: {
            strict: {
                label: 'Strict plan',
                hint: 'A better body, hard discipline.',
                outcomes: ['You get rigorous with food. The body responds.'],
            },
            balanced: {
                label: 'Something more flexible',
                hint: 'Sustainable, less impact.',
                outcomes: ['You adjust without going mad. Slow progress, but enjoyable.'],
            },
        },
    },
    'per-nightlife': {
        title: 'The nightlife comes knocking',
        text: 'Profile opens doors. Your mates invite you into a livelier life.',
        options: {
            party: {
                label: 'Let yourself go a bit',
                hint: 'You enjoy it, but the body pays.',
                outcomes: [
                    'You have fun and let the pressure out. All in moderation.',
                    'It gets away from you and your form feels it.',
                ],
            },
            focus: {
                label: 'Keep the discipline',
                hint: 'Boring, but it pays.',
                outcomes: ['You choose rest and looking after yourself. Consistency pays.'],
            },
        },
    },
    'per-mentor-childhood': {
        title: 'The club that made you',
        text: 'Your home club ask you for a favour: a clinic for the kids from the neighbourhood.',
        options: {
            'give-back': {
                label: 'Give something back',
                hint: 'Good for the soul and for the image.',
                outcomes: ['You go back to your roots. The kids do not forget it.'],
            },
            busy: {
                label: 'No time right now',
                hint: 'You protect your week.',
                outcomes: ['You let it go for diary reasons. It leaves an odd taste.'],
            },
        },
    },
    'per-burnout': {
        title: 'Mental fatigue',
        text: 'You have been flat out for years. Your head is asking for a brake.',
        options: {
            break: {
                label: 'Take a breather',
                hint: 'You recharge energy and morale.',
                outcomes: ['You slow the ball down. You come back with a fresh head.'],
            },
            push: {
                label: 'Grit your teeth',
                hint: 'You carry on, but you wear down.',
                outcomes: ['You keep pushing. The bill arrives sooner or later.'],
            },
        },
    },
    'per-business': {
        title: 'A business outside rugby',
        text: 'You are offered a stake in a venture. It could distract you or set your mind at rest.',
        options: {
            invest: {
                label: 'Get into the project',
                hint: 'Peace of mind later, divided focus now.',
                outcomes: [
                    'You build your future off the pitch. You play lighter.',
                    'The project eats your time and pulls you away from the game.',
                ],
            },
            wait: {
                label: 'Not yet',
                hint: 'Total focus on rugby.',
                outcomes: ['You would rather wait until you retire for that.'],
            },
        },
    },
    'per-loyalty-test': {
        title: 'A huge offer from a lesser league',
        text: 'A far-off league with no prestige offers you a fortune to finish your career there.',
        options: {
            money: {
                label: 'Go for the money',
                hint: 'You secure the future, you give up level.',
                outcomes: ['You take the cheque. The wallet wins, the standing less so.'],
            },
            legacy: {
                label: 'Protect your legacy',
                hint: 'Standing above money.',
                outcomes: ['You turn the offer down: your story is worth more than the cheque.'],
            },
        },
    },
    'per-summer-coach': {
        title: 'A summer with a former Test player',
        text: 'A retired international living nearby offers to train you Monday to Saturday all summer. For nothing.',
        options: {
            train: {
                label: 'Train with him',
                hint: 'It eats your whole summer. You come back a different player.',
                outcomes: [
                    'Three months of double sessions with someone who played at the top. It shows from round one.',
                    'You give the whole summer to it and reach pre-season with the tank half full.',
                ],
            },
            rest: {
                label: 'Rest over the summer',
                hint: 'You reach pre-season fresh and with nothing new.',
                outcomes: ['You take the summer off. You come back whole, with the same game you left with.'],
            },
        },
    },
    'per-teammate-late': {
        title: 'The one who turned up late',
        text: 'A team-mate rolled into training an hour late with no warning. The coach gathers the squad and asks who it was.',
        options: {
            cover: {
                label: 'Cover for him',
                hint: 'The changing room will pay you back. If they find out, you pay for it.',
                outcomes: [
                    'You say he was with you and you arrived together. The squad works it out and files it in your favour.',
                    'The coach knew the answer before he asked. Lying to him costs you.',
                ],
            },
            truth: {
                label: 'Tell the truth',
                hint: 'The staff believe you. The changing room takes longer.',
                outcomes: ['You say it plainly. The coach is grateful and the group goes quiet.'],
            },
            'stay-out': {
                label: 'Stay out of it',
                hint: 'Nobody will hold anything against you. Nobody will owe you anything either.',
                outcomes: ['You look at the grass until the meeting is over. Someone else answers.'],
            },
        },
    },
};
