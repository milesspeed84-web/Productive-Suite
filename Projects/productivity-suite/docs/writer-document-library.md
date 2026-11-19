# Writer document library and current feature boundary

## Local persistence

Writer documents are stored as separate records in the browser's IndexedDB database `nexus-workspace`, in the `documents` object store. Each record has a UUID, app type, title, HTML content, creation timestamp, and last-modified timestamp. The app and updated-time indexes support per-app libraries and recent-file views. Writes use IndexedDB transactions; a failed transaction surfaces an error instead of changing the UI to a saved state.

On first access, the former `nexus-writer-document` localStorage record is imported once into the library and removed only after the IndexedDB transaction commits. The migration keeps the old title and editor HTML. Browser storage remains local to the browser profile and can still be cleared by the user or browser; this is not a substitute for filesystem save/open, backups, or crash-recovery exports.

## Current Writer behavior

- The Docs navigation and home quick-create action open a Docs landing page. Create New makes a distinct blank document and opens it.
- The library lists real local Writer records, opens by ID, renames without changing identity/content, and deletes only after confirmation.
- The home Recent files area reads the same document store; it no longer shows sample records.
- Autosave is debounced, explicit Save and Ctrl+S are available, and navigation attempts a save before returning to the library. Storage failures are shown as failures.
- The editor currently offers paragraph headings, font family/size, bold/italic/underline/strikethrough, subscript/superscript, text/highlight color, clear formatting, alignment, lists, hyperlinks, inline images, custom-size tables with basic row/column/merge operations, page-break markup, find/replace, zoom, word/character/paragraph counts, and a heading outline.
- Letter/A4 paper size, portrait/landscape, and Normal/Narrow/Wide margins persist with the document and are reflected in the editor canvas and DOCX page setup. Print, TXT import/export, and Save As (a separate local copy) are also available.
- References offers an explicitly static table of contents from headings. The Review accessibility check currently checks only missing image descriptions and skipped heading levels; it is a small local heuristic, not a comprehensive accessibility audit.
- Spreadsheet and Presentation landing pages report that editing and persistent storage are not yet available; they do not fabricate file records.

## Limitations and next engineering work

This is a local document-library foundation and a browser HTML contenteditable editor, not full Word parity. `document.execCommand` is deprecated and browser-dependent. True Word-style pagination, headers/footers, section breaks, a style manager, advanced table layout, image cropping/rotation/wrapping, footnotes/endnotes/citations, comments, track changes, grammar tools, spell dictionaries, comprehensive accessibility review, multi-document editor tabs, filesystem open/save, recovery, and conflict handling are not implemented.

Current DOCX export maps basic paragraphs, headings, inline bold/italic/underline/strike/subscript/superscript, font/color, alignment, basic lists, inserted tables, and the selected page size/orientation/margins. It does not yet preserve images (exported as alt-text placeholders), clickable hyperlinks, rich table formatting, headers/footers, or complex layout. It must not be presented as a fidelity-preserving round-trip format. DOCX/ODT import and reliable format-preserving export require the planned native document engine or a dedicated compatibility layer and round-trip tests.

The automated tests exercise the IndexedDB store with `fake-indexeddb`; they do not simulate a full browser reload or validate Writer interaction in multiple browser engines. Before treating this as production document storage, add browser-level end-to-end tests, storage quota handling, migration recovery tests, and a local-file persistence/import-export design that can later be backed by the native engine.
