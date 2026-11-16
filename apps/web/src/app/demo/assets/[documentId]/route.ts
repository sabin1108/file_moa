import { cookies } from "next/headers";
import { getSampleAsset, getSamplePageAsset } from "../../../../server/demo/sample-catalog";
import { readSampleSession, SAMPLE_COOKIE } from "../../../../server/demo/sample-session";
import { readDemoVisitor, DEMO_VISITOR_COOKIE, demoAccessDenied } from "../../../../server/demo/demo-access";

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  if (!readDemoVisitor((await cookies()).get(DEMO_VISITOR_COOKIE)?.value)) return demoAccessDenied();
  const session = readSampleSession((await cookies()).get(SAMPLE_COOKIE)?.value);
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };

  if (!session) return new Response("샘플 세션을 다시 시작해 주세요.", { status: 401, headers });

  const { documentId } = await context.params;
  const page = new URL(_request.url).searchParams.get("page");
  const asset = page === null
    ? getSampleAsset(documentId)
    : /^[1-9]\d?$/u.test(page) ? getSamplePageAsset(documentId, Number(page)) : null;

  if (!asset) return new Response("샘플을 찾을 수 없습니다.", { status: 404, headers });

  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      ...headers,
      "Content-Type": asset.contentType,
      "Content-Disposition": `${asset.format === "xlsx" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(asset.name)}`
    }
  });
}
