# Productive Suite

**Productive Suite** is an open, local-first productivity workspace centered on **Nexus**, a React application for documents, spreadsheets, scheduling tools, and future productivity features.

> **Project status:** Active development. The browser-based Writer and Spreadsheet experiences are usable prototypes. Native LibreOfficeKit integration is currently an experimental smoke test and is not connected to the Nexus UI.

## Install and operate

### 1. Install the requirements

Install [Node.js](https://nodejs.org/) 22 or newer, which includes npm, and install Git if it is not already available.

Verify the tools:

```sh
git --version
node --version
npm --version
```

### 2. Download the project

```sh
git clone https://github.com/milesspeed84-web/Productive-Suite.git
cd Productive-Suite/Projects/productivity-suite
```

If you already downloaded the repository, open a terminal in `Productive-Suite/Projects/productivity-suite` instead.

### 3. Install application dependencies

```sh
npm install
```

### 4. Start Nexus

```sh
npm run dev
```

Open the local address printed by Vite, usually `http://localhost:5173`, in a modern browser. Keep the terminal open while using the application. Press `Ctrl+C` in the terminal to stop the server.

### 5. Use the application

- Open **Documents** to view or create local documents.
- Open **Writer** to create and edit a document.
- Open **Spreadsheet** to create sheets, enter formulas, and format cells.
- Use the browser controls to import or export supported files where available.
- Documents and spreadsheets are stored locally in browser storage. Clearing browser data or using a private session can remove or separate saved work.

### Optional production build

```sh
npm run build
npm run preview
```

Open the preview address printed by Vite to test the production build locally.

## Highlights

- **Local document library** — create, open, rename, duplicate, and delete documents using browser storage.
- **Nexus Writer** — a browser editing prototype with formatting, tables, images, pagination, find/replace, undo/redo, history, recovery drafts, and DOCX-oriented workflows.
- **Nexus Spreadsheet** — multiple sheets, HyperFormula calculations, formatting, charts, range operations, undo/redo, find/replace, and CSV/XLSX-oriented workflows.
- **Local-first behavior** — application data is kept in the browser rather than sent to a remote account service.
- **Native integration research** — a separate LibreOfficeKit probe and C++ document-worker smoke test document and exercise native document-engine possibilities.

## Repository layout

```text
Productive-Suite/
├── Projects/
│   └── productivity-suite/    Nexus React, TypeScript, and Vite application
│       ├── src/               Application source and styles
│       ├── tests/             Node.js test suite
│       └── docs/              Writer and spreadsheet implementation notes
└── Tools/
    ├── lokit-probe/           LibreOfficeKit investigation utilities
    └── nexus-docworker/       Native LibreOfficeKit smoke test
```

## Technology

- **Application:** React 19, TypeScript, Vite
- **Writer:** browser editing, HTML/DOCX-oriented utilities
- **Spreadsheet:** HyperFormula, ExcelJS, and browser storage
- **PDF/image support:** jsPDF and html2canvas
- **Native experiments:** C/C++17, CMake, and LibreOfficeKit
- **Testing:** Node.js test runner and TypeScript-stripped ESM tests

## Requirements

- [Node.js](https://nodejs.org/) 22 or newer
- npm
- Git
- A modern browser

The native document-worker smoke test additionally requires CMake, Ninja, a C++17 compiler, Python 3, and a LibreOffice installation that exposes LibreOfficeKit headers and runtime libraries.

## Development commands

Run these commands from `Projects/productivity-suite`:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and build the production bundle. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the Node.js test suite. |

## Testing

The test suite covers document storage, spreadsheet formulas and storage, Writer history, DOCX behavior, range clipboard operations, and CSV round trips.

```sh
cd Projects/productivity-suite
npm test
```

## Native document-worker smoke test

`Tools/nexus-docworker` is an experimental executable that initializes LibreOfficeKit, creates a Writer view, renders a tile, sends text-input events, saves a DOCX, reopens it, and checks OOXML content.

It is **not** yet integrated with the React application and should not be treated as a production desktop host.

Build and run instructions are available in [`Tools/nexus-docworker/README.md`](Tools/nexus-docworker/README.md).

## Documentation

- [Writer engine investigation](Projects/productivity-suite/docs/writer-engine-investigation.md)
- [Writer feature audit](Projects/productivity-suite/docs/writer-feature-audit.md)
- [Writer document library](Projects/productivity-suite/docs/writer-document-library.md)
- [Spreadsheet feature parity](Projects/productivity-suite/docs/spreadsheet-feature-parity.md)

## Current limitations

- Writer is a browser editing prototype, not an engine-backed desktop editor.
- Presentation, mail, meetings, notes, files, and AI areas may remain placeholders while they are developed.
- XLSX/XLS and DOCX compatibility should not be assumed beyond the tested workflows.
- LibreOfficeKit support is a Windows-tested experiment; the Linux build path is documented but has not been completed in this environment.
- Browser storage and in-app behavior should be tested when changing storage formats or recovery logic.

## Contributing

Keep browser application features separate from native LibreOfficeKit experiments. Document format limitations honestly and add tests for persistence, import/export, formulas, clipboard behavior, recovery, and native-engine experiments.
