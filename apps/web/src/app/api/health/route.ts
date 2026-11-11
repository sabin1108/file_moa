export function GET() {
  return Response.json({ status: "ok", scope: "web-process", integrations: "not-configured" });
}

