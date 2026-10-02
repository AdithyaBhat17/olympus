/**
 * Who may use this app. ALLOWED_EMAILS (comma-separated) gates Google sign-in,
 * the MCP connector and edits to the shared exercise library. MCP_ALLOWED_EMAILS
 * is still read as a fallback for older configs. Pure — safe in middleware.
 */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? process.env.MCP_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Unset list = open sign-up (each user only ever sees their own data). */
export function isAllowedUser(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = allowedEmails();
  return list.length === 0 || list.includes(email.toLowerCase());
}

/** Owners may edit shared rows (the global exercise library). Requires an explicit list. */
export function isOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.toLowerCase());
}
