import { isAdminUser, type MembershipLike } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';

export async function requireAdminApiUser(): Promise<string> {
  const supabase = await createClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single();

  const userRole = userData?.role || session.user.user_metadata?.role;
  const { data: memberships } = await supabase
    .from('memberships')
    .select('scope_type, scope_id, role')
    .eq('user_id', session.user.id);

  const mappedMemberships: MembershipLike[] = (memberships || []).map((membership: { scope_type: string; scope_id: string; role: string }) => ({
    scopeType: membership.scope_type as MembershipLike['scopeType'],
    scopeId: membership.scope_id,
    role: membership.role,
  }));

  if (!isAdminUser(userRole, mappedMemberships)) {
    throw new Error('Unauthorized');
  }

  return session.user.id;
}
