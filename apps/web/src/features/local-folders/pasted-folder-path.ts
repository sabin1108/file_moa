import { parsePlanDestination } from "./operations/planning/file-change-plan";
/** OS 접두 경로의 동일성을 주장하지 않고 연결 루트 아래 상대 후보만 반환한다. */

export function parsePastedFolderPath(input: string, rootName: string): {
  path: string[];
  requiresConfirmation: boolean;
} {
  let text = input.trim();

  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  }

  if (/^[\\/]{2}/.test(text)) {
    throw Error("unsupported-network-path");
  }

  const absolute = /^[a-z]:[\\/]/i.test(text);
  const normalized = (absolute ? text.slice(3) : text).replaceAll("\\", "/").replace(/\/$/, "");
  const parts = parsePlanDestination(normalized);

  if (!absolute) {
    return { path: parts[0] === rootName ? parts.slice(1) : parts, requiresConfirmation: false };
  }

  const matches = parts.flatMap((part, index) => part === rootName ? [index] : []);

  if (matches.length !== 1) {
    throw Error("ambiguous-connected-root");
  }

  return { path: parts.slice(matches[0] + 1), requiresConfirmation: true };
}
