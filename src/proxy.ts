import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isValidSessionToken, SESSION_COOKIE_NAME } from "./lib/auth";

export function proxy(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (isValidSessionToken(session)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!api/cron|api/auth/login|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
