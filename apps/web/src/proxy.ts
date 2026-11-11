import { NextResponse, type NextRequest } from "next/server";
import { configuredCanonicalDestination } from "./server/canonical-origin";

export function proxy(request: NextRequest) {
  const destination = configuredCanonicalDestination(request.url);

  if (!destination) return NextResponse.next();

  if (request.method === "GET" || request.method === "HEAD") return NextResponse.redirect(destination, 307);

  return NextResponse.json(
    { code: "INVALID_ORIGIN", message: "정식 서비스 주소에서 다시 요청해 주세요." },
    { status: 403, headers: { "cache-control": "no-store" } }
  );
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|auth-providers/).*)"] };
