import { hydrateRoot } from "react-dom/client";
import RootLayout from "../../src/app/layout";
import { OnboardingPage } from "../../src/features/onboarding/OnboardingPage";

hydrateRoot(
  document,
  <RootLayout>
    <OnboardingPage />
    <script
      type="module"
      async
      src="/tests/browser-fixtures/root-hydrate.tsx"
    />
  </RootLayout>,
);
Object.assign(window, { hydrationFixtureReady: true });
