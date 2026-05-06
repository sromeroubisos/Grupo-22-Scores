import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';

export const jakarta = Plus_Jakarta_Sans({
    subsets: ['latin'],
    weight: ['300', '400', '600', '800'],
    variable: '--font-jakarta',
    display: 'swap',
});

export const mono = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['400', '500'],
    variable: '--font-mono-vitreous',
    display: 'swap',
});
