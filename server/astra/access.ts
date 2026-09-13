/**
 * Who may open an Astra thread. Kept free of database imports so it can be
 * tested directly.
 */

/** A caller may open a thread only in their own organization, and only their own thread. */
export function canAccessThread(
  thread: { organizationId: string; actorUserId: string | null },
  caller: { orgId: string; userId: string | null },
): boolean {
  if (thread.organizationId !== caller.orgId) return false;
  if (thread.actorUserId && caller.userId && thread.actorUserId !== caller.userId) return false;
  return true;
}
