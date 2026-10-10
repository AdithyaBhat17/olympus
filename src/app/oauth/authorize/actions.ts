"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { rememberDisplayName } from "@/server/profile";
import {
  createAuthCode,
  getClient,
  isAcceptableRedirectUri,
  isAllowedUser,
  scopeForClient,
} from "@/server/oauth";

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string | null;
  resource: string | null;
}

function withParams(uri: string, params: Record<string, string | null>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

/** Consent decision. Re-validates everything — never trust the form. */
export async function decideAction(params: AuthorizeParams, allow: boolean) {
  const session = await auth();
  const email = session?.user?.email;
  const client = await getClient(params.clientId);
  if (
    !client ||
    !client.redirectUris.includes(params.redirectUri) ||
    !isAcceptableRedirectUri(params.redirectUri)
  ) {
    throw new Error("Invalid client or redirect_uri");
  }
  if (!email) redirect("/login");

  if (!allow || !isAllowedUser(email)) {
    redirect(
      withParams(params.redirectUri, {
        error: "access_denied",
        error_description: allow ? "This account is not allowed" : "The user denied access",
        state: params.state,
      })
    );
  }

  // The iOS app can't read the session, so its name comes from here.
  await rememberDisplayName(email, session?.user?.name).catch(() => {});

  const code = await createAuthCode({
    clientId: client.clientId,
    userId: email,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    scope: scopeForClient(client.clientId),
    resource: params.resource,
  });
  redirect(withParams(params.redirectUri, { code, state: params.state }));
}
