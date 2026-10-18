/** Shared form rules. The same limits are enforced again on the server and in the database. */

export const PASSWORD_MIN = 10;
export const DISPLAY_NAME_MAX = 60;
export const SCENARIO_NAME_MAX = 80;
/** Pseudonymous IDs only: letters, digits, dash, underscore. Rules out names and emails. */
export const PATIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return "Enter your email address.";
  if (v.length > 254 || !EMAIL.test(v)) return "Enter an email address in the format name@example.com.";
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Enter a password.";
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > 72) return "Use 72 characters or fewer.";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return "Include at least one letter and one number.";
  return null;
}

export function validateDisplayName(value: string): string | null {
  if (value.trim().length > DISPLAY_NAME_MAX) return `Use ${DISPLAY_NAME_MAX} characters or fewer.`;
  return null;
}

/** Turns Supabase auth errors into messages that say what to do next. */
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password do not match an account. Check both and try again.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Open the link we sent you, then sign in.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Sign in or reset your password.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Too many attempts. Wait a minute, then try again.";
  if (m.includes("age_confirmation_required")) return "You must confirm that you are 18 or older to create an account.";
  if (m.includes("terms_not_accepted")) return "You must accept the Terms of Service and Privacy Policy to create an account.";
  if (m.includes("same password") || m.includes("different from the old")) return "Choose a password you have not used for this account before.";
  if (m.includes("weak") || m.includes("password should")) return "That password is too easy to guess. Use a longer one.";
  if (m.includes("expired") || (m.includes("invalid") && m.includes("token"))) return "This link has expired or was already used. Request a new one.";
  if (m.includes("fetch") || m.includes("network")) return "We could not reach the server. Check your connection and try again.";
  return "Something went wrong. Try again, and contact us if it keeps happening.";
}

/** Only allow same-site relative redirects such as "/dashboard". */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
