# Productive Suite

Productive Suite is a local-first productivity workspace built around **Nexus**, a browser application for documents, spreadsheets, and everyday time and scheduling tools.

> **Project status:** This repository is under active development. Writer is currently a browser-based editing prototype, and the native LibreOfficeKit worker is an integration experiment rather than a production document engine.

## Features

### Nexus workspace

- Local document library backed by browser storage
- Rich Writer prototype with formatting, tables, images, pagination, page navigation, find/replace, and recovery drafts
- Spreadsheet prototype with multiple sheets, formulas, formatting, charts, undo/redo, find/replace, and XLSX/CSV workflows
- Responsive workspace navigation for documents and productivity tools

### Spreadsheet utilities

- HyperFormula-powered formulas and cross-sheet calculations
- Range copy, cut, and paste helpers
- CSV parsing and serialization that support quotes, commas, escaped quotes, CRLF input, and embedded line breaks
- Node.js tests for formulas, spreadsheet storage, clipboard ranges, CSV round trips, and document storage

### World clock

A digital clock and time-zone experience is planned for Nexus. When implemented, it will display the current time in the browser's local time zone and in configurable locations using the standard `Intl` time-zone API.

## Repository layout

```text
Projects/
  productivity-suite/   Nexus React, TypeScript, and Vite application
Tools/
  lokit-probe/          LibreOfficeKit investigation/probe
  nexus-docworker/      Native document-worker smoke test
```

## Requirements

- Node.js and npm
- A modern web browser

The native smoke-test tool additionally requires CMake, Ninja, a C++17 compiler, Python 3, and a LibreOffice installation that provides LibreOfficeKit headers and runtime libraries.

See [`Tools/nexus-docworker/README.md`](Tools/nexus-docworker/README.md) for platform-specific build instructions.

## Run the Nexus application

```sh
cd Projects/productivity-suite
npm install
npm run dev
```

Vite prints the local development URL in the terminal.

## Available application commands

Run these commands from `Projects/productivity-suite`:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and create a production build. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the Node.js test suite. |

## Native document-worker smoke test

`Tools/nexus-docworker` verifies a small LibreOfficeKit workflow, including initialization, rendering, text input, DOCX saving, reopening, and OOXML content checks.

This executable is not yet integrated with the React application and should not be considered a production worker or desktop host.

## Current limitations

- The Writer interface is a browser editing prototype, not an engine-backed desktop editor.
- Presentation, mail, meetings, notes, files, and AI features may remain placeholders while they are developed.
- XLSX support should be verified through round-trip fixtures; no `.xls` support is guaranteed.
- The native LibreOfficeKit worker is a Windows-tested smoke test. The Linux build path is documented but has not been completed in this environment.
- DOCX and spreadsheet format compatibility should not be assumed beyond the verified test cases.

See [`Projects/productivity-suite/docs/writer-engine-investigation.md`](Projects/productivity-suite/docs/writer-engine-investigation.md) for the current Writer architecture, LibreOfficeKit findings, verification state, and remaining integration work.

## Testing

The application uses Node.js tests for document storage, spreadsheet formulas and storage, Writer history and DOCX behavior, clipboard ranges, and CSV round trips.

```sh
cd Projects/productivity-suite
npm test
```

## Contributing

Keep browser features separate from native LibreOfficeKit experiments, document new format limitations honestly, and add tests for persistence, import/export, formulas, clipboard behavior, and time-zone formatting where applicable.
