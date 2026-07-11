// Central role-switch logic shared by the profile screens (and anywhere else that
// switches mode). Persists the choice to users.active_role, updates local app state,
// and swaps to that role's home. Admin is never a switch target — it's a separate gated
// entry point, so it's filtered out of the roles offered.
import { useRouter } from 'expo-router';
import { api } from '@noot/core';
import { useApp, type Role } from './store';
import { useMe } from './useMe';

const HOME: Record<Role, string> = {
  student: '/home',
  tutor: '/tutor_home',
  ambassador: '/ambassador_home',
};

export function useRoleSwitch() {
  const router = useRouter();
  const { role, setRole } = useApp();
  const { me } = useMe();
  // Roles the user actually holds; default to student until loaded. Admin is not switchable.
  const roles = (me?.roles ?? ['student']).filter((r): r is Role => r === 'student' || r === 'tutor' || r === 'ambassador');
  const isAdmin = !!me?.roles?.includes('admin');

  const switchTo = async (next: Role) => {
    if (next === role) return;
    try {
      await api.profile.setActiveRole(next);
    } catch {
      /* the guard trigger rejects roles the user doesn't hold — keep current mode */
      return;
    }
    setRole(next);
    router.replace(HOME[next] as never);
  };

  return { roles, active: role, isAdmin, switchTo };
}
