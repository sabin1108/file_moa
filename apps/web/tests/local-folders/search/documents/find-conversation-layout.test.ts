import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationWorkspace } from "../../../../src/components/layout/ConversationWorkspace";

describe("검색 조건을 확인하는 대화 화면", () => {
  it("현재 질문 앞의 기록은 접어 보존하고 현재 검색 질문과 조작은 펼쳐 둔다", () => {
    const html = renderToStaticMarkup(createElement(ConversationWorkspace, {
      messages: [
        { id: "old:q", author: "user", text: "이전 질문" },
        { id: "old:a", author: "assistant", text: "이전 답변" },
        { id: "find:q", author: "user", text: "현재 검색 조건" },
        { id: "find:a", author: "assistant", text: "검색 범위를 확인해 주세요" },
      ], collapseBeforeMessageId: "find:a", draft: "", onDraftChange() {}, onSend() {},
      canSend: true, panel: null, intro: null, panelOpen: false, onPanelChange() {},
      messageActions: message => message.id === "find:a" ? createElement("button", { "data-find-search": true }, "검색 시작") : null,
    }));
    expect(html).toMatch(/<details[^>]*><summary>앞선 대화/);
    expect(html).toContain("이전 질문");
    expect(html).toContain("이전 답변");
    expect(html.indexOf("</details>")).toBeLessThan(html.indexOf("현재 검색 조건"));
    expect(html.indexOf("</details>")).toBeLessThan(html.indexOf("검색 시작"));
  });
});
