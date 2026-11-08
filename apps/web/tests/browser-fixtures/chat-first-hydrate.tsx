import { hydrateRoot } from "react-dom/client";
import RootLayout from "../../src/app/layout";
import { ChatFirstPrototype } from "../../src/prototypes/organization/ChatFirstPrototype";

hydrateRoot(
  document,
  <RootLayout>
    <ChatFirstPrototype />
    <script
      type="module"
      async
      src="/tests/browser-fixtures/chat-first-hydrate.tsx"
    />
  </RootLayout>,
);
Object.assign(window, { hydrationFixtureReady: true });
