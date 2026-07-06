import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../lib/auth";

export async function POST(request: Request) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "DASHBOARD_PASSWORD is not configured" }, { status: 500 });
  }

  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  if (!password || !safeEqual(password, expected)) {
    return NextResponse.json({ error: "incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
