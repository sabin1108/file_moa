import type { OrganizationScope } from "./source-snapshot";

/** Only unambiguous, known folder references are inferred. Explicit UI choices always win. */
export function inferOrganizationConditions(
  request: string,
  rootName: string,
  folders: readonly (readonly string[])[]
) {
  const result: {
    scope?: OrganizationScope;
    reference?: readonly string[];
    destination?: readonly string[];
  } = {};
  const sources: (readonly string[])[] = [],
    references: (readonly string[])[] = [],
    destinations: (readonly string[])[] = [];
  for (const match of request.matchAll(
    /["“「『]([^"”」』]+)["”」』]\s*(?:폴더\s*)?(에서|안에서|[을를]?\s*기준으로|을 참고|를 참고|으로|로)/gu
  )) {
    const text = match[1].replaceAll(" / ", "/");
    const candidates = folders.filter(path => (path.join("/") || rootName) === text);
    if (candidates.length !== 1) continue;
    if (["에서", "안에서"].includes(match[2])) sources.push(candidates[0]);
    else if (/기준으로|참고/u.test(match[2])) references.push(candidates[0]);
    else destinations.push(candidates[0]);
  }
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const inferSource = !sources.length,
    inferReference = !references.length,
    inferDestination = !destinations.length;
  for (const path of folders) {
    const name = path.join("/") || rootName;
    const prefix = `(?:^|\\s)${escape(name)}\\s*(?:폴더\\s*)?`;
    if (inferSource && new RegExp(prefix + "(?:전체\\s*)?(?:안에서|에서)", "u").test(request))
      sources.push(path);
    if (
      inferReference &&
      new RegExp(prefix + "(?:[을를]?\\s*기준으로|[을를]\\s*참고)", "u").test(request)
    )
      references.push(path);
    if (inferDestination && new RegExp(prefix + "(?:으로|로)(?:\\s|$)", "u").test(request))
      destinations.push(path);
  }
  if (sources.length === 1) result.scope = { kind: "folder", path: [...sources[0]] };
  else if (
    !sources.length &&
    /(?:연결한|연결된)\s*폴더\s*전체(?:에서|를|을)|^전체\s*연결\s*폴더에서/u.test(request)
  )
    result.scope = { kind: "all" };
  if (references.length === 1) result.reference = [...references[0]];
  if (destinations.length === 1) result.destination = [...destinations[0]];
  return result;
}
