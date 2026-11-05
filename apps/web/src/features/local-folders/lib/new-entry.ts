export type EntryKind = "folder" | "txt" | "md";
export const FOLDER_RECORDS_DIRECTORY = ".moa-history";

function validateName(name: string) {
  if (!name || name.toLowerCase() === FOLDER_RECORDS_DIRECTORY || name.length > 255 || name.trim() !== name || /[. ]$/.test(name)
    || /[/\\<>:"|?*\u0000-\u001f]/u.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error("invalid-entry-name");
  }
}

/** 명시한 TXT/MD 확장자를 우선한다. 폼 미리보기·실제 생성·기록이 같은 종류와 이름을 쓴다. */
export function resolveNewEntry(rawName: string, selectedKind: EntryKind = "folder"): { name: string; kind: EntryKind } {
  if (!["folder", "txt", "md"].includes(selectedKind)) throw new Error("invalid-entry-kind");
  validateName(rawName);
  let name = rawName.normalize("NFC");
  const suffix = name.toLowerCase().split(".").at(-1);
  const kind = name.includes(".") && (suffix === "txt" || suffix === "md") ? suffix : selectedKind;
  if (kind !== "folder" && !name.toLowerCase().endsWith(`.${kind}`)) name += `.${kind}`;
  validateName(name);
  return { name, kind };
}

export function resolveEntryName(rawName: string, kind: EntryKind = "folder"): string {
  return resolveNewEntry(rawName, kind).name;
}
