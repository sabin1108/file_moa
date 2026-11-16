import { NextResponse, type NextRequest } from "next/server";
import { configuredCanonicalDestination } from "./server/auth/canonical-origin";
import { readDemoVisitor, DEMO_VISITOR_COOKIE, demoAccessDenied } from "./server/demo/demo-access";

export function proxy(request: NextRequest) {
  const destination = configuredCanonicalDestination(request.url);

  if (!destination) {
    if (request.nextUrl.pathname === "/demo" || request.nextUrl.pathname.startsWith("/demo/")) {
      const inviteEntry = /^\/demo\/access\/[A-Za-z0-9_-]{43,128}$/.test(request.nextUrl.pathname);
      if (!inviteEntry && !readDemoVisitor(request.cookies.get(DEMO_VISITOR_COOKIE)?.value)) return demoAccessDenied();
      const response = NextResponse.next();
      response.headers.set("referrer-policy", "no-referrer");
      response.headers.set("cache-control", "no-store");
      response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      return response;
    }
    return NextResponse.next();
  }

  if (request.method === "GET" || request.method === "HEAD") return NextResponse.redirect(destination, 307);

  return NextResponse.json(
    { code: "INVALID_ORIGIN", message: "정식 서비스 주소에서 다시 요청해 주세요." },
    { status: 403, headers: { "cache-control": "no-store" } }
  );
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|auth-providers/).*)"] };
