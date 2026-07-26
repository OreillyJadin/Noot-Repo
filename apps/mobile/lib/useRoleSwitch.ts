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
  const { role, setRole, lastRouteByRole } = useApp();
  const { me, isAdmin, tutorStatus } = useMe();
  // Roles the user actually holds; default to student until loaded. Admin is not switchable.
  const roles = (me?.roles ?? ['student']).filter((r): r is Role => r === 'student' || r === 'tutor' || r === 'ambassador');
  // Modes the user can LOOK at without holding the role yet. Tutor and ambassador are both
  // things you opt into, and you can't sensibly decide to apply without seeing what you'd get
  // — previously the switcher hid them entirely until the application was already finished.
  const previewRoles = (['tutor', 'ambassador'] as Role[]).filter((r) => !roles.includes(r));

  const switchTo = async (next: Role) => {
    if (next === role) return;
    const from = role;
    // Preview mode: the user doesn't hold this role, so there's nothing to persist — the
    // 0007 trigger would reject active_role anyway. Switch locally so they can browse the
    // experience; every screen shows a preview banner and RLS still returns them no data.
    const preview = !roles.includes(next);
    if (!preview) {
      try {
        await api.profile.setActiveRole(next);
      } catch {
        /* the guard trigger rejects roles the user doesn't hold — keep current mode */
        return;
      }
    }
    // Log the switch for recruitment-rate analytics. Fire-and-forget: never awaited, and
    // api.analytics.track never throws — tracking can't gate, delay, or fail the switch.
    void api.analytics.track('role_switch', { from, to: next, preview });
    setRole(next);
    // Return the user to wherever they last were in the target mode; fall back to that
    // mode's home the first time they enter it.
    const dest = lastRouteByRole[next] ?? HOME[next];
    router.replace(dest as never);
  };

  return {
    roles,
    previewRoles,
    active: role,
    isAdmin,
    /** True when the CURRENT mode is one the user is only previewing. */
    previewing: !roles.includes(role),
    switchTo,
  };
}
