import { NextResponse } from "next/server";

export async function verifyMcpAuth(
  request: Request
): Promise<string | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { data: null, error: "Missing authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) {
      return NextResponse.json(
        { data: null, error: "Invalid token" },
        { status: 401 }
      );
    }

    const info = await res.json();

    if (info.email_verified !== "true") {
      return NextResponse.json(
        { data: null, error: "Email not verified" },
        { status: 401 }
      );
    }

    if (info.aud !== process.env.AUTH_GOOGLE_ID) {
      return NextResponse.json(
        { data: null, error: "Token audience mismatch" },
        { status: 401 }
      );
    }

    return info.email as string;
  } catch {
    return NextResponse.json(
      { data: null, error: "Token verification failed" },
      { status: 401 }
    );
  }
}
