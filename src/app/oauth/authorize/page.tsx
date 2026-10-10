import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getClient,
  isAcceptableRedirectUri,
  isAllowedUser,
  isAppClient,
  isClaudeRedirect,
} from "@/server/oauth";
import { decideAction, type AuthorizeParams } from "./actions";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="card max-w-sm w-full flex flex-col gap-3">
        <h1 className="font-display text-3xl font-bold">Can&apos;t connect</h1>
        <p className="text-muted text-sm leading-relaxed">{message}</p>
      </div>
    </main>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const clientId = one(sp.client_id);
  const redirectUri = one(sp.redirect_uri);
  const responseType = one(sp.response_type);
  const codeChallenge = one(sp.code_challenge);
  const method = one(sp.code_challenge_method);

  if (!clientId || !redirectUri) return <ErrorScreen message="Missing client_id or redirect_uri." />;
  const client = await getClient(clientId);
  if (!client) return <ErrorScreen message="Unknown client. Remove the connector in Claude and add it again." />;
  if (!client.redirectUris.includes(redirectUri)) {
    return <ErrorScreen message="redirect_uri isn't registered for this client." />;
  }
  // Clients registered before the redirect allowlist existed get re-checked here.
  if (!isAcceptableRedirectUri(redirectUri)) {
    return <ErrorScreen message="This client sends codes somewhere other than Claude. Not allowed." />;
  }

  const fail = (error: string, description: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", description);
    const state = one(sp.state);
    if (state) u.searchParams.set("state", state);
    redirect(u.toString());
  };
  if (responseType !== "code") fail("unsupported_response_type", "Only response_type=code");
  if (!codeChallenge || method !== "S256") fail("invalid_request", "PKCE with S256 is required");

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    const back = `/oauth/authorize?${new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : [[k, one(v)!]]))
    ).toString()}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }
  if (!isAllowedUser(email)) {
    return <ErrorScreen message={`${email} isn't allowed to connect Claude to this app.`} />;
  }

  const params: AuthorizeParams = {
    clientId,
    redirectUri,
    codeChallenge: codeChallenge!,
    state: one(sp.state),
    scope: one(sp.scope),
    resource: one(sp.resource),
  };
  if (isAppClient(client.clientId)) return <AppSignIn email={email} params={params} />;

  const host = new URL(redirectUri).host;
  // The client's name is self-declared at registration, so the heading is
  // driven by where the code goes, never by what the client calls itself.
  const fromClaude = isClaudeRedirect(redirectUri);
  const who = fromClaude ? "Claude" : "an app on this computer";

  return (
    <main className="min-h-dvh flex items-center justify-center px-5 bg-bg">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Connect</span>
          <h1 className="font-display text-[40px] font-bold leading-none">
            Let {who} use your LiftLog?
          </h1>
          <p className="text-sm text-muted">
            Signed in as <span className="text-fg-2">{email}</span>. Access goes to{" "}
            <span className="text-xs text-fg-2">{host}</span>
            {client.clientName && (
              <>
                {" "}
                (calls itself &ldquo;{client.clientName}&rdquo;)
              </>
            )}
            .
            {!fromClaude && " Only allow this if you just started a connection from Claude Code or Claude Desktop."}
          </p>
        </div>
        <ul className="card flex flex-col gap-3 text-sm leading-snug">
          <li className="flex gap-3"><span className="text-info font-display text-lg font-bold w-4">R</span>Read sessions, working weights, check-ins, constraints and coach flags</li>
          <li className="flex gap-3"><span className="text-accent font-display text-lg font-bold w-4">W</span>Push plans to Today, log sessions, set working weights, add coach flags and check-ins</li>
          <li className="flex gap-3"><span className="text-danger-soft font-display text-lg font-bold w-4">×</span>Never delete anything. Deletes stay in the app</li>
        </ul>
        <div className="flex flex-col gap-2">
          <form action={decideAction.bind(null, params, true)}>
            <button type="submit" className="btn-primary">Allow</button>
          </form>
          <form action={decideAction.bind(null, params, false)}>
            <button type="submit" className="btn-secondary">Deny</button>
          </form>
        </div>
        <p className="text-xs text-muted text-center">
          You can disconnect any time in Settings › Connections.
        </p>
      </div>
    </main>
  );
}

/**
 * The iPhone app signing in. Still a tap, not automatic: any app can claim a
 * URL scheme, so this screen is where the athlete sees it's their own app asking.
 */
function AppSignIn({ email, params }: { email: string; params: AuthorizeParams }) {
  return (
    <main className="min-h-dvh flex items-center justify-center px-5 bg-bg">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Sign in</span>
          <h1 className="font-display text-[40px] font-bold leading-none">Sign in to Olympus on your iPhone?</h1>
          <p className="text-sm text-muted">
            Signed in as <span className="text-fg-2">{email}</span>. The Olympus iPhone app gets the same access as
            this site. Only continue if you just tapped Sign in in the app.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <form action={decideAction.bind(null, params, true)}>
            <button type="submit" className="btn-primary">Continue</button>
          </form>
          <form action={decideAction.bind(null, params, false)}>
            <button type="submit" className="btn-secondary">Cancel</button>
          </form>
        </div>
        <p className="text-xs text-muted text-center">Sign out any time from the app&apos;s Settings.</p>
      </div>
    </main>
  );
}
