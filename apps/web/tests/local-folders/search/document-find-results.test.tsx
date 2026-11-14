import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentFindResults } from "../../../src/features/local-folders/search/documents/DocumentFindResults";

describe("search result reading budget", () => {
  it("describes a scan limit without showing a misleading zero exclusion count", () => {
    const html = renderToStaticMarkup(<DocumentFindResults
      result={{ documents: [], complete: false, excluded: [], limits: ["scan-limit"], discoveredFiles: 0 }}
      folderName="synthetic" selectedPaths={[]} onOpenFile={() => {}} onToggle={() => {}}
    />);

    expect(html).toContain("검색 한도 · 상세 보기");
    expect(html).not.toContain("0개 · 상세 보기");
  });
  it("folds and bounds a large exclusion list while leaving the next action clear", () => {
    const html = renderToStaticMarkup(<DocumentFindResults
      result={{ documents: [], complete: false, excluded: Array.from({ length: 361 }, (_, index) => ({ path: [`excluded-${index}.docx`], reason: "unsupported-extension" })), limits: [], discoveredFiles: 361 }}
      folderName="synthetic" selectedPaths={[]} onOpenFile={() => {}} onToggle={() => {}}
    />);

    expect(html).toContain("검색어를 줄이거나 검색 범위를 바꿔 보세요.");
    expect(html).not.toContain("날짜 확인 필요 0");
    expect(html).toContain("361개 · 상세 보기");
    expect(html).toContain("excluded-19.docx");
    expect(html).not.toContain("excluded-20.docx");
    expect(html).toContain("제외 항목 20개 더 보기");
    expect(html).not.toMatch(/<details[^>]* open/);
  });
});
