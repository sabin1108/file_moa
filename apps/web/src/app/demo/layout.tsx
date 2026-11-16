import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { readSampleAccess, SAMPLE_COOKIE } from "../../server/demo/sample-session";
import { SampleWorkspaceTour } from "../../features/sample-workspace/SampleWorkspaceTour";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DemoLayout({ children }: { children: ReactNode }) {
  const access = readSampleAccess((await cookies()).get(SAMPLE_COOKIE)?.value);
  return <SampleWorkspaceTour sessionId={access?.session.id ?? null}>{children}</SampleWorkspaceTour>;
}
