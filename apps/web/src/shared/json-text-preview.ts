/** Decode a leading JSON string even before its closing quote arrives. Never parse plan fields. */
export function jsonTextPreview(json: string, field: "answer" | "summary"): string {
  let depth = 0;
  let start = -1;
  for (let index = 0; index < json.length; index++) {
    const character = json[index];
    if (character === '"') {
      const match = depth === 1 ? new RegExp(`^"${field}"\\s*:\\s*"`, "u").exec(json.slice(index)) : null;
      if (match) { start = index + match[0].length; break; }
      for (index++; index < json.length; index++) {
        if (json[index] === "\\") index++;
        else if (json[index] === '"') break;
      }
    } else if (character === "{" || character === "[") depth++;
    else if (character === "}" || character === "]") depth--;
  }
  if (start < 0) return "";
  let encoded = "";
  for (let index = start; index < json.length; index++) {
    const character = json[index];
    if (character === '"') break;
    if (character === "\\") {
      const escaped = json[index + 1];
      if (!escaped || (escaped === "u" && json.length < index + 6)) break;
      const length = escaped === "u" ? 6 : 2;
      encoded += json.slice(index, index + length);
      index += length - 1;
    } else encoded += character;
  }
  try { return (JSON.parse(`"${encoded}"`) as string).slice(0, field === "answer" ? 8000 : 500); }
  catch { return ""; }
}
