import hashlib
import json
from pathlib import Path
from openpyxl import load_workbook

root = Path("tests/fixtures/classification/business-v1")
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
catalog = json.loads(Path("apps/web/src/server/demo/sample-data/business-documents.json").read_text(encoding="utf-8"))
for item in manifest["documents"]:
    name = item["name"] if item["format"] == "xlsx" else item["id"].split("-")[1] + "-" + item["name"]
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == item["sha256"]
for item in manifest["spreadsheets"]:
    path = root / item["name"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"]
    formulas = load_workbook(path, data_only=False)
    values = load_workbook(path, data_only=True, read_only=True)
    assert formulas["요약"]["D9"].value == item["totalFormula"]
    rows = [list(row) for row in values["요약"].iter_rows(min_row=5, max_row=9, max_col=4, values_only=True)]
    for actual, expected in zip(rows, item["rows"]):
        for cell, target in zip(actual, expected):
            assert abs(cell - target) < 1e-9 if isinstance(target, (float, int)) else cell == target
    assert rows == next(doc["sheet"]["rows"] for doc in catalog if doc["id"] == item["id"])
    assert formulas["요약"].sheet_view.showGridLines is False
    formulas.close()
    values.close()
print(json.dumps({"xlsx": len(manifest["spreadsheets"]), "hashes_formulas_cached_values_and_preview": "passed"}))
