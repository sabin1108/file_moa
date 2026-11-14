"""Read-only fixture verification, separate from app parsers and model evaluation."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

from openpyxl import load_workbook
from pypdf import PdfReader


def normalize(value):
    return "".join(value.split())


root = Path(__file__).parent / "v1"
dataset = json.loads((root / "dataset.json").read_text(encoding="utf-8"))
catalog_path = Path(__file__).resolve().parents[3] / "apps/web/src/server/demo/sample-data/catalog.json"
catalog = json.loads(catalog_path.read_text(encoding="utf-8")) if catalog_path.exists() else None
checked = 0
for document in dataset["documents"]:
    if document["format"] not in ("pdf", "xlsx"):
        continue
    file = root / document["file"]
    assert hashlib.sha256(file.read_bytes()).hexdigest() == document["sha256"]
    if document["format"] == "pdf":
        reader = PdfReader(file)
        assert not reader.is_encrypted
        assert len(reader.pages) == 2
        extracted = " ".join(page.extract_text() for page in reader.pages)
    else:
        with ZipFile(file) as archive:
            assert not any(name.endswith("vbaProject.bin") for name in archive.namelist())
        workbook = load_workbook(file, data_only=True, read_only=True)
        sheet = workbook["학습계획"]
        assert sheet["C11"].value == sum(sheet[f"C{row}"].value for row in range(6, 10)) == 10.5
        if catalog:
            public = next(item for item in catalog["documents"] if item["id"] == document["id"])
            expected_rows = [[sheet.cell(row, column).value if sheet.cell(row, column).value is not None else ""
                              for column in range(1, 5)] for row in [5, 6, 7, 8, 9, 11]]
            assert public["sheet"]["rows"] == expected_rows
        extracted = " ".join(str(cell.value) for row in sheet for cell in row if cell.value is not None)
        workbook.close()
        formulas = load_workbook(file, data_only=False, read_only=True)
        assert formulas["학습계획"]["C11"].value == "=SUM(C6:C9)"
        formulas.close()
    for quote in document["evidence"]["quotes"]:
        assert normalize(quote) in normalize(extracted), (document["id"], quote)
        assert normalize(quote) in normalize(document["excerpt"]), (document["id"], quote)
    checked += 1
assert checked == 2
print("Verified PDF pages and XLSX cells/formula/cache against curated excerpt anchors.")
