import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSampleCatalog } from "../../../server/demo/sample-catalog";
import { readSampleAccess, SAMPLE_COOKIE } from "../../../server/demo/sample-session";
import { SampleWorkspace } from "../../../features/sample-workspace/SampleWorkspace";
import { getSampleAiProvider } from "../../../server/ai/ai-provider";

export const metadata = { title: "내 파일 · 모아 샘플" };

export default async function SampleFilesPage() {
  const access = readSampleAccess((await cookies()).get(SAMPLE_COOKIE)?.value);

  if (!access) redirect("/demo/start?view=files");

  const provider = getSampleAiProvider();

  return (
    <SampleWorkspace
      key={access.session.id}
      catalog={getSampleCatalog()}
      session={access.session}
      remainingMs={access.remainingMs}
      aiProvider={provider}
      view="files"
    />
  );
}
