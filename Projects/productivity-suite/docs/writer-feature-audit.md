# Project Nexus Writer feature audit

Audit date: 2026-11-04  
Scope: the checked-out React Writer and its supporting frontend/storage code, plus the separate `E:\ProductivitySuite\Tools\nexus-docworker` LibreOfficeKit experiment. This is a source inspection, not a claim that every listed control has passed an interaction or file round-trip test.

## Status definitions

- **Implemented and tested:** usable end to end with relevant automated or repeatable manual evidence.
- **Implemented, awaiting manual verification:** code and lower-level tests exist, but the end-user behavior has not been exercised in a browser.
- **Partially implemented:** some real behavior exists, but important cases or compatibility are unverified or absent.
- **Missing:** no implementation found.
- **Blocked:** a dependency or architecture prevents a proper implementation at this stage.

Unless a row says otherwise, a feature is **Missing**. A visible control does not establish implementation. Locations for implemented or partial features are named in the architecture and evidence tables; for Missing items, no implementation location exists. `Writer.tsx` below means `src/Writer.tsx`; `store` means `src/documents/documentStore.ts`.

## Architecture and dependencies

| Area | Current implementation and consequence |
|---|---|
| UI/routing | React 19 single-page frontend. `src/App.tsx` routes to Writer by document ID; Writer is a large component containing ribbon, editing commands, pagination, import/export, and persistence orchestration. |
| Editing/model | Browser `contentEditable` and DOM HTML remain the live document model. The page shell is non-editable; each `.writer-editor` is its own editing host. There is no canonical semantic document model or schema migration. |
| Pagination | `paginateDocument` measures DOM blocks, splits some overflowing paragraphs, and moves DOM nodes between page editors. Page count changes detach and reattach those nodes. Application-owned history now snapshots serialized HTML and selection bookmarks across those moves. The edit-host guard and application history **await repeated-key browser verification**. |
| Undo/recovery | `src/documents/editHistory.ts` stores bounded serialized HTML snapshots, groups rapid same-type input into one undo step, and restores selection bookmarks; Ctrl+Z/Ctrl+Y and toolbar controls use this history. IndexedDB metadata stores recovery drafts, the UI asks whether to restore or discard a newer draft, and normal save clears recovery atomically. Utility/store tests pass; editor behavior and crash-recovery UI **await browser verification**. |
| Persistence | IndexedDB document records store title, HTML string, optional paper/orientation/margins, and timestamps. Save is debounced about 800 ms after React edit revision. A separate recovery draft is queued after 300 ms of inactivity. Explicit Save, Save As copy, and open/reload paths exist. Version history remains absent. |
| Formats | `docx` package builds a DOCX export from a limited HTML subset. TXT import/export exists. Native LOK experiment separately exercises a small DOCX save/reopen path. React Writer is not connected to that worker. No general DOCX importer, ODT, PDF exporter, or RTF support was found. |
| Native engine | Worker is an isolated C++ LOK smoke program, not a long-lived service or UI bridge. It creates a document/view, renders a tile, posts mouse and extended-text-input events, saves/reopens DOCX, and verifies XML. It still uses timed waits (100 ms and 500 ms); `paste()` dispatch failure is documented. No controlled editing/undo/selection regression suite is present. Windows path only was exercised; Linux instructions exist but Linux build/run remains unverified. |
| Test coverage | Automated tests now cover IndexedDB migration, document CRUD/duplication, layout persistence, storage errors, recovery draft store behavior, and grouped history logic. No browser test yet exercises actual Writer typing, pagination, keyboard, undo, or crash recovery. |
| Current failure | User supplied a screenshot of the page shell collapsing after repeated Backspace. The page shell is now non-editable, text areas are independent editing hosts, and a document-level history is implemented. The exact UI failure and undo restoration still **await browser verification**. |

Implementation order implied by dependencies: editing isolation and selection/history/recovery → canonical document representation and pagination → formatting/styles/tables/objects → import/export and round-trip verification → references/review/sections → advanced integrations. External/cloud services and AI remain opt-in and cannot be allowed to mutate content without explicit user action.

## Feature inventory

Status appears at the start of each item. Groups are intentionally explicit so later changes can update a feature without implying neighboring features are complete.

### A. File / Backstage

- **Partially implemented** — New document (created in `App.tsx` through `documentStore.create`; basic creation exists).
- **Implemented, awaiting manual verification** — Open document (local library opens a stored Writer record; arbitrary local DOCX/ODT opening is present).
- **Partially implemented** — Save (IndexedDB write exists; debounced and explicit paths exist; recovery and serialization correctness need editing tests).
- **Partially implemented** — Save As (creates a duplicated local document after prompting for a title; not file-path Save As).
- **Partially implemented** — Save a Copy (same IndexedDB duplication path).
- **Partially implemented** — AutoSave (800 ms debounce after edit revision; not a durable crash-recovery mechanism).
- **Partially implemented** — Print (calls browser `window.print`; no printer selection, range, duplex, collation, scaling, or print dialog settings model).
- **Missing** — Printer selection.
- **Missing** — Print page ranges.
- **Missing** — Duplex printing.
- **Missing** — Print collation.
- **Partially implemented** — Print margins (page layout margins affect the print CSS/page dimensions only; no print-dialog margin setting).
- **Missing** — Print scaling.
- **Missing** — Share.
- **Implemented, awaiting manual verification** — Export to PDF.
- **Missing** — Export to XPS.
- **Missing** — Change file type.
- **Missing** — Publish.
- **Partially implemented** — Document information/management (title, local metadata, and update timestamp exist; rich properties and management tools do not).
- **Missing** — Mark as final.
- **Missing** — Password encryption.
- **Missing** — Restrict editing.
- **Missing** — Restrict access.
- **Missing** — Digital signatures.
- **Partially implemented** — Inspect Document (an accessibility scan exists, but no metadata/privacy/hidden-content inspector).
- **Partially implemented** — Check Accessibility (checks image alt text and heading-level skips only; not a comprehensive checker).
- **Missing** — Check Compatibility.
- **Missing** — Version History.
- **Partially implemented** — Manage Document (local list, duplicate, delete, and open affordances exist; recovery/versions are absent).
- **Partially implemented** — Close (returns to the document library; no close recovery or unsaved-change decision dialog beyond attempting save).
- **Missing** — Account.
- **Missing** — Options.
- **Missing** — Feedback.

### B. Home

#### Clipboard

- **Partially implemented** — Cut, Copy, Paste (browser-native clipboard behavior is relied on; no explicit controls or formatting modes).
- **Missing** — Keep source formatting choice.
- **Missing** — Merge formatting paste.
- **Missing** — Text-only paste.
- **Missing** — Paste Special.
- **Missing** — Format Painter.
- **Missing** — Clipboard pane.

#### Font

- **Partially implemented** — Typeface (limited menu calls `fontName` through `execCommand`; not a document style system).
- **Partially implemented** — Font size (limited preset sizes via browser command).
- **Missing** — Increase font size command.
- **Missing** — Decrease font size command.
- **Missing** — Change case.
- **Partially implemented** — Clear formatting (browser `removeFormat`; behavior on complex content unverified).
- **Partially implemented** — Bold.
- **Partially implemented** — Italic.
- **Partially implemented** — Underline (single browser underline command only).
- **Missing** — Underline styles.
- **Missing** — Underline colors.
- **Partially implemented** — Strikethrough (single style).
- **Missing** — Double strikethrough.
- **Partially implemented** — Subscript.
- **Partially implemented** — Superscript.
- **Missing** — Text effects.
- **Partially implemented** — Text highlighting (browser command and color input; mapping and DOCX preservation unverified).
- **Partially implemented** — Font color (browser command and color input; mapping and DOCX preservation unverified).
- **Missing** — Character spacing.
- **Missing** — Character scaling.
- **Missing** — Kerning.
- **Missing** — Ligatures.
- **Missing** — Small caps.
- **Missing** — All caps formatting.
- **Missing** — Hidden text.

#### Paragraph

- **Partially implemented** — Bullets and numbering (browser unordered/ordered list commands only; multilevel behavior not implemented).
- **Missing** — Multilevel lists.
- **Missing** — Indent controls.
- **Missing** — Sort paragraphs/list items.
- **Missing** — Show/hide formatting marks.
- **Partially implemented** — Left alignment.
- **Partially implemented** — Center alignment.
- **Partially implemented** — Right alignment.
- **Missing** — Justified alignment.
- **Missing** — Distributed alignment.
- **Missing** — Line spacing controls.
- **Missing** — Paragraph spacing controls.
- **Missing** — Paragraph shading.
- **Missing** — Paragraph borders.
- **Missing** — Tab stops.
- **Missing** — Keep with next.
- **Missing** — Keep lines together.
- **Missing** — Widow/orphan control.
- **Missing** — Page break before property.

#### Styles

- **Partially implemented** — Normal (browser paragraph block choice; no named style model).
- **Missing** — No Spacing.
- **Partially implemented** — Title.
- **Partially implemented** — Subtitle.
- **Partially implemented** — Heading 1.
- **Partially implemented** — Heading 2.
- **Missing** — Heading 3 through Heading 9.
- **Missing** — Quote.
- **Missing** — Intense Quote.
- **Missing** — List Paragraph.
- **Missing** — Emphasis.
- **Missing** — Strong.
- **Missing** — Book Title.
- **Missing** — Create style.
- **Missing** — Modify style.
- **Partially implemented** — Clear style/formatting (only browser remove-format command; style-aware clear absent).
- **Partially implemented** — Apply styles (three limited block choices; not persistent named styles).
- **Missing** — Style Inspector.
- **Missing** — Style Pane.
- **Missing** — Style Sets.

#### Editing and additional Home features

- **Partially implemented** — Find (literal text search across text nodes; selection behavior needs test).
- **Implemented, awaiting manual verification** — Undo (bounded app-owned document snapshots; rapid repeated input groups into one step; Ctrl+Z and toolbar action).
- **Implemented, awaiting manual verification** — Redo (app-owned snapshots; Ctrl+Y/Ctrl+Shift+Z and toolbar action).
- **Missing** — Advanced Find.
- **Partially implemented** — Replace current literal match.
- **Partially implemented** — Replace All literal match (not wildcard/format based).
- **Missing** — Wildcard search.
- **Missing** — Formatting-based replacement.
- **Missing** — Go To.
- **Partially implemented** — Select all (browser editing command behavior only).
- **Missing** — Select objects.
- **Missing** — Select similar formatting.
- **Missing** — Dictation.
- **Missing** — Sensitivity labels.
- **Missing** — Spelling and grammar.
- **Missing** — Clarity and writing suggestions.
- **Missing** — Reuse Files.
- **Missing** — Add-ins.

### C. Insert

#### Pages

- **Missing** — Cover Page.
- **Missing** — Blank Page insertion.
- **Partially implemented** — Page Break (inserts a break marker; pagination and round-trip semantics need tests).

#### Tables

- **Partially implemented** — Insert table (prompted row/column counts; no grid picker).
- **Missing** — Draw Table.
- **Missing** — Convert text to table.
- **Missing** — Embed spreadsheet.
- **Missing** — Quick Tables.

#### Illustrations

- **Partially implemented** — Pictures from device (data URL insertion and basic resize/removal exist; crop, persistence, alt text UX, and DOCX media export are absent/unverified).
- **Missing** — Stock pictures.
- **Missing** — Online pictures.
- **Missing** — Shapes.
- **Missing** — Icons.
- **Missing** — 3D models.
- **Missing** — SmartArt.
- **Missing** — Charts.
- **Missing** — Screenshots and screen clipping.

#### Add-ins and media

- **Missing** — Get Add-ins.
- **Missing** — My Add-ins.
- **Missing** — Wikipedia integration.
- **Missing** — Online video.
- **Missing** — Audio.

#### Links, comments, headers/footers, text, and symbols

- **Partially implemented** — Hyperlinks (browser createLink command; safe destination behavior and round-trip need tests).
- **Missing** — Bookmarks.
- **Missing** — Cross-references.
- **Missing** — New comments.
- **Missing** — Headers.
- **Missing** — Footers.
- **Missing** — Page numbers.
- **Missing** — Header/footer positions and formats.
- **Missing** — Text boxes.
- **Missing** — Quick Parts.
- **Missing** — Building blocks.
- **Missing** — Document properties fields.
- **Missing** — Fields.
- **Missing** — WordArt.
- **Missing** — Drop caps.
- **Missing** — Signature lines.
- **Missing** — Date and time insertion.
- **Missing** — Embedded objects.
- **Missing** — Objects from files.
- **Missing** — Equations.
- **Missing** — Ink equations.
- **Missing** — Symbols.
- **Missing** — Special characters.

### D. Draw

- **Missing** — Pens.
- **Missing** — Pencils.
- **Missing** — Highlighters.
- **Missing** — Eraser.
- **Missing** — Lasso selection.
- **Missing** — Ink-to-shape conversion.
- **Missing** — Ink-to-math conversion.
- **Missing** — Ink replay.
- **Missing** — Convert ink to shapes.
- **Missing** — Touch drawing.

### E. Design

- **Missing** — Themes.
- **Missing** — Style Sets.
- **Missing** — Theme colors.
- **Missing** — Theme fonts.
- **Missing** — Paragraph spacing presets.
- **Missing** — Theme effects.
- **Missing** — Set as default.
- **Missing** — Watermark.
- **Missing** — Page color.
- **Missing** — Page borders.

### F. Layout

#### Page Setup

- **Missing** — Normal margins preset.
- **Partially implemented** — Narrow margins preset (sets equal margins to 0.75 in).
- **Missing** — Mirrored margins.
- **Partially implemented** — Custom margins (three uniform presets only; individual sides unavailable).
- **Partially implemented** — Portrait orientation.
- **Partially implemented** — Landscape orientation.
- **Partially implemented** — A4 page size.
- **Partially implemented** — Letter page size.
- **Missing** — Other page sizes.
- **Missing** — Columns.
- **Partially implemented** — Page breaks.
- **Missing** — Column breaks.
- **Missing** — Text-wrapping breaks.
- **Missing** — Next-page section break.
- **Missing** — Continuous section break.
- **Missing** — Even-page section break.
- **Missing** — Odd-page section break.
- **Missing** — Line numbers.
- **Missing** — Hyphenation.

#### Paragraph and Arrange

- **Missing** — Left indentation.
- **Missing** — Right indentation.
- **Missing** — Spacing before.
- **Missing** — Spacing after.
- **Partially implemented** — Basic inline image sizing/alignment only; general object positioning is absent.
- **Missing** — Square text wrapping.
- **Missing** — Tight text wrapping.
- **Missing** — Through text wrapping.
- **Missing** — Top and bottom wrapping.
- **Missing** — Behind-text wrapping.
- **Missing** — In-front-of-text wrapping.
- **Partially implemented** — Inline image placement (browser inline DOM flow only).
- **Missing** — Bring forward.
- **Missing** — Send backward.
- **Missing** — Selection Pane.
- **Missing** — Object alignment controls.
- **Missing** — Group objects.
- **Missing** — Ungroup objects.
- **Missing** — Rotate objects.

### G. References

#### Table of Contents

- **Partially implemented** — Automatic TOC (current command inserts a static linked list from headings, not a dynamic field).
- **Partially implemented** — Manual TOC (static text/links can be inserted).
- **Missing** — Custom TOC.
- **Missing** — Update TOC.

#### Notes, research, citations, captions, index, authority

- **Missing** — Insert footnotes.
- **Missing** — Insert endnotes.
- **Missing** — Navigate between notes.
- **Missing** — Show notes.
- **Missing** — Convert footnotes/endnotes.
- **Missing** — Smart Lookup.
- **Missing** — Researcher.
- **Missing** — Insert citations.
- **Missing** — Manage sources.
- **Missing** — APA citation style.
- **Missing** — MLA citation style.
- **Missing** — Chicago citation style.
- **Missing** — Other citation styles.
- **Missing** — Generate bibliography.
- **Missing** — Insert captions.
- **Missing** — Table of Figures.
- **Missing** — Update Table of Figures.
- **Missing** — Cross-references.
- **Missing** — Mark index entries.
- **Missing** — Insert index.
- **Missing** — Update index.
- **Missing** — Mark authority citations.
- **Missing** — Generate Table of Authorities.

### H. Mailings

- **Missing** — Create envelopes.
- **Missing** — Create labels.
- **Missing** — Mail merge letters.
- **Missing** — Mail merge emails.
- **Missing** — Mail merge envelopes.
- **Missing** — Mail merge labels.
- **Missing** — Mail merge directory.
- **Missing** — Type recipient lists.
- **Missing** — Import existing recipient lists.
- **Blocked** — Outlook contacts (no Outlook integration or account connector).
- **Missing** — Edit recipient lists.
- **Missing** — Highlight merge fields.
- **Missing** — Address blocks.
- **Missing** — Greeting lines.
- **Missing** — Insert merge fields.
- **Missing** — Conditional merge rules.
- **Missing** — Match fields.
- **Missing** — Update labels.
- **Missing** — Preview results.
- **Missing** — Finish and merge.

### I. Review

#### Proofing, accessibility, speech, language

- **Missing** — Spelling and grammar proofing.
- **Missing** — Thesaurus.
- **Partially implemented** — Word count/character count/paragraph count in status bar (no richer statistics; page count is layout-derived and needs validation).
- **Missing** — Writing suggestions.
- **Partially implemented** — Accessibility checker (limited checks described under File/Backstage).
- **Missing** — Read Aloud.
- **Missing** — Translation.
- **Missing** — Language preferences.
- **Missing** — Proofing language.

#### Comments, tracking, compare, protection, other

- **Missing** — Create comments.
- **Missing** — Delete comments.
- **Missing** — Previous/next comment.
- **Missing** — Show/hide comments.
- **Missing** — Track Changes.
- **Missing** — All Markup.
- **Missing** — Simple Markup.
- **Missing** — No Markup.
- **Missing** — Original view.
- **Missing** — Reviewing Pane.
- **Missing** — Show Markup options.
- **Missing** — Accept changes.
- **Missing** — Reject changes.
- **Missing** — Previous/next change.
- **Missing** — Lock tracking.
- **Missing** — Compare documents.
- **Missing** — Combine revisions.
- **Missing** — Restrict editing.
- **Missing** — Block authors.
- **Missing** — Hide ink.
- **Missing** — Linked notes.
- **Blocked** — OneNote integration (no integration service or account connector).

### J. View

#### Views and page movement

- **Missing** — Read Mode.
- **Partially implemented** — Print Layout (current page shell is a screen approximation; no verified print parity).
- **Missing** — Web Layout.
- **Missing** — Outline view (outline sidebar lists headings but does not provide an editable outline view).
- **Missing** — Draft view.
- **Missing** — Immersive Reader.
- **Missing** — Focus.
- **Partially implemented** — Vertical page movement (pages are stacked vertically).
- **Partially implemented** — Side-to-side page movement (facing-page display toggle exists; navigation behavior not tested).

#### Show, zoom, windows, macros, other

- **Missing** — Ruler.
- **Missing** — Gridlines.
- **Partially implemented** — Navigation Pane (outline sidebar only; no navigation search pane).
- **Partially implemented** — Zoom control (60–160% page style zoom).
- **Missing** — 100% zoom command.
- **Missing** — One Page zoom.
- **Missing** — Multiple Pages zoom command.
- **Missing** — Page Width zoom.
- **Missing** — New window.
- **Missing** — Arrange all.
- **Missing** — Split window.
- **Missing** — View side by side.
- **Missing** — Synchronous scrolling.
- **Missing** — Reset window position.
- **Missing** — Switch windows.
- **Missing** — View macros.
- **Missing** — Record macros.
- **Missing** — Pause macro recording.
- **Blocked** — SharePoint properties (no SharePoint connector).
- **Missing** — Dark mode for Writer document surface.
- **Missing** — Document page-color toggle.

### K. Table Design and Layout — Contextual Tabs

- **Missing** — Table styles.
- **Missing** — Cell shading.
- **Partially implemented** — Basic cell borders via default CSS; border controls absent.
- **Missing** — Border styles.
- **Missing** — Border pen color.
- **Missing** — Header row option.
- **Missing** — Banded rows.
- **Missing** — First column option.
- **Missing** — Last column option.
- **Partially implemented** — Select table cells via native selection only; no table selection commands.
- **Missing** — Show/hide table gridlines.
- **Missing** — Table properties.
- **Missing** — Draw table.
- **Missing** — Eraser.
- **Partially implemented** — Delete table (removes selected table from DOM).
- **Partially implemented** — Insert row above/below (current Add row inserts below selected row only).
- **Partially implemented** — Insert columns left/right (current Add column inserts adjacent only).
- **Partially implemented** — Merge cells (attempts merge of selected cells; rectangular selection validation absent).
- **Partially implemented** — Split cells (limited selected-cell split behavior).
- **Missing** — Split tables.
- **Missing** — AutoFit.
- **Missing** — Cell height and width.
- **Missing** — Distribute rows and columns.
- **Missing** — Nine cell-alignment positions.
- **Missing** — Text direction.
- **Missing** — Cell margins.
- **Missing** — Sort table.
- **Missing** — Repeat header rows.
- **Missing** — Convert table to text.
- **Missing** — Table formulas.

### L. Picture, Shape, and Other Contextual Tabs

#### Pictures

- **Missing** — Remove background.
- **Missing** — Picture corrections.
- **Missing** — Picture color controls.
- **Missing** — Artistic effects.
- **Missing** — Transparency.
- **Missing** — Compress pictures.
- **Missing** — Change picture.
- **Missing** — Reset picture.
- **Missing** — Picture styles.
- **Missing** — Picture borders.
- **Missing** — Picture effects.
- **Missing** — Picture layout.
- **Partially implemented** — Alt text (import may retain alt attribute; no editor UI or checker beyond empty-alt count).
- **Missing** — Crop.
- **Missing** — Aspect ratio controls.
- **Partially implemented** — Dimensions (rough percentage resize buttons only).

#### Shapes, SmartArt, Charts

- **Missing** — Shape fill.
- **Missing** — Shape outline.
- **Missing** — Shape effects.
- **Missing** — Edit shape points.
- **Missing** — Merge shapes.
- **Missing** — SmartArt add shapes.
- **Missing** — SmartArt promote/demote.
- **Missing** — SmartArt layouts.
- **Missing** — SmartArt colors.
- **Missing** — Chart elements.
- **Missing** — Chart quick layout.
- **Missing** — Change chart type.
- **Missing** — Edit chart data.
- **Missing** — Select chart data.

### M. Developer Tab

- **Missing** — Enable Developer tab through Options.
- **Blocked** — Visual Basic (Microsoft VBA host/compatibility is not present; a safe, portable macro model would be a separate architectural choice).
- **Missing** — Macros.
- **Missing** — Macro security.
- **Missing** — Rich-text content controls.
- **Missing** — Plain-text content controls.
- **Missing** — Picture controls.
- **Missing** — Combo boxes.
- **Missing** — Dropdown controls.
- **Missing** — Date pickers.
- **Missing** — Checkboxes.
- **Missing** — Repeating sections.
- **Missing** — Building block galleries.
- **Missing** — Legacy form controls.
- **Missing** — Design Mode.
- **Missing** — Group controls.
- **Missing** — Restrict editing controls.
- **Missing** — XML mapping.
- **Missing** — XML schemas.
- **Missing** — Templates.
- **Missing** — Add-ins.

### N. Other Core Capabilities

#### Fields, templates, collaboration, sections, master documents

- **Missing** — Page fields.
- **Missing** — Date fields.
- **Missing** — TOC fields.
- **Missing** — Formula fields.
- **Missing** — Merge fields.
- **Missing** — Sequence fields.
- **Missing** — Other standard document fields.
- **Missing** — Field-code display toggle / Alt+F9.
- **Missing** — DOTX templates.
- **Blocked** — DOTM templates (macro-enabled format requires an explicit macro/security and compatibility architecture).
- **Missing** — Custom templates.
- **Blocked** — Real-time co-authoring (no collaboration transport, locking, or merge model).
- **Blocked** — @mentions (no identity/comment collaboration model).
- **Blocked** — Share links (no sync/backend service).
- **Blocked** — Permissions (no identity/access-control service).
- **Missing** — Version history.
- **Missing** — Section model.
- **Missing** — Different headers/footers by section.
- **Missing** — Different page orientations by section.
- **Missing** — Section-specific page layouts.
- **Missing** — Master documents.
- **Missing** — Subdocuments.
- **Missing** — Outline-based master document organization.

#### Accessibility and productivity

- **Partially implemented** — Image alt text storage (HTML attribute only; editing UI and DOCX preservation unverified).
- **Missing** — Reading order tools.
- **Missing** — Immersive Reader.
- **Missing** — High contrast mode.
- **Partially implemented** — Accessibility checker (two checks only; not standards-complete).
- **Missing** — Macros.
- **Missing** — Quick Access Toolbar.
- **Missing** — Ribbon customization.
- **Missing** — AutoCorrect.
- **Missing** — AutoFormat.
- **Missing** — AutoText.
- **Implemented, awaiting manual verification** — AutoRecover/crash recovery (IndexedDB recovery drafts are written separately and presented on reopen; UI/browser interruption behavior remains unverified).
- **Missing** — Search/Tell Me command bar.
- **Missing** — Smart Lookup.
- **Missing** — Language and proofing tools.
- **Missing** — Text prediction.
- **Missing** — Equations.
- **Missing** — Ligatures and OpenType features.
- **Missing** — Linked objects.
- **Missing** — Embedded objects.
- **Missing** — OLE.
- **Missing** — Themes.
- **Missing** — Style Sets.
- **Missing** — Building blocks.

#### Platform adaptation

- **Partially implemented** — Responsive UI (limited CSS breakpoints; narrow-screen editing usability is unverified).
- **Partially implemented** — Reduced features on smaller screens (some side panels stack; no feature adaptation model).
- **Blocked** — Full desktop/web parity (the current app is a Vite frontend without a production desktop host or native-worker bridge).

### O. AI and Intelligent Assistance

- **Missing** — AI-assisted document creation.
- **Missing** — Generate documents from prompts/source materials.
- **Missing** — Rewrite selected text.
- **Missing** — Improve clarity.
- **Missing** — Improve tone.
- **Missing** — Improve grammar.
- **Missing** — Improve flow.
- **Missing** — Summarize documents.
- **Missing** — Explain selected content.
- **Missing** — Suggest structural improvements.
- **Missing** — AI awareness of headings/sections/tables/document structure.
- **Missing** — AI assistance with tracked changes/comments.
- **Missing** — Multi-step editing with visible progress.
- **Missing** — AI-generated headers/footers/columns/margins/layout.
- **Missing** — Dynamic AI-assisted page/date field updates.
- **Implemented, awaiting manual verification** — AI disabled by default: Writer contains no AI provider integration or content transmission path.
- **Implemented, awaiting manual verification** — No external provider receives document content in this implementation.
- **Missing** — Local model integration.
- **Missing** — Self-hosted model integration.
- **Missing** — User-configured provider integration.
- **Missing** — Local-versus-external processing disclosure and approval UI.
- **Missing** — Privacy-protected document mode.
- **Missing** — Proposed-change review and explicit apply workflow.
- **Missing** — Formatting/structure preservation for AI edits.
- **Missing** — Guard against silent whole-document rewrite (there is currently no AI editing path).

## File compatibility and evidence

| Format/capability | Audit status | Evidence and limitation |
|---|---|---|
| DOCX export from browser Writer | **Partially implemented** | `exportDocx` maps basic paragraphs, headings 1–6, limited inline styles/lists, basic tables, page dimensions/margins to `docx`. Images are converted to alt-text runs by `runsFromNode`, not embedded images. Many HTML semantics are dropped. No Writer DOCX round-trip test exists. |
| DOCX through native worker | **Partially implemented** | Separate smoke test saves, closes, reopens, resaves, then checks `word/document.xml` for a Unicode text string. It is not connected to frontend Writer and does not validate preservation of formatting, tables, images, metadata, or edits. |
| DOCX import | **Implemented, awaiting manual verification** | The import UI now offers an “Import DOCX” button in the Insert ribbon, uses mammoth to convert to HTML, creates a Writer document, and preserves headings, bold, lists, images, tables, links and page breaks (subject to mammoth conversion limits). |
| ODT import/export | **Missing** | No implementation found. |
| PDF export | **Missing** | Browser print dialog is not PDF export implementation. |
| TXT import/export | **Partially implemented** | TXT import creates paragraphs and export extracts `innerText`; formatting and complex content are intentionally lost. |
| RTF import/export | **Missing** | No implementation found. |

## Testing requirements and current test state

The current automated tests cover document-store migration/CRUD/duplication/layout persistence and storage errors, recovery-draft persistence/clearing, and the history utility's grouping, undo/redo, and memory bound. They do **not** test the actual Writer editing UI, page wrappers, pagination, repeated keyboard deletion, the Undo/Redo integration, crash recovery after a browser interruption, tables, images, formatting, or import/export.

Required next tests, ordered by data-loss risk:

1. Browser test: type into each page; repeat Backspace/Delete through the final character; page/editor wrappers stay mounted; the app remains responsive; undo restores exact pre-delete content; redo reapplies it.
2. Repeat across page-count growth and shrink, while typing is held across pagination debounce; verify selection and page snippets.
3. Undo/redo tests for text, selection replacement, paste, formatting, table operations, page breaks, and cross-page deletion.
4. Save/reload tests before and after rapid edits, reload/crash simulation, and local recovery; verify content bytes/structure from IndexedDB.
5. Export package content inspection for document paragraphs, styles, tables, image media, relationships, page setup, and Unicode; round-trip DOCX and ODT only after real import paths exist.
6. Pagination tests for long paragraphs, Unicode graphemes, lists, tables, images, manual breaks, page layout changes, and empty/trailing pages.

### Audit outcome

The current Writer is a functional local HTML editor with basic formatting, a custom page display, limited tables/images, browser print, literal find/replace, local IndexedDB persistence, TXT import/export, and constrained DOCX export. It is not currently a comprehensive Word-compatible processor. App-owned undo/redo snapshots and a separate recovery draft now provide the first reliability layer; the immediate priority is browser verification of repeated deletion, pagination, undo, and refresh recovery. After that, replace the DOM-as-model foundation incrementally before expanding the ribbon. The native LOK investigation is a promising separate compatibility route but remains a smoke test and cannot yet serve as a frontend engine.
