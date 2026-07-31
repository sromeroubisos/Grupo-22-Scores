import type { EventTableEn } from './types.ts';

/** Familia `club-` — capitanía, contrato, préstamos, foco y pelea por el puesto. */
export const CLUB_EVENTS_EN: EventTableEn = {
    'club-captaincy': {
        title: 'The captain’s armband',
        text: 'The coach offers you the captaincy. It is a step up in responsibility.',
        options: {
            accept: {
                label: 'Take the captaincy',
                hint: 'More leadership and profile, and more pressure with it.',
                outcomes: ['You shoulder the side. The changing room follows you.'],
            },
            decline: {
                label: 'Turn it down for now',
                hint: 'You would rather focus on your own game.',
                outcomes: ['You stay focused on your own game. The coach understands.'],
            },
        },
    },
    'club-contract-renewal': {
        title: 'Contract renewal',
        text: 'The club want to extend you. Better money, but a longer clause.',
        options: {
            'renew-long': {
                label: 'Sign long',
                hint: 'Stability and morale, less room to leave.',
                outcomes: ['You sign for several seasons. The club make you feel important.'],
            },
            'renew-short': {
                label: 'Sign short',
                hint: 'You leave a door open to the market.',
                outcomes: ['You sign short: you want to see what the market does later on.'],
            },
        },
    },
    'club-loan-youth': {
        title: 'Loan offer',
        text: 'You are young and short of minutes. A loan comes up at a club where you would play every week.',
        options: {
            'go-loan': {
                label: 'Go out on loan',
                hint: 'Real minutes: you grow faster.',
                outcomes: ['You go away to play. Real competition hardens you.'],
            },
            'stay-bench': {
                label: 'Stay and fight for it',
                hint: 'You train with the senior side, but you barely play.',
                outcomes: ['You stay training with the first-team squad, even if you hardly play.'],
            },
        },
    },
    'club-training-focus': {
        title: 'Pre-season focus',
        text: 'The S&C coach lets you choose what to work on this pre-season.',
        options: {
            gym: {
                label: 'Gym and power',
                hint: 'More power and stamina.',
                outcomes: ['You load up the gym. You come out stronger and a little more tired.'],
            },
            skills: {
                label: 'Skills and handling',
                hint: 'More technique and vision.',
                outcomes: ['You work on the detail: hands, support lines, reading the game.'],
            },
            speed: {
                label: 'Speed and agility',
                hint: 'More pace.',
                outcomes: ['Track and plyometrics: you find another gear.'],
            },
        },
    },
    'club-new-coach': {
        title: 'New head coach',
        text: 'A new coach arrives with a different idea. You do not know if you are in his plans.',
        options: {
            adapt: {
                label: 'Adapt to his system',
                hint: 'You gain in the collective side.',
                outcomes: [
                    'You buy into his idea and earn his trust.',
                    'You struggle to get inside his head; the start is hard.',
                ],
            },
            resist: {
                label: 'Play your own way',
                hint: 'You risk your place for your style.',
                outcomes: [
                    'You impose your game and the coach bows to the evidence.',
                    'You clash with the new staff and lose ground.',
                ],
            },
        },
    },
    'club-derby': {
        title: 'Derby week',
        text: 'The derby is coming. The city breathes rugby and everyone is looking at you.',
        options: {
            lead: {
                label: 'Take it on',
                hint: 'If it comes off, you are an idol.',
                outcomes: [
                    'You play the game of your life. The derby carries your name.',
                    'The pressure weighs on you and it is not your best afternoon.',
                ],
            },
            team: {
                label: 'Blend into the side',
                hint: 'Less risk, less shine.',
                outcomes: ['You put in a solid shift, with no alarms.'],
            },
        },
    },
    'club-veteran-mentor': {
        title: 'Squad mentor',
        text: 'The young lads come to you. The club ask you to be the voice of the changing room.',
        options: {
            mentor: {
                label: 'Take on the mentor role',
                hint: 'Leadership and profile at the cost of your own focus.',
                outcomes: ['You become the compass of the changing room.'],
            },
            self: {
                label: 'Look after your own game',
                hint: 'You stretch your level a little further.',
                outcomes: ['You choose to stay focused on stretching your own form.'],
            },
        },
    },
    'club-salary-cap': {
        title: 'Budget trouble',
        text: 'The club have to cut back. They ask you to take less so the squad stays together.',
        options: {
            'accept-cut': {
                label: 'Take the pay cut',
                hint: 'A gesture the changing room values.',
                outcomes: ['You put your shoulder in. The squad stays together.'],
            },
            refuse: {
                label: 'Do not give up the money',
                hint: 'You protect what is yours; the relationship cools.',
                outcomes: ['You turn the cut down. The board make a note of it.'],
            },
        },
    },
    'club-coach-doubts': {
        title: 'The coach is torn between you and another',
        text: 'The coach tries both of you all week and does not name the side until Friday. You know the shirt belongs to one of you.',
        options: {
            meeting: {
                label: 'Ask for a meeting',
                hint: 'You will know where you stand. The answer may not suit you.',
                outcomes: [
                    'He tells you what he wants to see and you give it to him. On Friday your name is in the side.',
                    'He hears you out, thanks you for the chat and starts the other lad. At least you know where you stand.',
                ],
            },
            wait: {
                label: 'Wait for your chance',
                hint: 'No noise. He decides the shirt, and it may not be yours.',
                outcomes: [
                    'You work away quietly and the chance comes anyway, mid-season.',
                    'The other lad starts and never comes out. Your week becomes training and watching.',
                ],
            },
            'other-position': {
                label: 'Offer to cover another position',
                hint: 'You get on the pitch, somewhere that is not yours.',
                outcomes: ['You tell him you can cover the other side. You play almost everything, though never where you want.'],
            },
        },
    },
    'club-bench-third-game': {
        title: 'Third game on the bench',
        text: 'Third Sunday without getting on. You warm up for twenty minutes, sit down, and the game finishes without you.',
        options: {
            talk: {
                label: 'Talk to the coach',
                hint: 'He will tell you the truth. The truth may be that you are not playing.',
                outcomes: [
                    'You ask for five minutes and come out with a list of things to fix. On Sunday you get on.',
                    'He tells you that right now you are not a starter. It is honest and it stings anyway.',
                ],
            },
            work: {
                label: 'Wait and keep working',
                hint: 'Nobody gets annoyed. Nobody remembers you either.',
                outcomes: [
                    'You are first in and last out. An injury opens the door and you do not let go.',
                    'The weeks go by the same. Without games, the sharpness goes on its own.',
                ],
            },
            'ask-out': {
                label: 'Ask to leave the club',
                hint: 'You get it off your chest. The club stop counting on you.',
                outcomes: ['You ask permission to look for a club. They give it, and from that Monday you are out of the plans.'],
            },
        },
    },
    'club-captain-injured': {
        title: 'The captain is out',
        text: 'The captain goes off on a stretcher and will be out for half a year. The coach looks around the squad for someone to take the armband.',
        options: {
            'step-up': {
                label: 'Put yourself forward',
                hint: 'You carry the group as well as your own game.',
                outcomes: [
                    'You put your hand up and the changing room comes with you. The armband suits you.',
                    'It is too much for now: thinking about the other fourteen, your own game gets away from you.',
                ],
            },
            'let-be': {
                label: 'Let them pick someone else',
                hint: 'You stick to your own game. The armband passes you by.',
                outcomes: ['You would rather not put your hand up. You play light, with no speeches.'],
            },
        },
    },
};
