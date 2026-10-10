import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { publicOrigin } from "@/server/oauth";
import { connectWhoop } from "@/server/integrations/whoop";

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.redirect(`${origin}/login`);

  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const expected = req.cookies.get("whoop_state")?.value;
  const toApp = req.cookies.get("whoop_return")?.value === "app";
  const done = (status: string) => {
    const res = NextResponse.redirect(
      toApp ? `olympus://integrations/whoop?result=${status}` : `${origin}/settings?whoop=${status}`
    );
    res.cookies.delete({ name: "whoop_state", path: "/api/integrations/whoop" });
    res.cookies.delete({ name: "whoop_return", path: "/api/integrations/whoop" });
    return res;
  };

  if (req.nextUrl.searchParams.get("error")) return done("denied");
  if (!state || !expected || state !== expected || !code) return done("state_mismatch");

  try {
    await connectWhoop(email, code, `${origin}/api/integrations/whoop/callback`);
    return done("connected");
  } catch (err) {
    console.error("whoop connect failed", err);
    return done("error");
  }
}
