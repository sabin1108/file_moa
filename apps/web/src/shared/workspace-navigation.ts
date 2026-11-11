export type WorkspaceMode = "live" | "sample";

export type WorkspaceSection = "chat" | "files" | "settings";

export function workspaceHref(mode: WorkspaceMode, section: WorkspaceSection) {
  const base = mode === "sample" ? "/demo" : "";

  return section === "chat" ? base || "/" : `${base}/${section}`;
}
