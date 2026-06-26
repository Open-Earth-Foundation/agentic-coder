import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.redirect(new URL("/login", "http://localhost:3000"), { status: 303 });
  response.cookies.set("oef_auth", "", { maxAge: 0 });
  return response;
}
