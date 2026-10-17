// Central role-switch logic shared by the profile screens. Switchable modes persist to
// users.active_role; Admin is a gated entry point that leaves the current mode unchanged.
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { api } from '@noot/core';
import type { SwitcherTarget } from '@noot/ui';
import { useApp, type Role } from './store';
import { useMe } from './useMe';
import { isPreviewSwitch, previewRolesFor, shouldSaveHeldMode } from './roleTabs';

export const HOME: Record<Role, string> = {
  student: '/home',
  tutor: '/tutor_home',
  ambassador: '/ambassador_home',
};

// Every active_role write goes through one queue, so they land in the order they were made:
// a background save can't finish after (and overwrite) a switch the user made later.
let saveQueue: Promise<unknown> = Promise.resolve();
function saveActiveRole(next: Role): Promise<void> {
  const write = saveQueue.then(() => api.profile.setActiveRole(next));
  saveQueue = write.catch(() => undefined);
  return write;
}

export function useRoleSwitch() {
  const router = useRouter();
  const { role, setRole, lastRouteByRole } = useApp();
  const { me, isAdmin, tutorStatus } = useMe();
  // Roles the user actually holds; default to student until loaded.
  const roles = (me?.roles ?? ['student']).filter((r): r is Role => r === 'student' || r === 'tutor' || r === 'ambassador');
  // Modes shown without holding the role yet — only a submitted tutor application (see roleTabs).
  const previewRoles = previewRolesFor(roles, role, tutorStatus);

  const previewing = !roles.includes(role);

  // A mode previewed before the role arrived (tutor approved mid-preview, or a profile that
  // loaded after the switch) is saved once the role shows up, so a cold launch reopens it.
  // A failed save leaves wasPreview set, so the next render (e.g. a profile refresh) retries.
  const wasPreview = useRef<boolean | null>(null);
  const saving = useRef(false);
  useEffect(() => {
    if (!me || saving.current) return;
    const saved = me.activeRole;
    if (wasPreview.current !== null && saved !== 'admin' && shouldSaveHeldMode(wasPreview.current, roles, role, saved)) {
      saving.current = true;
      saveActiveRole(role)
        .then(() => { wasPreview.current = false; })
        .catch(() => { wasPreview.current = true; })
        .finally(() => { saving.current = false; });
      return;
    }
    wasPreview.current = previewing;
  });

  /**
   * `granted`: roles the caller has just added, which `me` may not reflect yet.
   * Resolves false when the mode couldn't be saved (the switch didn't happen).
   */
  const switchTo = async (next: Role, granted: Role[] = []): Promise<boolean> => {
    if (next === role) return true;
    const from = role;
    // Preview mode: the user doesn't hold this role, so there's nothing to persist — the
    // 0007 trigger would reject active_role anyway. Switch locally so they can browse the
    // experience; every screen shows a preview banner and RLS still returns them no data.
    const preview = isPreviewSwitch(roles, next, granted);
    if (!preview) {
      try {
        await saveActiveRole(next);
      } catch {
        /* the guard trigger rejects roles the user doesn't hold — keep current mode */
        return false;
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
    return true;
  };

  const openAdmin = () => {
    router.replace('/admin_home');
  };

  const exitAdmin = () => {
    const dest = lastRouteByRole[role] ?? HOME[role];
    router.replace(dest as never);
  };

  const select = (target: SwitcherTarget) => {
    if (target === 'admin') openAdmin();
    else void switchTo(target);
  };

  return {
    roles,
    previewRoles,
    active: role,
    isAdmin,
    /** True when the CURRENT mode is one the user is only previewing. */
    previewing,
    switchTo,
    openAdmin,
    exitAdmin,
    select,
  };
}
