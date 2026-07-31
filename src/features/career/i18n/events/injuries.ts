import type { EventTableEn } from './types.ts';

/**
 * Familia `inj-` — el cuerpo.
 *
 * `inj-concussion-protocol` se traduce con el mismo cuidado que se escribió: el
 * protocolo de conmoción no se banaliza (CLAUDE.md §5), así que "ocultar los
 * síntomas" no puede leerse en inglés como una picardía.
 */
export const INJURY_EVENTS_EN: EventTableEn = {
    'inj-rush-return': {
        title: 'Back before you should be',
        text: 'You are coming off a niggle and the club need you for a big game. Do you rush the return?',
        options: {
            rush: {
                label: 'Rush the return',
                hint: 'You help the side, you risk a setback.',
                outcomes: [
                    'You hold up and deliver. The club are grateful.',
                    'You came back too soon and it goes again. The cure was worse than the illness.',
                ],
            },
            wait: {
                label: 'Respect the timeline',
                hint: 'You protect the body, you miss the game.',
                outcomes: ['You take the rehab calmly. You come back in one piece.'],
            },
        },
    },
    'inj-rehab-invest': {
        title: 'Your own physio',
        text: 'You can put money into a personal recovery team and look after yourself all year.',
        options: {
            invest: {
                label: 'Invest in your body',
                hint: 'Lowers your injury risk for good.',
                outcomes: ['You put your recovery team together. Your body thanks you for it.'],
            },
            skip: {
                label: 'Leave it to the club',
                hint: 'You save the money, but you stay exposed.',
                outcomes: ['You trust the club’s structure. You carry on as you were.'],
            },
        },
    },
    'inj-concussion-protocol': {
        title: 'Head injury assessment',
        text: 'You have taken a heavy blow to the head. The protocol says rest; you want to carry on.',
        options: {
            respect: {
                label: 'Follow the protocol',
                hint: 'The healthy call, always.',
                outcomes: ['You stop. The head is not up for negotiation.'],
            },
            hide: {
                label: 'Hide the symptoms',
                hint: 'Very dangerous.',
                outcomes: [
                    'You get away with it and keep playing, though it was not the clever thing to do.',
                    'The head makes you pay. A serious injury and a real scare.',
                ],
            },
        },
    },
    'inj-surgery-decision': {
        title: 'Operate or live with it',
        text: 'You are carrying an injury that will not clear up. The medics offer surgery.',
        options: {
            surgery: {
                label: 'Have the operation now',
                hint: 'You lose half a season and come back better.',
                outcomes: ['You go under the knife. It hurts, but you come back without the niggle.'],
            },
            manage: {
                label: 'Live with the niggle',
                hint: 'You keep playing, but you carry the risk.',
                outcomes: ['You choose to keep playing with the problem on your back.'],
            },
        },
    },
    'inj-load-management': {
        title: 'Load management',
        text: 'The medical staff suggest rotating you to manage your minutes across the season.',
        options: {
            rotate: {
                label: 'Accept the rotation',
                hint: 'No surprises: less wear and less of a role.',
                outcomes: ['You manage your minutes. You reach the end of the year fresher, playing less.'],
            },
            'all-in': {
                label: 'Play everything',
                hint: 'You roll the dice: at your age the body can answer or send the bill.',
                outcomes: [
                    'You play absolutely everything and the body holds. You finish the year as the reference point of the squad.',
                    'You play absolutely everything and pay for it: you reach the run-in on empty.',
                ],
            },
        },
    },
    'inj-comeback-story': {
        title: 'Coming back from the bad one',
        text: 'You are back from a serious injury. The head weighs more than the knee.',
        options: {
            brave: {
                label: 'Go back in without fear',
                hint: 'You get confidence and form back.',
                outcomes: [
                    'You go into contact without thinking twice. The fear goes by playing.',
                    'You come back tense; the body is not answering the way it did.',
                ],
            },
            cautious: {
                label: 'Ease your way back',
                hint: 'Safe but slow.',
                outcomes: ['You build minutes gradually, looking after yourself a bit too much.'],
            },
        },
    },
    'inj-derby-niggle': {
        title: 'A niggle before the derby',
        text: 'You have had a tight adductor since Tuesday. The physio raises an eyebrow and the game is on Sunday.',
        options: {
            play: {
                label: 'Play anyway',
                hint: 'It is the derby. If it holds, you are part of it.',
                outcomes: [
                    'It holds for eighty minutes and you score on top of it. The derby gets told with your name in it.',
                    'Thirty minutes in the adductor goes completely. You walk off slowly.',
                ],
            },
            rest: {
                label: 'Sit this week out',
                hint: 'You stay fit for the rest of the year. You miss the derby.',
                outcomes: ['You tell them you will not make it. You watch it on television with ice on your leg.'],
            },
        },
    },
    'inj-hamstring-warmup': {
        title: 'A twinge in the warm-up',
        text: 'Ten minutes before kick-off you feel a twinge in your hamstring. Nobody saw it.',
        options: {
            tell: {
                label: 'Tell the doctor',
                hint: 'You pull out of the game and save yourself the bad one.',
                outcomes: ['You put your hand up before running out. The hamstring stays a scare and nothing more.'],
            },
            hide: {
                label: 'Run out anyway',
                hint: 'Nobody finds out. The hamstring does.',
                outcomes: [
                    'It works out: you get warm again and the twinge does not come back.',
                    'Ten minutes in it tears on a run. That twinge was the warning.',
                ],
            },
        },
    },
    'inj-physical-prep': {
        title: 'Change your conditioning',
        text: 'The S&C coach offers you a harder plan than the squad’s. More load, less room to recover.',
        options: {
            harder: {
                label: 'Train harder',
                hint: 'You gain physically. The risk of breaking down goes up.',
                outcomes: [
                    'The plan pays off: you reach the end of the year stronger than ever.',
                    'The body cannot absorb the load and you pick up a strain.',
                ],
            },
            'keep-plan': {
                label: 'Stick to the squad plan',
                hint: 'No shocks and no jumps.',
                outcomes: ['You follow everyone else’s plan. Nothing spectacular, nothing broken.'],
            },
        },
    },
};
