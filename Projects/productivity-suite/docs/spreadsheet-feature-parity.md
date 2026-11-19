# Nexus Spreadsheet — Microsoft Excel Feature Parity Matrix

**Last Updated:** November 2026  
**Engineering Owner:** Antigravity  
**Benchmark Reference:** Microsoft Excel (Desktop & Web)  
**Target Environment:** Project Nexus Web Application (Free, Open-Source, Linux-First)

---

## 1. Feature Coverage Matrix by Functional Category

### Status Definitions
- **Complete and verified**: Fully implemented, tested, and actively verified in the live app.
- **Implemented but needs verification**: Implemented in code; automated or end-to-end visual verification pending.
- **Partially implemented**: Core functionality exists, with secondary or advanced sub-features planned.
- **Not implemented**: Planned for future development milestones.
- **Platform-dependent**: Requires desktop/native runtime (e.g., Tauri, native FFI, OS printer driver).
- **Not applicable**: Not aligned with local-first, free-first architecture (e.g., proprietary cloud-only Microsoft services).

---

### Category A: Workbook & Worksheet Management

| Excel Capability | Description | Target Scope | Current Status | Dependencies / Notes | Priority | Verification Method |
|---|---|---|---|---|---|---|
| Multiple Worksheets | Multiple named tabs per workbook | Web & Desktop | **Complete and verified** | Local IndexedDB model | P0 | Automated test & UI |
| Create / Delete Sheets | Add new sheet, prompt delete confirmation | Web & Desktop | **Complete and verified** | Sheet tabs UI | P0 | Automated test & UI |
| Rename Sheets | Double-click or context menu rename | Web & Desktop | **Complete and verified** | Unique sheet name validator | P0 | Automated test & UI |
| Duplicate Sheet | Clone worksheet data, formatting & formulas | Web & Desktop | **Complete and verified** | JSON deep-clone | P1 | Automated test & UI |
| Sheet Reordering | Drag or context menu move tab left/right | Web & Desktop | **Partially implemented** | Tab reorder handler | P1 | Interactive test |
| Hide / Unhide Sheets | Toggle worksheet visibility | Web & Desktop | **Partially implemented** | Sheet visibility flag | P2 | State & tab render test |
| Tab Colors | Custom color accent on sheet tabs | Web & Desktop | **Partially implemented** | CSS border-bottom accent | P2 | Visual verification |
| Named Ranges | Define names for cells/ranges (e.g. `TaxRate`) | Web & Desktop | **Partially implemented** | HyperFormula named expressions | P1 | Formula engine test |
| Workbook Protection | Lock structure / password protection | Web & Desktop | **Not implemented** | Crypto/hashing module | P3 | Encryption unit test |
| Recent Workbooks | Quick access list on workspace home | Web & Desktop | **Complete and verified** | `documentStore.recent()` | P0 | Library UI verification |
| Search & Document Library | Rename, duplicate, delete, search in library | Web & Desktop | **Complete and verified** | `DocumentLanding.tsx` | P0 | Storage & UI tests |

---

### Category B: Grid & Cell Interaction

| Excel Capability | Description | Target Scope | Current Status | Dependencies / Notes | Priority | Verification Method |
|---|---|---|---|---|---|---|
| Cell Selection | Click cursor, active cell highlight | Web & Desktop | **Complete and verified** | HTML table/grid engine | P0 | Mouse event test |
| Range Selection | Click & drag multi-cell rectangular range | Web & Desktop | **Complete and verified** | Mouse move handler | P0 | Interactive test |
| Keyboard Navigation | Arrows, Tab, Shift+Tab, Enter, Shift+Enter | Web & Desktop | **Complete and verified** | Keydown handler | P0 | Key event test |
| Name Box & Jump | Display coordinate (`A1`), type coordinate to jump | Web & Desktop | **Complete and verified** | Coordinate parser | P0 | Unit & UI test |
| Formula Bar | Dedicated `fx` input bar synchronized with cell | Web & Desktop | **Complete and verified** | In-sync formula input | P0 | UI input test |
| In-Cell Editing | Double-click or start typing to edit cell in place | Web & Desktop | **Complete and verified** | Cell overlay input | P0 | UI editing test |
| Copy / Cut / Paste | Copy cell data & formatting with clipboard | Web & Desktop | **Complete and verified** | Async Clipboard API | P0 | Clipboard test |
| Fill Handle & Autofill | Drag corner handle to copy or extend series | Web & Desktop | **Partially implemented** | Selection handle UI | P1 | Interactive test |
| Insert / Delete Rows & Cols | Context menu row/column structural edits | Web & Desktop | **Complete and verified** | Grid index remapping | P0 | Interactive test |
| Resize Rows & Columns | Drag column border divider to adjust width | Web & Desktop | **Complete and verified** | Mouse move drag handler | P0 | Interactive test |
| Hide / Unhide Rows & Cols | Set width/height to 0 and restore | Web & Desktop | **Partially implemented** | Dimensions map | P2 | State verification |
| Freeze Panes | Freeze top row / freeze first column | Web & Desktop | **Partially implemented** | CSS sticky headers | P1 | Layout test |
| Find & Replace | Find text/numbers across sheet, replace matches | Web & Desktop | **Partially implemented** | Regex search dialog | P1 | Dialog & search test |
| Context Menu | Right-click cell options for copy, cut, structural | Web & Desktop | **Complete and verified** | Custom context menu | P0 | Right-click UI test |

---

### Category C: Formatting System

| Excel Capability | Description | Target Scope | Current Status | Dependencies / Notes | Priority | Verification Method |
|---|---|---|---|---|---|---|
| Font Styling | Bold, Italic, Underline, Strikethrough | Web & Desktop | **Complete and verified** | Cell style metadata | P0 | Style test |
| Font Size & Family | Adjustable point sizes (8–32pt) & typefaces | Web & Desktop | **Complete and verified** | Toolbar dropdown | P0 | Visual verification |
| Text Color & Fill Color | Hex / palette picker for font and background | Web & Desktop | **Complete and verified** | Color picker inputs | P0 | Visual verification |
| Horizontal Alignment | Left, Center, Right align | Web & Desktop | **Complete and verified** | CSS text-align | P0 | Visual verification |
| Vertical Alignment | Top, Middle, Bottom align | Web & Desktop | **Partially implemented** | CSS vertical-align | P1 | Visual verification |
| Text Wrapping | Wrap overflowing text within cell | Web & Desktop | **Partially implemented** | CSS white-space normal | P1 | Render test |
| Merge & Center | Combine adjacent cells into one block | Web & Desktop | **Partially implemented** | Colspan/rowspan model | P1 | Grid render test |
| Number Formats | Currency, Percentage, Date, Time, Scientific, Text | Web & Desktop | **Partially implemented** | Intl.NumberFormat / HyperFormula | P1 | Format parser test |
| Borders & Border Presets | Bottom, Top, Left, Right, All, Thick Box borders | Web & Desktop | **Partially implemented** | CSS border styling | P1 | Visual verification |
| Clear Formats / Contents | Reset style or empty cell value | Web & Desktop | **Complete and verified** | Context menu action | P0 | State test |
| Conditional Formatting | Highlight cells based on rules (e.g. > X) | Web & Desktop | **Not implemented** | Rule evaluation engine | P2 | Rule evaluation test |
| Format Painter | Copy formatting from source to target range | Web & Desktop | **Not implemented** | Clipboard style buffer | P2 | Interactive test |

---

### Category D: Formula Engine

| Excel Function Category | Key Functions | Current Status | Engine Details | Priority | Verification Method |
|---|---|---|---|---|---|
| Basic Arithmetic | `+`, `-`, `*`, `/`, `^`, `%`, `()` | **Complete and verified** | Built-in recursive / HyperFormula | P0 | Unit test |
| Math & Trig | `SUM`, `ABS`, `ROUND`, `INT`, `MOD`, `POWER`, `SQRT`, `PRODUCT`, `PI` | **Complete and verified** | HyperFormula 3.5 | P0 | Unit test |
| Logical | `IF`, `AND`, `OR`, `NOT`, `XOR`, `IFERROR`, `SWITCH`, `TRUE`, `FALSE` | **Complete and verified** | HyperFormula 3.5 | P0 | Unit test |
| Statistical | `AVERAGE`, `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `MIN`, `MAX`, `MEDIAN`, `STDEV` | **Complete and verified** | HyperFormula 3.5 | P0 | Unit test |
| Lookup & Reference | `VLOOKUP`, `HLOOKUP`, `XLOOKUP`, `INDEX`, `MATCH`, `ROW`, `COLUMN`, `CHOOSE` | **Complete and verified** | HyperFormula 3.5 | P0 | Calculation test |
| Text | `LEFT`, `RIGHT`, `MID`, `LEN`, `TRIM`, `UPPER`, `LOWER`, `PROPER`, `CONCAT`, `TEXTJOIN` | **Complete and verified** | HyperFormula 3.5 | P1 | String parsing test |
| Date & Time | `TODAY`, `NOW`, `DATE`, `YEAR`, `MONTH`, `DAY`, `HOUR`, `MINUTE`, `SECOND`, `EDATE` | **Complete and verified** | HyperFormula 3.5 | P1 | Date arithmetic test |
| Dynamic Arrays | `FILTER`, `SORT`, `UNIQUE`, `SEQUENCE`, `TRANSPOSE` | **Partially implemented** | HyperFormula 3.5 array spill | P2 | Spill range test |
| Advanced / Lambda | `LET`, `LAMBDA`, `MAP`, `REDUCE` | **Not implemented** | Future engine milestone | P3 | Expression test |
| Cross-Sheet References | e.g. `Sheet2!A1`, `SUM(Sheet2!B1:B10)` | **Complete and verified** | HyperFormula multi-sheet graph | P0 | Multi-sheet test |
| Relative / Absolute Refs | `$A$1`, `A$1`, `$A1` reference tracking | **Complete and verified** | HyperFormula reference engine | P0 | Reference copy test |
| Circular Reference Detection | Detects recursive dependencies and warns | **Complete and verified** | HyperFormula cycle detector | P1 | Error state test |

---

### Category E: Data Tools & Analysis

| Excel Capability | Description | Target Scope | Current Status | Dependencies / Notes | Priority | Verification Method |
|---|---|---|---|---|---|---|
| Sort Ascending / Descending | Sort selection or whole column alphabetically / numerically | Web & Desktop | **Complete and verified** | Sort algorithms | P0 | Array sort test |
| AutoFilter | Header filter dropdowns for column value filtering | Web & Desktop | **Partially implemented** | Filter predicate engine | P1 | UI filter test |
| Data Tables | Structured Excel-style table with header & zebra striping | Web & Desktop | **Partially implemented** | Table range definition | P1 | Style & range test |
| Text to Columns | Split delimited strings (comma, tab, space) into columns | Web & Desktop | **Partially implemented** | String split parser | P2 | Dialog & parsing test |
| Data Validation | Restrict cell input to dropdown list, numbers, or dates | Web & Desktop | **Partially implemented** | Input validator hook | P2 | Input alert test |
| Remove Duplicates | Scan range and discard identical rows | Web & Desktop | **Partially implemented** | Hash set deduplicator | P2 | Unit test |
| Goal Seek / What-If | Back-calculate input cell to achieve target formula result | Web & Desktop | **Not implemented** | Numeric solver algorithm | P3 | Solver test |

---

### Category F: Charts & Visualizations

| Excel Capability | Description | Target Scope | Current Status | Dependencies / Notes | Priority | Verification Method |
|---|---|---|---|---|---|---|
| Column / Bar Charts | Vertical and horizontal grouped bars from data range | Web & Desktop | **Partially implemented** | SVG/Canvas charting module | P1 | Visual render test |
| Line Charts | Trends over time with points and lines | Web & Desktop | **Partially implemented** | Chart engine | P1 | Visual render test |
| Pie / Doughnut Charts | Proportion visualizer with legend and percentages | Web & Desktop | **Partially implemented** | Angle trigonometry | P1 | Visual render test |
| Area Charts | Stacked and standard area charts | Web & Desktop | **Not implemented** | Chart engine | P2 | Visual render test |
| Scatter / Bubble Charts | X-Y coordinate plotting | Web & Desktop | **Not implemented** | Chart engine | P2 | Coordinate plot test |
| Chart Configuration | Dynamic titles, legends, series selection, recoloring | Web & Desktop | **Partially implemented** | Chart inspector dialog | P2 | UI test |

---

### Category G: File Compatibility & I/O

| Excel Capability | Description | Target Scope | Current Status | Dependencies / Notes | Priority | Verification Method |
|---|---|---|---|---|---|---|
| XLSX Export | Full multi-sheet workbook export to standard `.xlsx` | Web & Desktop | **Complete and verified** | `exceljs` library | P0 | Excel file round-trip |
| XLSX Import | Open external `.xlsx` files created by Excel/Calc | Web & Desktop | **Complete and verified** | `exceljs` loader | P0 | Import test |
| CSV Export | Fast export of active sheet as comma-separated values | Web & Desktop | **Complete and verified** | RFC 4180 CSV builder | P0 | String/file test |
| CSV Import | Parse delimited CSV into grid cells | Web & Desktop | **Complete and verified** | CSV parser with quotes | P0 | String/file test |
| PDF Export | Export printable spreadsheet pages to vector PDF | Web & Desktop | **Partially implemented** | `jspdf` + `html2canvas` | P1 | PDF download test |
| Formula Round-Trip | Ensure formula syntax (`=SUM(A1:B5)`) survives XLSX save/load | Web & Desktop | **Complete and verified** | ExcelJS formula types | P0 | Round-trip unit test |
| Formatting Round-Trip | Preserve fonts, alignment, and basic styling across XLSX | Web & Desktop | **Complete and verified** | ExcelJS font/align | P0 | Round-trip unit test |

---

### Category H: Ribbon Interface

| Excel Ribbon Tab | Key Groups & Controls | Current Status | Priority |
|---|---|---|---|
| **File** | New, Open, Save, Import (XLSX, CSV), Export (XLSX, CSV, PDF), Close | **Complete and verified** | P0 |
| **Home** | Clipboard, Font, Alignment, Number Formatting, Cells (Insert/Delete), Editing (AutoSum, Sort, Clear) | **Complete and verified** | P0 |
| **Insert** | Charts (Column, Line, Pie), Tables, Symbols | **Partially implemented** | P1 |
| **Page Layout** | Orientation, Paper Size, Margins, Gridlines toggle, Headings toggle | **Partially implemented** | P1 |
| **Formulas** | Insert Function, AutoSum, Function Categories (Math, Logic, Text, Lookup), Calculation Options | **Complete and verified** | P0 |
| **Data** | Sort A-Z, Sort Z-A, Filter toggle, Remove Duplicates, Text to Columns | **Partially implemented** | P1 |
| **Review** | Protect Sheet, Word Count / Cell Statistics, Comments | **Partially implemented** | P2 |
| **View** | Zoom, Freeze Panes, Toggle Formula Bar, Toggle Gridlines, Toggle Headings | **Partially implemented** | P1 |

---

### Category I: Advanced Capabilities & Automation

| Excel Capability | Description | Target Scope | Current Status | Notes |
|---|---|---|---|---|
| PivotTables | Pivot table engine with drag-and-drop fields and aggregations | Web & Desktop | **Not implemented** | Milestone 3 target |
| Power Query | ETL pipeline for multi-source data ingestion | Web & Desktop | **Not implemented** | Milestone 4 target |
| VBA / Macros | Legacy macro execution | Desktop only | **Not applicable** | Replaced with sandboxed JavaScript automation |
| Office Scripts / JS API | Safe, sandboxed script runner for spreadsheet automation | Web & Desktop | **Not implemented** | Milestone 5 target |
| Local AI Assistant | Privacy-first natural language formula generation & data insights | Web & Desktop | **Partially implemented** | Integrates with Nexus AI core |

---
