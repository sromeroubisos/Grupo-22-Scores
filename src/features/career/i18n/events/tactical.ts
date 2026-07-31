import type { EventTableEn } from './types.ts';

/** Familia `tac-` — el perfil de juego y los dos únicos cambios de puesto. */
export const TACTICAL_EVENTS_EN: EventTableEn = {
    'tac-playstyle': {
        title: 'Define your game',
        text: 'The coach asks you to specialise in one kind of player.',
        options: {
            physical: {
                label: 'Physical profile',
                hint: 'Power and tackling.',
                outcomes: ['You turn into a collision player, hard to stop and hard to get past.'],
            },
            creative: {
                label: 'Creative profile',
                hint: 'Vision and technique.',
                outcomes: ['You become a reader of the game, the one who builds it.'],
            },
            explosive: {
                label: 'Explosive profile',
                hint: 'Pace and footwork.',
                outcomes: ['You back yourself one on one and on the change of pace.'],
            },
        },
    },
    'tac-goal-kicking': {
        title: 'Take on the goal kicking',
        text: 'The side needs a kicker. You can put the hours into shots at goal.',
        options: {
            'take-kicks': {
                label: 'Be the kicker',
                hint: 'Kicking goes up; so does the responsibility.',
                outcomes: ['You take on the goal kicking. Hour after hour of practice.'],
            },
            'leave-kicks': {
                label: 'Leave it to someone else',
                hint: 'Less pressure.',
                outcomes: ['You would rather focus on other parts of your game.'],
            },
        },
    },
    'tac-defense-system': {
        title: 'Defensive leader',
        text: 'The defence coach wants you organising the line. It is a role that lives on reading the game.',
        options: {
            organize: {
                label: 'Organise the defence',
                hint: 'Tackling, vision and leadership.',
                outcomes: ['You become the voice of the defensive line.'],
            },
            'attack-focus': {
                label: 'Focus on attack',
                hint: 'You prioritise the attacking side.',
                outcomes: ['You choose to put your energy into attack.'],
            },
        },
    },
    'tac-set-piece': {
        title: 'Set-piece specialist',
        text: 'You can become key at scrum and lineout, the dirty work that wins games.',
        options: {
            specialize: {
                label: 'Master the set piece',
                hint: 'Power, technique and stamina.',
                outcomes: ['You take ownership of the scrum and the lineout. Pure gold for the side.'],
            },
            mobile: {
                label: 'Be a mobile forward',
                hint: 'Pace and open play.',
                outcomes: ['You back yourself to cover the whole pitch like an extra back.'],
            },
        },
    },
    'tac-switch-lock': {
        title: 'Move to lock',
        text: 'The staff can see your body works better at lock than in the back row.',
        options: {
            switch: {
                label: 'Move to lock',
                hint: 'An exceptional change of position.',
                outcomes: ['You convert to lock. New life, new role.'],
            },
            stay: {
                label: 'Stay in the back row',
                hint: 'True to your position.',
                outcomes: ['You stay in the back row, where you feel at home.'],
            },
        },
    },
    'tac-switch-wing': {
        title: 'From centre to wing',
        text: 'You have lost a bit of size but your pace is intact. The wing is waiting.',
        options: {
            switch: {
                label: 'Move to the wing',
                hint: 'An exceptional change of position.',
                outcomes: ['You shift out to the wing. Less collision, more space for your pace.'],
            },
            stay: {
                label: 'Stay at centre',
                hint: 'Take the collisions.',
                outcomes: ['You hold on at centre a while longer.'],
            },
        },
    },
    'tac-leadership-group': {
        title: 'Leadership group',
        text: 'The side puts together a small group to make decisions on the pitch. They want you in it.',
        options: {
            join: {
                label: 'Join the group',
                hint: 'Vision and mentality.',
                outcomes: ['You join the leadership group. Your word carries on the pitch.'],
            },
            pass: {
                label: 'Let it pass',
                hint: 'Play without a title.',
                outcomes: ['You would rather lead by example alone.'],
            },
        },
    },
    'tac-new-tackle-technique': {
        title: 'A different way to tackle',
        text: 'The defence coach suggests lowering your point of contact and going in underneath. It means changing something you already do by heart.',
        options: {
            adopt: {
                label: 'Change the technique',
                hint: 'If it clicks, your defence changes. While you learn it, you miss.',
                outcomes: [
                    'It takes you half a season and after that you do not miss one. The numbers say it on their own.',
                    'Caught between the new and the old you end up in the middle, and the middle is where they get past you.',
                ],
            },
            keep: {
                label: 'Stick with yours',
                hint: 'What you know, you do well. You will not get better at it.',
                outcomes: ['You tell him that at this stage you are not relearning the tackle. And you tackle the way you always did.'],
            },
        },
    },
};
