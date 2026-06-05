# Microsoft Office Plugin

This local Codex plugin adds focused workflows for Microsoft Word and Excel files.

## Components

- `skills/word-documents`: Inspect, create, edit, review, and transform `.docx` files.
- `skills/excel-workbooks`: Inspect, create, edit, review, and transform `.xlsx`, `.xlsm`, and tabular exports.
- `scripts/word_docx_tool.py`: Small command-line helper for `.docx` inspection, extraction, finding, statistics, and safe run-level replacements.
- `scripts/excel_workbook_tool.py`: Small command-line helper for workbook inspection, sheet export, search, cell updates, replacements, and CSV-to-XLSX conversion.

## Runtime Notes

The helper scripts use common Python Office libraries:

- Word: `python-docx`
- Excel: `openpyxl`

When running in Codex, load the bundled workspace dependencies first if the active environment does not already provide these libraries.

## Typical Requests

- "Review this DOCX and point out formatting issues."
- "Extract all tables from this Word file."
- "Create an Excel workbook from this CSV and add formulas."
- "Find formulas and suspicious blank cells in this workbook."
- "Update these placeholders in a DOCX without overwriting the original."

## Safety Defaults

- Preserve source files unless the user explicitly asks to overwrite them.
- Write edited documents to a new output path.
- Inspect structure before changing complex files.
- Verify output by reopening it after changes.
- State tool limitations clearly, especially for tracked changes, comments, macros, pivot tables, and formula recalculation.
