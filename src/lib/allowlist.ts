function emailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Who may use this app. ALLOWED_EMAILS (comma-separated) gates Google sign-in
 * and the MCP connector. MCP_ALLOWED_EMAILS is still read as a fallback for
 * older configs. Pure — safe in middleware.
 */
export function allowedEmails(): string[] {
  return emailList(process.env.ALLOWED_EMAILS ?? process.env.MCP_ALLOWED_EMAILS);
}

/**
 * Who may edit the shared exercise library. OWNER_EMAILS when set, so friends
 * on ALLOWED_EMAILS can train without recalibrating your machines; otherwise
 * everyone on ALLOWED_EMAILS.
 */
export function ownerEmails(): string[] {
  const owners = emailList(process.env.OWNER_EMAILS);
  return owners.length ? owners : allowedEmails();
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
  return ownerEmails().includes(email.toLowerCase());
}
