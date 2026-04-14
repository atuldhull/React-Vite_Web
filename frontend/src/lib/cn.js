// @ts-check

/**
 * Filters falsy values + joins with spaces. Used as the conditional-
 * className pattern across React components.
 *
 * @param {...(string|false|null|undefined|0)} values
 * @returns {string}
 */
export function cn(...values) {
  return values.filter(Boolean).join(" ");
}
