import type { EventTableEn } from './types.ts';

/** Familia `mil-` — las escenas grandes, casi todas gateadas por logros. */
export const MILESTONE_EVENTS_EN: EventTableEn = {
    'mil-pro-debut': {
        title: 'Professional debut',
        text: 'Your first game as a professional. The ground looks bigger than ever.',
        options: {
            seize: {
                label: 'Take the game on',
                hint: 'If it comes off, you are away.',
                outcomes: [
                    'A dream debut. You leave an impression that gets everyone excited.',
                    'A nervous debut, but you bank the experience that money cannot buy.',
                ],
            },
            calm: {
                label: 'Play it calmly',
                hint: 'Safe, and you learn.',
                outcomes: ['You play without rushing, keeping it tidy. A good first step.'],
            },
        },
    },
    'mil-100-matches': {
        title: '100 games for the club',
        text: 'You reach 100 games in the shirt. The club is putting on a tribute.',
        options: {
            celebrate: {
                label: 'Enjoy the tribute',
                hint: 'A week of events. Your head ends up a long way from the game.',
                outcomes: ['The crowd gives you an ovation. You are part of the club’s history now.'],
            },
            'keep-working': {
                label: 'Say thanks and carry on',
                hint: 'Less tribute, more training. The club will notice it less.',
                outcomes: ['You wave, you say thanks and you head back to the training pitch. There is a game on Monday.'],
            },
        },
    },
    'mil-domestic-final': {
        title: 'The final',
        text: 'Your side reaches the final. This is the chance to lift the trophy.',
        options: {
            'step-up': {
                label: 'Stand up in the final',
                hint: 'You can be the hero or you can suffer.',
                outcomes: [
                    'You play a huge game in the final. Everything tilts your way.',
                    'The final becomes an uphill fight, but you leave everything out there.',
                ],
            },
            'team-play': {
                label: 'Play for the side',
                hint: 'A solid, collective contribution.',
                outcomes: ['You play an intelligent game in the service of the team.'],
            },
        },
    },
    'mil-world-cup-callup': {
        title: 'World Cup call-up',
        text: 'You make the World Cup squad. It is every player’s dream.',
        options: {
            'go-star': {
                label: 'Go and be the main man',
                hint: 'A global stage.',
                outcomes: [
                    'You shine at the World Cup. The whole world knows who you are.',
                    'You live your World Cup. An unforgettable experience, with ups and downs.',
                ],
            },
            'go-humble': {
                label: 'Contribute wherever needed',
                hint: 'A squad role.',
                outcomes: ['You add to the group at the World Cup, on and off the pitch.'],
            },
        },
    },
    'mil-world-cup-final': {
        title: 'World Cup final',
        text: 'The impossible: your country reaches the World Cup final. Eighty minutes for eternity.',
        options: {
            immortal: {
                label: 'Throw everything at it',
                hint: 'If it comes off, you are eternal. If not, you will remember this final all your life.',
                outcomes: [
                    'World champions. Your name is carved in for good.',
                    'Runners-up. The final hurts, but you got to the very top.',
                ],
            },
            'keep-shape': {
                label: 'Play your own game, no heroics',
                hint: 'Less risk and less personal glory: the title gets decided either way.',
                outcomes: [
                    'World champions. You were not the star and you do not care: the cup is there.',
                    'Runners-up. You played your game and it was enough to get there, not to win it.',
                ],
            },
        },
    },
    'mil-record-tries': {
        title: 'Try-scoring record',
        text: 'You are about to break a historic try-scoring record. The mark is within reach.',
        options: {
            chase: {
                label: 'Go for the record',
                hint: 'Total focus on scoring.',
                outcomes: ['You break the record. Your name goes into the books.'],
            },
            'team-first': {
                label: 'The team first',
                hint: 'The record will come on its own.',
                outcomes: ['You put the side first; the record can wait.'],
            },
        },
    },
    'mil-testimonial': {
        title: 'Testimonial match',
        text: 'The club organises your testimonial. Old idols and friends come back to play in it.',
        options: {
            enjoy: {
                label: 'Enjoy it fully',
                hint: 'A proper send-off. The body finds it hard to come back afterwards.',
                outcomes: ['A full house sees you off in tears and applause.'],
            },
            postpone: {
                label: 'Ask for it at the very end',
                hint: 'You are not saying goodbye yet. Less affection now, more if you carry on.',
                outcomes: ['You thank them and ask the tribute to wait: you still have rugby in you.'],
            },
        },
    },
    'mil-hall-of-fame': {
        title: 'Hall of Fame',
        text: 'You are put forward for the game’s Hall of Fame. Recognition for a whole life.',
        options: {
            accept: {
                label: 'Accept it with pride',
                hint: 'Legacy sealed. It also files you with those who have finished.',
                outcomes: ['You go into the Hall of Fame. Your career is already a legend.'],
            },
            'not-yet': {
                label: 'Ask them to wait until you retire',
                hint: 'You give up the honour now. You stay a player instead of a statue.',
                outcomes: ['You ask them to wait: while you are playing, you would rather be judged on what you do on Sunday.'],
            },
        },
    },
};
