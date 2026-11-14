import type { Metadata } from "next";
import { OnboardingPage } from "../../features/onboarding/OnboardingPage";

export const metadata: Metadata = {
  title: "모아 · 나의 자료, 다음 생각으로",
  description: "내 폴더의 자료를 찾고, AI와 정리하고, 기록으로 이어가는 개인 작업 공간을 만나보세요.",
};

export default function StartPage() {
  return <OnboardingPage />;
}
