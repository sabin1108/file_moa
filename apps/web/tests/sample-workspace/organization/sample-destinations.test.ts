import { describe, expect, it } from "vitest";
import type { SampleCatalog } from "../../../src/shared/sample-contract";
import { listSampleDestinations } from "../../../src/features/sample-workspace/organization/sample-destinations";
import { DestinationPickerController } from "../../../src/features/local-folders/destination-picker/destination-picker-controller";

const catalog: SampleCatalog = {
  version: "1",
  documents: [],
  folders: [{ id: "meeting", label: "업무/회의" }, { id: "finance", label: "업무/재무" }, { id: "learning", label: "학습" }]
};

describe("shared destination picker with sample directories", () => {
  it("SAMPLE-003 lists a bounded hierarchy and rejects missing or escaping paths", () => {
    expect(listSampleDestinations(catalog, []).entries).toEqual([{ name: "정리한 자료", kind: "directory" }]);
    expect(listSampleDestinations(catalog, ["정리한 자료", "업무"]).entries.map(entry => entry.name)).toEqual(["회의", "재무"]);
    expect(listSampleDestinations(catalog, ["정리한 자료", "학습"]).entries).toEqual([]);
    expect(() => listSampleDestinations(catalog, ["private"])).toThrow();
    expect(() => listSampleDestinations(catalog, [".."]))
      .toThrow();
  });

  it("SAMPLE-003 reuses enter, parent, root and explicit selection without file handles", async () => {
    const picker = new DestinationPickerController(async path => listSampleDestinations(catalog, path), () => { });

    await picker.show([]);
    await picker.enter("정리한 자료");
    await picker.enter("업무");
    await picker.enter("회의");
    expect(picker.selectedPath()).toEqual(["정리한 자료", "업무", "회의"]);
    await picker.parent();
    expect(picker.selectedPath()).toEqual(["정리한 자료", "업무"]);
    await picker.root();
    expect(picker.selectedPath()).toEqual([]);
    picker.close();
    expect(picker.selectedPath()).toBeNull();
  });
});
