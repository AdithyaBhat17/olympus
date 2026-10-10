import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publicOrigin } from "@/server/oauth";
import { whoopAuthorizeUrl, whoopConfigured } from "@/server/integrations/whoop";

/**
 * Start Whoop's OAuth. `?app=1` comes from the iOS app (in a system sign-in
 * sheet that shares the site's cookies): the callback then hands the result
 * back to the app at olympus://integrations/whoop instead of /settings.
 */
export async function GET(req: Request) {
  const session = await auth();
  const origin = publicOrigin(req);
  const fromApp = new URL(req.url).searchParams.get("app") === "1";
  if (!session?.user?.email) {
    const back = `/api/integrations/whoop/connect${fromApp ? "?app=1" : ""}`;
    return NextResponse.redirect(`${origin}/login?callbackUrl=${encodeURIComponent(back)}`);
  }
  if (!whoopConfigured()) {
    return NextResponse.redirect(
      fromApp ? "olympus://integrations/whoop?result=not_configured" : `${origin}/settings?whoop=not_configured`
    );
  }

  const state = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(
    whoopAuthorizeUrl(`${origin}/api/integrations/whoop/callback`, state)
  );
  res.cookies.set("whoop_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/integrations/whoop",
  });
  if (fromApp) {
    res.cookies.set("whoop_return", "app", {
      httpOnly: true,
      secure: origin.startsWith("https"),
      sameSite: "lax",
      maxAge: 600,
      path: "/api/integrations/whoop",
    });
  }
  return res;
}
