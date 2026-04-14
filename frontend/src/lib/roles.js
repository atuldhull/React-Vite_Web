// @ts-check

/**
 * Role utilities — single source of truth for role-based routing.
 *
 * @typedef {"student"|"teacher"|"admin"|"super_admin"} Role
 * @typedef {{ id?: string, role?: Role }} UserLike
 */

export const ROLES = Object.freeze({
  STUDENT: "student",
  TEACHER: "teacher",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
});

/**
 * Returns the canonical dashboard path for a given role.
 * Used after login, unauthorized redirects, and role-based navigation.
 *
 * @param {Role | string | null | undefined} role
 * @returns {string}
 */
export function dashboardForRole(role) {
  switch (role) {
    case ROLES.SUPER_ADMIN: return "/super-admin";
    case ROLES.ADMIN:       return "/admin";
    case ROLES.TEACHER:     return "/teacher";
    case ROLES.STUDENT:     return "/dashboard";
    default:                return "/dashboard";
  }
}

/**
 * Returns true if the user's role is in the allowed list.
 *
 * @param {UserLike | null | undefined} user
 * @param {readonly string[] | null | undefined} allowed
 * @returns {boolean}
 */
export function hasRole(user, allowed) {
  if (!user || !user.role) return false;
  if (!allowed || !allowed.length) return true;
  return allowed.includes(user.role);
}
