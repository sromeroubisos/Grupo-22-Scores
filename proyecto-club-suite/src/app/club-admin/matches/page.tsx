import { redirect } from 'next/navigation';

interface ClubAdminMatchesPageProps {
  searchParams: Promise<{ club?: string }>;
}

export default async function ClubAdminMatchesPage({ searchParams }: ClubAdminMatchesPageProps) {
  const { club } = await searchParams;

  if (club) {
    redirect(`/club-admin?club=${encodeURIComponent(club)}&tab=partidos`);
  }

  redirect('/club-admin');
}
