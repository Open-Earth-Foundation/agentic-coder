import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const validPassword = process.env.ADMIN_PASSWORD || "oef-analytics-2026";

  if (password === validPassword) {
    const response = NextResponse.json({ success: true });
    // Note: `secure` is opt-in via COOKIE_SECURE=true (set when serving over HTTPS).
    // For HTTP deployments the cookie must NOT be marked secure or the browser
    // will silently drop it on the response.
    response.cookies.set("oef_auth", "authenticated", {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return response;
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}
