/** Logique d'autorisation pure (sans I/O) : facile à tester exhaustivement. */
export type Role = "user" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  banned: boolean | null;
  banExpires?: Date | null;
  mustChangePassword: boolean;
}

export type AuthzResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "unauthenticated" | "banned" | "forbidden" | "must-change-password" };

export function isBanned(user: Pick<AuthUser, "banned" | "banExpires">, now = new Date()) {
  if (!user.banned) return false;
  return !user.banExpires || user.banExpires > now;
}

/** Un rôle peut être multiple ("user,admin") : on compare strictement chaque élément. */
export function hasRole(user: Pick<AuthUser, "role">, role: Role) {
  return user.role.split(",").map((r) => r.trim()).includes(role);
}

export function authorize(
  user: AuthUser | null | undefined,
  opts: { role?: Role; allowMustChangePassword?: boolean } = {},
): AuthzResult {
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (isBanned(user)) return { ok: false, reason: "banned" };
  if (opts.role && !hasRole(user, opts.role)) return { ok: false, reason: "forbidden" };
  if (user.mustChangePassword && !opts.allowMustChangePassword)
    return { ok: false, reason: "must-change-password" };
  return { ok: true, user };
}

/* ---- Verrouillage de compte (anti brute-force) ---- */
export const MAX_FAILED_LOGINS = 10;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export function isLocked(user: { lockedUntil?: Date | null }, now = new Date()) {
  return !!user.lockedUntil && user.lockedUntil > now;
}

/** Date de fin de verrou à poser si ce nombre d'échecs consécutifs est atteint, sinon null. */
export function lockUntilFor(failedCount: number, now = new Date()): Date | null {
  return failedCount >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_DURATION_MS) : null;
}
