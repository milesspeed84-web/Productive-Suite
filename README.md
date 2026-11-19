# Productive Suite

Productive Suite is a workspace for productivity-focused applications and supporting tools. The main application is **Nexus**, a browser-based React app with document-writing and spreadsheet experiences. The repository also contains early-stage native document-engine experiments.

> **Project status:** This repository is under active development. Nexus is currently a frontend prototype; its document editor is not yet connected to the native LibreOfficeKit worker. The worker is an integration smoke test, not a production component.

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

The native smoke-test tool has separate requirements, including CMake, Ninja, a C++17 compiler, Python 3, and a LibreOffice installation that provides LibreOfficeKit headers and runtime libraries. See [`Tools/nexus-docworker/README.md`](Tools/nexus-docworker/README.md) for platform-specific setup.

## Run the Nexus application

```sh
cd Projects/productivity-suite
npm install
npm run dev
```

Vite prints a local URL in the terminal after the development server starts.

## Available application commands

Run these from `Projects/productivity-suite`:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and create a production build. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the Node.js test files in `tests/`. |

## Native document-worker smoke test

The `Tools/nexus-docworker` project checks a small LibreOfficeKit document workflow, including rendering, text input, DOCX saving, and reopening. It is an engineering experiment and is not yet integrated with the React application. Follow its README for build instructions and limitations.

## Current limitations

- The Writer interface is a browser editing prototype and is not backed by a native document engine.
- The document-worker smoke test does not provide production file handling or a frontend bridge.
- Do not assume complete DOCX compatibility or round-trip fidelity; format support still needs broader verification.

See [`Projects/productivity-suite/docs/writer-engine-investigation.md`](Projects/productivity-suite/docs/writer-engine-investigation.md) for architecture notes, investigation results, and remaining work.

## Contributing

When contributing, keep the application and native experiments clearly distinguished, and update the relevant project documentation when commands, requirements, or implementation status change.
