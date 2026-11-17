import "server-only";
import { SampleAiError } from "./ai-provider";

/** 완성된 객체 뒤의 설명만 분리한다. 잘린 JSON이나 값·필드는 고치지 않는다. */
export function parseAiJson(text: string): unknown {
  try { return JSON.parse(text); } catch { /* 아래에서 완성된 단일 객체만 확인한다. */ }
  const source = text.trim().replace(/^```(?:json)?\s*\n/iu, "");
  if (!source.startsWith("{")) throw new SampleAiError("unavailable", "invalid-json");
  let quoted = false;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) {
      const tail = source.slice(index + 1).trim().replace(/^```\s*/u, "").replace(/^[}\]]+\s*/u, "");
      let anotherValue = false;
      if (tail) { try { JSON.parse(tail); anotherValue = true; } catch { /* 별도 JSON 값이 아닌 표시 문자열이다. */ } }
      if (/[{\[]/u.test(tail) || anotherValue) break;
      try { return JSON.parse(source.slice(0, index + 1)); } catch { break; }
    }
  }
  throw new SampleAiError("unavailable", "invalid-json");
}
