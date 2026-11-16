import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { readSampleAccess, SAMPLE_COOKIE } from "../../server/demo/sample-session";
import { SampleWorkspaceTour } from "../../features/sample-workspace/SampleWorkspaceTour";
import { notFound } from "next/navigation";
import { readDemoVisitor, DEMO_VISITOR_COOKIE } from "../../server/demo/demo-access";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DemoLayout({ children }: { children: ReactNode }) {
  if (!readDemoVisitor((await cookies()).get(DEMO_VISITOR_COOKIE)?.value)) notFound();
  const access = readSampleAccess((await cookies()).get(SAMPLE_COOKIE)?.value);
  return <SampleWorkspaceTour sessionId={access?.session.id ?? null}>{children}</SampleWorkspaceTour>;
}
