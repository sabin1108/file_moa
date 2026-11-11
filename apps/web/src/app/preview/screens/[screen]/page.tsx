import { notFound } from "next/navigation";
import { WorkspacePrototype } from "../../../../prototypes/WorkspacePrototype";
import { FileLibraryPrototype } from "../../../../prototypes/files/FileLibraryPrototype";
import { SettingsPrototype } from "../../../../prototypes/settings/SettingsPrototype";
import { LoginPrototype } from "../../../../prototypes/auth/LoginPrototype";
import { WelcomePrototype } from "../../../../prototypes/auth/WelcomePrototype";
import { ChatFirstPrototype } from "../../../../prototypes/organization/ChatFirstPrototype";

const screens = ["chat", "chat-first", "files", "settings", "login", "welcome"] as const;

export function generateStaticParams() {
  return screens.map(screen => ({ screen }));
}

export default async function Page({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;

  switch (screen) {
    case "chat": return <WorkspacePrototype />;
    case "chat-first": return <ChatFirstPrototype />;
    case "files": return <FileLibraryPrototype />;
    case "settings": return <SettingsPrototype />;
    case "login": return <LoginPrototype />;
    case "welcome": return <WelcomePrototype />;
    default: notFound();
  }
}
