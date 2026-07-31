import type { EventTableEn } from './types.ts';

/**
 * Familia `env-` — el entorno contractual, y `vet-` — el final de carrera.
 *
 * Los eventos amateurs son los que peor viajan si se traducen de memoria: "la
 * cuota social" no es una membership fee cualquiera, es lo que sostiene al club, y
 * "la cantina" es el bar del club, que en el rugby de habla inglesa es el
 * clubhouse. Se traduce el CONCEPTO, no la palabra.
 */
export const ENVIRONMENT_EVENTS_EN: EventTableEn = {
    'env-amateur-work-vs-training': {
        title: 'Work and training',
        text: 'Your job runs over your training times. Something has to give.',
        options: {
            training: {
                label: 'Put rugby first',
                hint: 'Less income, more rugby.',
                outcomes: ['You cut work hours to train more. It shows on the pitch.'],
            },
            work: {
                label: 'Honour the job',
                hint: 'Stability off the pitch.',
                outcomes: ['You put the wage first. Rugby gets whatever time is left.'],
            },
        },
    },
    'env-amateur-derby': {
        title: 'The local derby',
        text: 'The derby against the old rivals is coming. The whole club is buzzing.',
        options: {
            lead: {
                label: 'Shoulder the side',
                hint: 'Pressure and local glory.',
                outcomes: [
                    'You play a huge game and you are the name of the derby.',
                    'The pressure rolls over you on a hot afternoon.',
                ],
            },
            team: {
                label: 'Play for the side',
                hint: 'Without overexposing yourself.',
                outcomes: ['You contribute with the quiet work. The changing room values it.'],
            },
        },
    },
    'env-amateur-commute': {
        title: 'Two hours to the ground',
        text: 'The club is a long way away. Between there and back it eats half your afternoon, three times a week.',
        options: {
            commute: {
                label: 'Take the travel on',
                hint: 'You never miss, you sleep less.',
                outcomes: ['You do not miss a session. You always get home after dark.'],
            },
            solo: {
                label: 'Train on your own',
                hint: 'You gain rest, you lose the group.',
                outcomes: ['You train alone near home. The side comes together without you.'],
            },
        },
    },
    'env-amateur-no-physio': {
        title: 'The club has no physio',
        text: 'You have been carrying a niggle for weeks. There is nobody at the club to treat it.',
        options: {
            pay: {
                label: 'Pay for the physio yourself',
                hint: 'Out of your own pocket, every month.',
                outcomes: ['You sort it out privately. The body responds; the wallet does not.'],
            },
            ice: {
                label: 'Get by on ice',
                hint: 'Free, and the body pays for it.',
                outcomes: [
                    'You get by on ice and willpower. The niggle moves in for good.',
                    'You find a way round it and the niggle eases off on its own.',
                ],
            },
        },
    },
    'env-amateur-tour-leave': {
        title: 'The tour and the job',
        text: 'The club is away for a week. At work they tell you there is no leave.',
        options: {
            go: {
                label: 'Go on tour anyway',
                hint: 'You play everything and put your job at risk.',
                outcomes: [
                    'You take the days and play the whole tour. You come back a different person.',
                    'You go on tour and come back to find yourself out of a job.',
                ],
            },
            work: {
                label: 'Stay and work',
                hint: 'You protect the wage, you miss the week.',
                outcomes: ['You follow them on your phone from the office. It is not the same.'],
            },
        },
    },
    'env-amateur-no-cover': {
        title: 'There is no cover',
        text: 'You are banged up and there is nobody else in your position. The coach looks at you and says nothing.',
        options: {
            play: {
                label: 'Play injured',
                hint: 'The side takes the field, you pay for it.',
                outcomes: [
                    'You last the eighty minutes. The changing room does not forget it.',
                    'The niggle goes completely after twenty minutes.',
                ],
            },
            rest: {
                label: 'Stop in time',
                hint: 'You look after yourself; the club makes do.',
                outcomes: ['You say you will not make it. They play with fourteen and it sits with you.'],
            },
        },
    },
    'env-amateur-club-dues': {
        title: 'The club subs',
        text: 'The club runs on members’ subs. This month you are short.',
        options: {
            pay: {
                label: 'Pay the subs anyway',
                hint: 'It comes out of this month’s wage.',
                outcomes: ['You pay your subs before anything else. The club stays standing.'],
            },
            work: {
                label: 'Work it off',
                hint: 'Saturdays behind the bar, less rest.',
                outcomes: ['You square it with the committee and work the clubhouse bar on Saturdays.'],
            },
        },
    },
    'env-amateur-teammate-quits': {
        title: 'The one who walks away',
        text: 'Your oldest team-mate is giving up rugby for work. The squad gets thinner.',
        options: {
            convince: {
                label: 'Talk him into staying',
                hint: 'You give him your time and your energy.',
                outcomes: [
                    'You stick with him until he comes back. You keep playing together.',
                    'You push, but his mind was made up. He goes anyway.',
                ],
            },
            accept: {
                label: 'Understand it and move on',
                hint: 'A thinner squad, more minutes for you.',
                outcomes: ['You understand without arguing. His place in the line is yours now.'],
            },
        },
    },
    'env-compensated-semi-offer': {
        title: 'A semi-professional offer',
        text: 'A club offers you a deal with more commitment and some structure behind it.',
        options: {
            commit: {
                label: 'Commit further',
                hint: 'More rugby, less room to manoeuvre.',
                outcomes: ['You take the step up and rearrange your life around rugby.'],
            },
            keep: {
                label: 'Keep the balance',
                hint: 'Work and rugby side by side.',
                outcomes: ['You would rather not risk the stability. You carry on as you are.'],
            },
        },
    },
    'env-dev-train-with-first': {
        title: 'Training with the first team',
        text: 'The staff bring you up to train with the senior squad.',
        options: {
            shine: {
                label: 'Show yourself without fear',
                hint: 'Go looking for the shop window.',
                outcomes: [
                    'You leave a big impression training with the senior lads.',
                    'You push yourself too hard and end up cooked.',
                ],
            },
            learn: {
                label: 'Watch and learn',
                hint: 'Build slowly.',
                outcomes: ['You soak up everything you can from the senior players.'],
            },
        },
    },
    'env-dev-loan': {
        title: 'A loan for minutes',
        text: 'The club are considering loaning you out so you play regularly somewhere else.',
        options: {
            accept: {
                label: 'Accept the loan',
                hint: 'Playing is the priority.',
                outcomes: ['You go away to play and pick up the experience you were missing.'],
            },
            stay: {
                label: 'Stay and fight for it',
                hint: 'Earn your place here.',
                outcomes: ['You decide to stay and fight for the shirt from the inside.'],
            },
        },
    },
    'env-semi-pro-offer': {
        title: 'A professional offer',
        text: 'The chance to make the jump to full-time professional rugby comes up.',
        options: {
            jump: {
                label: 'Go for the contract',
                hint: 'Give yourself over to it completely.',
                outcomes: ['You sign your first full-time contract. Now it is your job.'],
            },
            weigh: {
                label: 'Think it over',
                hint: 'Do not give up the safe thing.',
                outcomes: ['You weigh the risks before giving up the life you have.'],
            },
        },
    },
    'env-pro-rotation': {
        title: 'Competition for the shirt',
        text: 'The club have signed someone in your position. You are going to have to fight for it.',
        options: {
            fight: {
                label: 'Raise your game',
                hint: 'Win the shirt on the pitch.',
                outcomes: [
                    'You answer on the pitch and keep the starting shirt.',
                    'The competition beats you and you lose your role.',
                ],
            },
            adapt: {
                label: 'Contribute from another role',
                hint: 'Add to the group.',
                outcomes: ['You make yourself strong coming off the bench and changing games.'],
            },
        },
    },
    'env-pro-agent': {
        title: 'Your agent',
        text: 'Your agent brings you options and asks you to think about the next step.',
        options: {
            ambition: {
                label: 'Aim higher',
                hint: 'Look for a bigger club.',
                outcomes: ['You ask him to find you a bigger challenge.'],
            },
            loyal: {
                label: 'Back the current project',
                hint: 'Stability and trust.',
                outcomes: ['You choose to stay with the project where you are comfortable.'],
            },
        },
    },
    'env-elite-calendar': {
        title: 'A loaded calendar',
        text: 'Between club, cup and country the calendar gives you no air. The body has to be managed.',
        options: {
            push: {
                label: 'Play everything',
                hint: 'Give nothing up on any front.',
                outcomes: [
                    'You play absolutely everything. The body pays for it.',
                    'You deliver on every front, right at the limit.',
                ],
            },
            manage: {
                label: 'Manage the load',
                hint: 'Look after the body.',
                outcomes: ['You take strategic rests to arrive fresh for what matters.'],
            },
        },
    },
    'env-elite-press': {
        title: 'Media pressure',
        text: 'You are news. The press amplifies every game, for better and for worse.',
        options: {
            embrace: {
                label: 'Take the exposure on',
                hint: 'Turn the pressure into energy.',
                outcomes: [
                    'You get strong under the lights and answer on the pitch.',
                    'The noise from outside breaks your concentration.',
                ],
            },
            ignore: {
                label: 'Shut out the noise',
                hint: 'Focus on the game.',
                outcomes: ['You shield yourself from the press and concentrate on playing.'],
            },
        },
    },
};

/** Familia `vet-` — la decisión de fin de temporada del veterano. */
export const VETERAN_EVENTS_EN: EventTableEn = {
    'vet-end-of-season': {
        title: 'End of the season',
        text: 'The body takes longer to come back and pre-season feels long. You have to decide whether there is another year in you.',
        options: {
            'one-more-year': {
                label: 'Go one more year',
                hint: 'More caps and more games. Your rating will keep falling and the injury risk goes up.',
                outcomes: [
                    'You sign for one more season. The body complains every pre-season, but you keep getting on.',
                    'You carry on, and the staff make you a senior figure in the squad. It is paid for in load.',
                ],
            },
            'retire-now': {
                label: 'Retire now',
                hint: 'You finish at the top. You keep what you have.',
                outcomes: ['You announce your retirement with the season over and the squad on its feet.'],
            },
        },
    },
};
