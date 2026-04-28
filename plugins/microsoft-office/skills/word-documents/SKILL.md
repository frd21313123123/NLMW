---
name: word-documents
description: Use when Codex needs to inspect, create, edit, review, or transform Microsoft Word .docx documents, including text, headings, tables, images, styles, document metadata, formatting checks, and export-ready QA.
---

# Word Documents

Use this skill for `.docx` work: reading document structure, extracting content, editing text, building new Word files, filling templates, reviewing formatting, and preparing export-ready documents.

## Default Workflow

1. Confirm the intended output when the request could change the source document.
2. Preserve the original file by writing edits to a new `.docx` unless overwrite is explicitly requested.
3. Inspect document structure before making changes: paragraphs, headings, tables, sections, images, metadata, comments/footnotes presence, and styles.
4. Make the smallest reliable edit that satisfies the request.
5. Reopen the output document and verify text, tables, and metadata changed as expected.
6. Render pages or use a visual check when layout, spacing, page breaks, headers, footers, or print readiness matters.

## Helper Script

Resolve this script relative to this skill directory:

```text
../../scripts/word_docx_tool.py
```

Useful commands:

```bash
python ../../scripts/word_docx_tool.py inspect input.docx
python ../../scripts/word_docx_tool.py extract input.docx --format markdown
python ../../scripts/word_docx_tool.py find input.docx "Invoice"
python ../../scripts/word_docx_tool.py stats input.docx
python ../../scripts/word_docx_tool.py replace input.docx output.docx --find "{{NAME}}" --replace "Jane Smith"
```

## Reading And Analysis

- Build an outline from heading styles before summarizing long documents.
- Treat tables as structured data, not as plain text, when the user's task depends on row/column relationships.
- Check document properties and embedded media when provenance, branding, or privacy matters.
- For contracts, resumes, reports, and formal letters, inspect headers, footers, numbering, page breaks, and table boundaries before editing.
- If the document uses comments, tracked changes, content controls, equations, or embedded objects, say what can and cannot be preserved by the available tooling before changing the file.

## Editing Rules

- Prefer `python-docx` for `.docx` creation and straightforward edits.
- Keep existing styles where possible; do not flatten formatted content unless the user accepts that tradeoff.
- For find/replace, prefer run-level replacement when possible so inline formatting survives.
- Be careful with replacements that cross run boundaries; verify results by extracting text after saving.
- Do not claim Microsoft Word tracked changes support unless using a tool that actually writes tracked revisions.
- Do not silently remove comments, footnotes, endnotes, bookmarks, fields, or content controls.
- For `.doc` binary files, convert to `.docx` with an available Office-compatible tool before editing, or explain that conversion is required.

## Creation Guidance

When creating a new Word file:

- Use semantic styles for headings, body text, lists, captions, and table headers.
- Keep tables narrow enough for the target page size.
- Set document metadata when requested.
- Add page breaks and sections intentionally; avoid manual blank-line spacing for layout.
- Reopen and inspect the output before delivering it.

## Verification Checklist

- File opens and can be parsed again.
- Expected text was added, removed, or changed.
- Tables still have the expected row and column counts.
- Important styles are still present.
- No unexpected source overwrite occurred.
- Layout-sensitive requests received a render or screenshot check where available.
