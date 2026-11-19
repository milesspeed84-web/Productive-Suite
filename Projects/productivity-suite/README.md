# Nexus — Productivity Suite application

Nexus is the React and TypeScript application for Productive Suite. It currently provides browser-based document management, Writer and Spreadsheet prototypes, and a responsive workspace shell.

## Run locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Vite prints the local development URL in the terminal.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Type-check and create a production build. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint across the application. |
| `npm test` | Run the Node.js test suite. |

## Main areas

- `src/DocumentLanding.tsx` — document library and workspace entry point
- `src/Writer.tsx` — browser-based Writer editor
- `src/Spreadsheet.tsx` — spreadsheet editor and formula interface
- `src/documents/` — document storage and serialization support
- `src/spreadsheet/` — spreadsheet-specific utilities
- `tests/` — storage, formula, clipboard, CSV, Writer, and DOCX tests
- `docs/` — feature audits and implementation investigations

## Technology

- React 19
- TypeScript
- Vite
- HyperFormula
- ExcelJS
- jsPDF
- html2canvas
- `docx`

## Writer status

Writer is a browser editing prototype. It is not yet connected to a native document engine. DOCX export preserves supported browser-content structures and should not be assumed to provide desktop word-processor fidelity.

See [the Writer engine investigation](docs/writer-engine-investigation.md) for architecture notes, LibreOfficeKit findings, the native smoke test, and remaining integration work.

## Spreadsheet status

The Spreadsheet prototype includes formulas, multiple sheets, formatting, charts, range operations, find/replace, undo/redo, and CSV/XLSX-oriented workflows. Verify format compatibility with explicit fixtures before relying on round trips.

See [the spreadsheet feature parity notes](docs/spreadsheet-feature-parity.md) for implementation coverage and known gaps.
