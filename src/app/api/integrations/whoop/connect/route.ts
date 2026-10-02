import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publicOrigin } from "@/server/oauth";
import { whoopAuthorizeUrl, whoopConfigured } from "@/server/integrations/whoop";

export async function GET(req: Request) {
  const session = await auth();
  const origin = publicOrigin(req);
  if (!session?.user?.email) return NextResponse.redirect(`${origin}/login`);
  if (!whoopConfigured()) return NextResponse.redirect(`${origin}/settings?whoop=not_configured`);

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
  return res;
}
