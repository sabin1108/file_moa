import { classifyConversationRequest } from "./request-routing";

export type WorkspaceRequestKind = "chat" | "find" | "organize" | "grounded";

export function classifyWorkspaceRequest(request: string, prepared: boolean): WorkspaceRequestKind | "choose" {
  const text = request.trim();
  if (/찾지|검색하지|정리하지|분류하지|이동하지|복사하지/u.test(text)) return "chat";
  const material = /자료|파일|폴더|문서|보고서/u.test(text);
  if (!material) return "chat";
  if (/방법|하는\s*법|원리|뜻|차이|무엇|뭐야/u.test(text) && !/정리해|분류해|이동해|복사해|실행해|적용해/u.test(text)) return "chat";
  if (/요약|설명|질문|답변|비교|분석/u.test(text) && !/찾|검색|정리|분류|이동|복사/u.test(text)) return prepared ? "grounded" : "choose";
  if (/방법|하는\s*법/u.test(text)) return "choose";
  return classifyConversationRequest(text) ?? "choose";
}
