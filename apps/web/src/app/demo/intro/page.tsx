import type { Metadata } from "next";
import { OnboardingPage } from "../../../features/onboarding/OnboardingPage";

export const metadata: Metadata = {
  title: "모아 체험 · 나의 자료, 다음 생각으로",
  robots: { index: false, follow: false },
};

export default async function DemoIntroduction({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { view } = await searchParams;

  return <OnboardingPage mode="sample" initialView={view === "files" ? "files" : undefined} />;
}
