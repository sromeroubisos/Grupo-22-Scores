import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Prode | G22 Scores',
    description: 'Espacio jugable de pronosticos deportivos conectado a torneos API y torneos locales.',
};

export default async function ProdeLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return children;
}
