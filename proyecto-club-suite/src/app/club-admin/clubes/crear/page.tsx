import type { ComponentProps } from 'react';
import { redirect } from 'next/navigation';
import NewClubForm from '@/app/admin/super/clubes/crear/NewClubForm';
import { createClient } from '@/lib/supabase/server';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import {
  CREATABLE_CLUB_DERIVATIVE_TYPES,
  type CreatableClubDerivativeType,
  type ClubDerivativeType,
} from '@/lib/clubDerivatives';

interface ClubAdminCreateClubPageProps {
  searchParams?: Promise<{
    derivedFrom?: string;
    derivativeType?: string;
    derivedSport?: string;
  }>;
}

type DerivedPrefill = NonNullable<ComponentProps<typeof NewClubForm>['derivedPrefill']>;
type UnionOption = NonNullable<ComponentProps<typeof NewClubForm>['unions']>[number];

function isCreatableDerivativeType(value: string | undefined): value is CreatableClubDerivativeType {
  if (!value) return false;
  return CREATABLE_CLUB_DERIVATIVE_TYPES.includes(value as CreatableClubDerivativeType);
}

async function loadUnions(): Promise<UnionOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('unions')
    .select('id, name, country')
    .order('name');

  if (error) {
    console.warn('[club-admin/clubes/crear] No se pudieron cargar las uniones:', error.message);
    return [];
  }

  return (data ?? []).map((union) => ({
    id: union.id,
    name: union.name,
    country: union.country ?? null,
  }));
}

async function loadDerivedPrefill(rawParams?: Awaited<ClubAdminCreateClubPageProps['searchParams']>): Promise<DerivedPrefill | null> {
  const derivedFrom = rawParams?.derivedFrom?.trim();
  const derivativeType = rawParams?.derivativeType?.trim();

  if (!derivedFrom || !isCreatableDerivativeType(derivativeType)) {
    return null;
  }

  const supabase = await createClient();
  const { data: baseClub, error } = await supabase
    .from('clubs')
    .select('id, name, short_name, union_id, country, region, city, logo_url, primary_color, sport, sport_id')
    .eq('id', derivedFrom)
    .maybeSingle();

  if (error) {
    console.warn('[club-admin/clubes/crear] No se pudo cargar el club base derivado:', error.message);
    return null;
  }

  if (!baseClub) {
    return null;
  }

  return {
    baseClub: {
      id: baseClub.id,
      name: baseClub.name,
      short_name: baseClub.short_name ?? null,
      union_id: baseClub.union_id ?? null,
      country: baseClub.country ?? null,
      region: baseClub.region ?? null,
      city: baseClub.city ?? null,
      logo_url: baseClub.logo_url ?? null,
      primary_color: baseClub.primary_color ?? null,
      sport: baseClub.sport ?? null,
      sport_id: baseClub.sport_id ?? null,
    },
    derivativeType: derivativeType as ClubDerivativeType,
    derivedSport: rawParams?.derivedSport?.trim() || null,
  };
}

export default async function ClubAdminCreateClubPage({ searchParams }: ClubAdminCreateClubPageProps) {
  const supabase = await createClient();
  const context = await requireUserAccessContext(supabase).catch(() => null);

  if (!context) {
    redirect('/login');
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [unions, derivedPrefill] = await Promise.all([
    loadUnions(),
    loadDerivedPrefill(resolvedSearchParams),
  ]);

  return <NewClubForm unions={unions} derivedPrefill={derivedPrefill} navigationMode="club-admin" />;
}
