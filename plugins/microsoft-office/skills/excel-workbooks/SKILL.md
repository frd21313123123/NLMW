---
name: excel-workbooks
description: Use when Codex needs to inspect, create, edit, review, or transform Microsoft Excel workbooks, including .xlsx, .xlsm, formulas, sheets, tables, ranges, charts metadata, CSV imports, data validation, formatting, and workbook QA.
---

# Excel Workbooks

Use this skill for Microsoft Excel workbooks and related tabular files: `.xlsx`, `.xlsm`, `.csv`, and `.tsv`.

## Default Workflow

1. Preserve the original workbook by writing edits to a new file unless overwrite is explicitly requested.
2. Inspect workbook structure before editing: sheets, dimensions, formulas, tables, merged cells, freeze panes, charts, and hidden sheets.
3. Understand whether the user needs formulas, displayed values, formatting, or all of them.
4. Make targeted edits with `openpyxl` for `.xlsx`/`.xlsm` and standard CSV tools for delimited files.
5. Reopen the output workbook and verify sheet names, dimensions, changed cells, formulas, and formatting-critical areas.
6. Use Excel or LibreOffice recalculation when formula results must be trusted; `openpyxl` can write formulas but does not calculate them.

## Helper Script

Resolve this script relative to this skill directory:

```text
../../scripts/excel_workbook_tool.py
```

Useful commands:

```bash
python ../../scripts/excel_workbook_tool.py inspect workbook.xlsx
python ../../scripts/excel_workbook_tool.py sheet workbook.xlsx --sheet Sheet1 --range A1:D20 --format csv
python ../../scripts/excel_workbook_tool.py find workbook.xlsx "Total"
python ../../scripts/excel_workbook_tool.py set-cell input.xlsx output.xlsx --sheet Sheet1 --cell B2 --value 42 --type number
python ../../scripts/excel_workbook_tool.py replace input.xlsx output.xlsx --find "Draft" --replace "Final"
python ../../scripts/excel_workbook_tool.py csv-to-xlsx input.csv output.xlsx --sheet-name Data
```

## Reading And Analysis

- Inspect formulas separately from cached displayed values.
- Identify hidden sheets and very-hidden sheets before summarizing workbook contents.
- Treat merged cells, tables, charts, pivot tables, named ranges, macros, and external links as workbook features that may need preservation.
- For financial, operational, or audit work, list assumptions about formula calculation and stale cached values.
- For large sheets, sample intelligently and report dimensions before reading entire ranges.

## Editing Rules

- Use `openpyxl` for `.xlsx` and `.xlsm`; load `.xlsm` with VBA preservation when macros must survive.
- Avoid editing unsupported Excel objects directly, including pivot cache internals and complex chart definitions, unless the user accepts risk.
- Keep formulas as formulas. Do not replace formulas with cached values unless requested.
- Use explicit number formats for currency, percentages, dates, and identifiers.
- Preserve sheet order and names unless the task requires changing them.
- If recalculation matters, set workbook calculation mode and verify with Excel/LibreOffice when available.

## Creation Guidance

When creating a workbook:

- Use clear sheet names and freeze panes for wide or long tables.
- Add header styling, filters, number formats, column widths, and formulas when appropriate.
- Keep raw data and summary sheets separate for analytical workbooks.
- Avoid volatile formulas unless specifically needed.
- Reopen the workbook after saving to verify it is readable.

## Verification Checklist

- Workbook opens and can be parsed again.
- Expected sheets exist in the expected order.
- Changed cells contain the expected values or formulas.
- Key formulas are still formulas.
- Number/date formats are appropriate.
- Hidden sheets, macros, and workbook-level features were not lost unexpectedly.
