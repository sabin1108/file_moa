import { createRoot } from "react-dom/client";
import { WorkspacePrototype } from "../../src/prototypes/WorkspacePrototype";
import { FileLibraryPrototype } from "../../src/prototypes/files/FileLibraryPrototype";
import { SettingsPrototype } from "../../src/prototypes/settings/SettingsPrototype";
import { LoginPrototype } from "../../src/prototypes/auth/LoginPrototype";
import { WelcomePrototype } from "../../src/prototypes/auth/WelcomePrototype";
import { ScenePreview } from "../../src/prototypes/demo/ScenePreview";
import { sceneIds, type SceneId } from "../../src/prototypes/demo/scene-data";
import "../../src/styles/globals.css";

const screens = {
  chat: WorkspacePrototype,
  files: FileLibraryPrototype,
  settings: SettingsPrototype,
  login: LoginPrototype,
  welcome: WelcomePrototype
};
const scenario = new URLSearchParams(location.search).get("case") ?? "files";
const Screen = screens[scenario as keyof typeof screens];

if (!Screen && !sceneIds.includes(scenario as SceneId)) {
  throw new Error("Unknown prototype fixture case");
}

createRoot(document.getElementById("fixture")!).render(
  <div data-prototype-fixture={scenario}>
    {Screen ? <Screen /> : <ScenePreview initial={scenario as SceneId} />}
  </div>,
);
