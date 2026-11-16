import { NextResponse, type NextRequest } from "next/server";
import { createSampleSession, readSampleSession, SAMPLE_COOKIE, SAMPLE_SESSION_SECONDS } from "../../../server/demo/sample-session";
import { readDemoVisitor, DEMO_VISITOR_COOKIE, demoAccessDenied } from "../../../server/demo/demo-access";

export function GET(request: NextRequest) {
  if (!readDemoVisitor(request.cookies.get(DEMO_VISITOR_COOKIE)?.value)) return demoAccessDenied();
  if (request.nextUrl.searchParams.get("intro") !== "done") {
    const view = request.nextUrl.searchParams.get("view") === "files" ? "?view=files" : "";

    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/demo/intro${view}`, "Cache-Control": "no-store" },
    });
  }

  // Relative redirects keep browser storage on the same origin behind local or deployment proxies.
  const destination = request.nextUrl.searchParams.get("view") === "files" ? "/demo/files" : "/demo";
  const response = new NextResponse(
    null,
    { status: 303, headers: { Location: `${destination}?guide=1`, "Cache-Control": "no-store" } }
  );

  if (readSampleSession(request.cookies.get(SAMPLE_COOKIE)?.value)) return response;

  try {
    const { token } = createSampleSession();

    response.cookies.set(SAMPLE_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/demo",
      maxAge: SAMPLE_SESSION_SECONDS
    });

    return response;
  } catch {
    return NextResponse.json(
      { message: "샘플 작업 공간을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
