import type { EventTableEn } from './types.ts';

/** Familia `med-` — la prensa y la reputación. */
export const MEDIA_EVENTS_EN: EventTableEn = {
    'med-sponsor': {
        title: 'A deal with a brand',
        text: 'A sportswear brand wants you as their face. Money and exposure, and commitments with them.',
        options: {
            sign: {
                label: 'Sign the deal',
                hint: 'Profile up, a bit of distraction.',
                outcomes: ['You become the face of the brand. You are everywhere.'],
            },
            reject: {
                label: 'Turn it down to stay focused',
                hint: 'Less noise, more rugby.',
                outcomes: ['You would rather not commit your diary. All the focus on the game.'],
            },
        },
    },
    'med-controversy': {
        title: 'A row online',
        text: 'A comment of yours is taken the wrong way and blows up online. You have to handle it.',
        options: {
            apologize: {
                label: 'Clarify and apologise',
                hint: 'You put the fire out quickly.',
                outcomes: ['You come out and clear it up humbly. The story deflates.'],
            },
            'double-down': {
                label: 'Double down',
                hint: 'Risky: this can go badly.',
                outcomes: [
                    'You stand your ground and a section of the public backs you hard.',
                    'It escalates and causes you trouble on and off the pitch.',
                ],
            },
        },
    },
    'med-documentary': {
        title: 'A documentary about your career',
        text: 'A production company wants to follow you closely for a whole season.',
        options: {
            accept: {
                label: 'Open the doors',
                hint: 'Huge exposure.',
                outcomes: [
                    'The documentary makes you a popular figure beyond rugby.',
                    'The cameras expose you and sometimes unsettle the changing room.',
                ],
            },
            decline: {
                label: 'Protect your privacy',
                hint: 'Keep a low profile.',
                outcomes: ['You would rather keep your life behind closed doors.'],
            },
        },
    },
    'med-punditry': {
        title: 'A newspaper column',
        text: 'A paper offers you a weekly analysis column.',
        options: {
            write: {
                label: 'Write the column',
                hint: 'Vision and profile; it puts you on the record.',
                outcomes: ['Your read on the game wins followers and respect.'],
            },
            no: {
                label: 'Stay off the record',
                hint: 'You avoid the trouble.',
                outcomes: ['You would rather not hand ammunition to a row.'],
            },
        },
    },
    'med-fan-club': {
        title: 'The support adopts you',
        text: 'Supporters set up a fan club in your name. The public affection is growing.',
        options: {
            embrace: {
                label: 'Embrace the support',
                hint: 'Morale and profile.',
                outcomes: ['You give the affection back and win the stands over for good.'],
            },
            distant: {
                label: 'Keep your distance',
                hint: 'You protect your space.',
                outcomes: ['You thank them from a distance; you prefer your privacy.'],
            },
        },
    },
    'med-transfer-rumor': {
        title: 'Transfer talk',
        text: 'The press have you as good as gone. The changing room and the supporters are asking.',
        options: {
            deny: {
                label: 'Play the rumours down',
                hint: 'You settle the mood.',
                outcomes: ['You cool it down. The group appreciates the clarity.'],
            },
            fuel: {
                label: 'Leave the door open',
                hint: 'You press for a better deal.',
                outcomes: [
                    'You deny nothing. The club move to keep you.',
                    'The noise breaks your concentration and cools the changing room.',
                ],
            },
        },
    },
    'med-charity': {
        title: 'A charity cause',
        text: 'You are invited to front a high-profile charity campaign.',
        options: {
            lead: {
                label: 'Put your face to it',
                hint: 'Image and morale.',
                outcomes: ['The campaign takes off and shows you as a good sort.'],
            },
            support: {
                label: 'Help without the spotlight',
                hint: 'A quiet contribution.',
                outcomes: ['You help from the back, with no cameras.'],
            },
        },
    },
    'med-kid-photo': {
        title: 'A kid waiting at the fence',
        text: 'You lost by twenty and you do not want to see anyone. On the way out there is a kid in your shirt waiting for a photo, and ten more behind him.',
        options: {
            stay: {
                label: 'Stay for all of them',
                hint: 'Half an hour signing with the anger still in you.',
                outcomes: ['You stay until the last one. That kid will remember the photo his whole life.'],
            },
            leave: {
                label: 'Head straight for the bus',
                hint: 'You keep the anger. The ones waiting get nothing.',
                outcomes: ['You get on the bus with your head down. Someone films it and it does not look good.'],
            },
        },
    },
    'med-invented-rumor': {
        title: 'The made-up story',
        text: 'A journalist reports that you had a row with the coach in the changing room. None of it happened.',
        options: {
            answer: {
                label: 'Come out and answer',
                hint: 'You set it straight, or you give it another week of life.',
                outcomes: [
                    'You answer by name and the journalist has to explain himself.',
                    'Your answer gives the story another week of life. Now there really is a conflict.',
                ],
            },
            ignore: {
                label: 'Let it go',
                hint: 'It burns out on its own. Meanwhile it hangs around.',
                outcomes: ['You do not say a word and four days later nobody remembers.'],
            },
        },
    },
};
