import type { EventTableEn } from './types.ts';

/**
 * Familia `nt-` — la selección.
 *
 * `nt-eligibility-switch` habla de RESIDENCIA y no de ascendencia, igual que el
 * original: es la vía por la que esto pasa de verdad (Reg. 8.1(c)) y es lo que el
 * motor modela. En inglés la tentación de escribir "heritage" es fuerte y sería
 * el mismo error que el español ya corrigió.
 */
export const NATIONAL_TEAM_EVENTS_EN: EventTableEn = {
    'nt-first-callup-nerves': {
        title: 'First camp',
        text: 'You are called into the senior squad for the first time. The changing room commands respect.',
        options: {
            humble: {
                label: 'Keep your head down',
                hint: 'You win the group over slowly.',
                outcomes: ['You listen, you work, and you make a place for yourself without noise.'],
            },
            bold: {
                label: 'Show yourself from the off',
                hint: 'A risk, but it can speed things up.',
                outcomes: [
                    'You back yourself and leave a strong impression on the coaching staff.',
                    'You tried a bit too hard to stand out and it did not go down well.',
                ],
            },
        },
    },
    'nt-eligibility-switch': {
        title: 'Another flag is calling',
        text: 'You have played here so long that this union now wants you. It is a decision about your life.',
        options: {
            switch: {
                label: 'Switch Test allegiance',
                hint: 'A bigger stage, shallower roots.',
                outcomes: ['You change Test jerseys. More attention, mixed feelings.'],
            },
            stay: {
                label: 'Stay with your own',
                hint: 'Identity above everything.',
                outcomes: ['You choose the flag you always had. The country notices.'],
            },
        },
    },
    'nt-captaincy': {
        title: 'Captain of your country',
        text: 'The head coach offers you the Test captaincy. There is nothing above this.',
        options: {
            accept: {
                label: 'Accept and lead',
                hint: 'A legend in the making.',
                outcomes: ['You take the armband for your country. Pure history.'],
            },
            decline: {
                label: 'Hand the role on',
                hint: 'You would rather play without the weight.',
                outcomes: ['You would rather contribute without the armband. The group values you all the same.'],
            },
        },
    },
    'nt-tour-vs-rest': {
        title: 'End-of-year tour',
        text: 'There is a long tour with the Test side, right when your body is at its limit.',
        options: {
            go: {
                label: 'Go on tour',
                hint: 'More caps, more fatigue.',
                outcomes: ['You get on the plane. You add Tests, but you come back on empty.'],
            },
            rest: {
                label: 'Ask to be released',
                hint: 'You look after the body and give up caps.',
                outcomes: ['You pull out to recover. The coach understands, up to a point.'],
            },
        },
    },
    'nt-bench-role': {
        title: 'On the Test bench',
        text: 'Your country has a special player in your position. You are fighting from the bench.',
        options: {
            fight: {
                label: 'Fight for the shirt',
                hint: 'You train to take it off him.',
                outcomes: [
                    'You take him on in every session and earn yourself minutes.',
                    'The incumbent does not budge. You have to wait your turn.',
                ],
            },
            'accept-role': {
                label: 'Take on the impact role',
                hint: 'Specialise as a finisher.',
                outcomes: ['You become an expert at coming on and changing games.'],
            },
        },
    },
    'nt-media-pressure': {
        title: 'The weight of the support',
        text: 'The whole country has an opinion on you before a decisive Test. Social media is on fire.',
        options: {
            ignore: {
                label: 'Shut out the noise',
                hint: 'A cool head.',
                outcomes: ['You come off social media and play freely.'],
            },
            feed: {
                label: 'Use the pressure',
                hint: 'A double edge.',
                outcomes: [
                    'The pressure fires you up and you answer on the pitch.',
                    'The noise gets in your head and you do not perform.',
                ],
            },
        },
    },
    'nt-retire-international': {
        title: 'Test retirement',
        text: 'You are a veteran now. You can step away from the Test side to look after your club career.',
        options: {
            'retire-nt': {
                label: 'Retire from Test rugby',
                hint: 'You lengthen your club career.',
                outcomes: ['You say goodbye to the Test side. Your club gets a fresher player.'],
            },
            keep: {
                label: 'Carry on while the body holds',
                hint: 'More caps, more wear.',
                outcomes: ['You keep answering the call for your country as long as the body allows.'],
            },
        },
    },
    'nt-lost-shirt': {
        title: 'Left out of the touring party',
        text: 'The squad was named without you. After years of going, this time the call never came.',
        options: {
            chase: {
                label: 'Go and get it back',
                hint: 'You train to return. The body pays for it.',
                outcomes: [
                    'You go into revenge mode. The wear shows, and so does the level.',
                    'You leave everything on the training pitch and the squad is named without you again.',
                ],
            },
            'let-go': {
                label: 'Let it go',
                hint: 'You gain body and head for the club. The jersey goes out of reach.',
                outcomes: ['You make peace with the idea. Your club gets the best version of you.'],
            },
        },
    },
    'nt-place-under-threat': {
        title: 'The shirt is slipping away',
        text: 'You are coming off a poor season and the staff tried someone else in your place. The next squad is an open question.',
        options: {
            'fight-back': {
                label: 'Put it all on your club form',
                hint: 'Everything on performance. If it does not come off, you are worse off.',
                outcomes: [
                    'You put in a serious season at your club and the debate ends by itself.',
                    'You force it, it does not come, and the other lad keeps the shirt.',
                ],
            },
            'talk-to-coach': {
                label: 'Talk to the coach',
                hint: 'You will know where you stand. The answer may not suit you.',
                outcomes: [
                    'He tells you what he wants to see. It is concrete and it helps.',
                    'He thanks you for the years and tells you he is going to look at others. No dressing it up.',
                ],
            },
        },
    },
    'nt-long-injury-place-lost': {
        title: 'The injury cost you the window',
        text: 'You missed the whole window and the lad who came in did well. You return to a squad that has settled without your name in it.',
        options: {
            'rush-back': {
                label: 'Come back early',
                hint: 'You get the place back or you break down again.',
                outcomes: [
                    'You come back ahead of schedule and the coach takes note.',
                    'You rush the return, you are not right, and the window goes by without you.',
                ],
            },
            'full-recovery': {
                label: 'Recover properly',
                hint: 'You come back whole, but the window has gone.',
                outcomes: ['You complete the full rehab. Your body thanks you; the squad list does not.'],
            },
        },
    },
};
