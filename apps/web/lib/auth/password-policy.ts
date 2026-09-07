/**
 * One password rule, in one place.
 *
 * Signup asked for 8 characters, login accepted 6, and until now nothing else
 * had an opinion. That mismatch is not cosmetic: a 6-character password set
 * at signup would be rejected on the reset page, and the person would
 * reasonably conclude the reset link was broken.
 *
 * WHY LENGTH AND NOT A CHARACTER-CLASS RULE
 *
 * Composition rules - one capital, one digit, one symbol - push people toward
 * Brokerage1! and toward writing it down. Length is the property that
 * actually resists guessing, and NIST SP 800-63B has recommended dropping
 * composition rules for this reason since 2017. So: a floor of 10, an
 * explicit ceiling, and a check against the handful of passwords that are
 * genuinely certain to be tried.
 *
 * The project's own Supabase password policy still applies on top of this and
 * may be stricter. Its rejection message is passed through rather than
 * masked.
 */

export const MIN_PASSWORD_LENGTH = 10;

/*
 * bcrypt truncates at 72 bytes, so anything longer is silently ignored rather
 * than stored. Rejecting it is more honest than accepting a password whose
 * tail does nothing.
 */
export const MAX_PASSWORD_LENGTH = 72;

/*
 * Not a dictionary. A dictionary belongs in a service that can check against
 * a breach corpus; this is the short list of strings that a person setting up
 * a yacht charter workspace in a hurry actually reaches for.
 */
const OBVIOUS_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "letmein123",
  "changeme",
  "bahariboat",
  "bahariosos",
]);

/**
 * Returns a sentence describing what is wrong with the password, or null when
 * it is acceptable. Written as prose because every caller displays it
 * directly.
 */
export function describePasswordProblem(password: string): string | null {
  if (!password) {
    return "Enter a new password.";
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  }

  if (password.trim().length === 0) {
    return "A password cannot be only spaces.";
  }

  if (OBVIOUS_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too easy to guess. Choose something else.";
  }

  /*
   * "aaaaaaaaaaaa" clears the length floor and resists nothing.
   */
  if (new Set(password).size < 5) {
    return "Use a greater variety of characters.";
  }

  return null;
}

export function isAcceptablePassword(password: string): boolean {
  return describePasswordProblem(password) === null;
}