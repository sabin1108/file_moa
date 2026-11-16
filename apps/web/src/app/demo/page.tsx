import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSampleCatalog } from "../../server/demo/sample-catalog";
import { readSampleAccess, SAMPLE_COOKIE } from "../../server/demo/sample-session";
import { SampleWorkspace } from "../../features/sample-workspace/SampleWorkspace";
import { sampleClassificationAction, sampleOrganizationAction, sampleAnswerAction } from "../actions/sample-ai";
import { getSampleAiProvider } from "../../server/ai/ai-provider";

export const metadata = { title: "샘플 작업 공간 · 모아" };

export default async function SamplePage() {
  const access = readSampleAccess((await cookies()).get(SAMPLE_COOKIE)?.value);

  if (!access) redirect("/demo/start");

  const provider = getSampleAiProvider();

  return (
    <SampleWorkspace
      key={access.session.id}
      catalog={getSampleCatalog()}
      session={access.session}
      remainingMs={access.remainingMs}
      aiProvider={provider}
      answerAction={sampleAnswerAction.bind(null, provider)}
      classifyAction={sampleClassificationAction.bind(null, provider)}
      organizeAction={sampleOrganizationAction.bind(null, provider)}
    />
  );
}
