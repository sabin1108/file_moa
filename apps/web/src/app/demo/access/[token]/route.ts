import { NextResponse, type NextRequest } from "next/server";
import { createDemoVisitor, readDemoVisitor, validDemoInvite, demoAccessDenied, DEMO_VISITOR_COOKIE, DEMO_VISITOR_SECONDS } from "../../../../server/demo/demo-access";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!validDemoInvite((await params).token)) return demoAccessDenied();
  const response = new NextResponse(null, { status: 303, headers: { location: "/demo/intro", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  if (!readDemoVisitor(request.cookies.get(DEMO_VISITOR_COOKIE)?.value)) {
    response.cookies.set(DEMO_VISITOR_COOKIE, createDemoVisitor().token, {
      path: "/demo", httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: DEMO_VISITOR_SECONDS,
    });
  }
  return response;
}
