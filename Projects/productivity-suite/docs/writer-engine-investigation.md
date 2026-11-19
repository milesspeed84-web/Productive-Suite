# Writer engine investigation

## Current application architecture

The application is a Vite 8 React 19 and TypeScript 5.9 frontend. `src/App.tsx` is the only router/navigation layer and opens Writer as a conditional screen. There is no Electron, Tauri, native messaging, or other desktop bridge in the project. The frontend therefore cannot currently launch or call `nexus-docworker`.

`src/Writer.tsx` is a single React component backed by a browser `contentEditable` element. It initializes the element with saved `innerHTML`, uses deprecated `document.execCommand` for basic formatting, writes one document to localStorage on blur and after a debounce on title or editor changes, and exports a DOCX from `innerText`. The export maps lines to plain paragraphs, so formatting, tables, images, page settings, and other document structure are not preserved. The `docx` package is a document-generation library; it is not an editing engine.

There are no existing document utilities, persistence abstractions, test scripts, or desktop dependencies. `package.json` currently exposes `dev`, `build`, `lint`, and `preview`. The README is still the stock Vite template.

## Existing work and repository state

At the start of this investigation, the main repository was on `master` with modified `.gitignore`, `package.json`, `package-lock.json`, `src/App.tsx`, and `src/App.css`; untracked Writer files, app backups, and `main.obj` were present. These files were preserved. The native worker directory also contained prior executable/object artifacts and multiple source backups. None of the named protected `main.cpp.*.bak` files were modified or removed.

## LibreOfficeKit finding

The installed runtime is LibreOffice 26.8.2.2. Its headers and runtime provide document loading, view creation, tiled rendering, mouse and keyboard input, extended text input, UNO commands, callbacks, save/export, and the file filters needed for DOCX, ODT, PDF, TXT, and RTF workflows.

The paste failure is not caused by an inactive LOK view. It reproduces with the active view ID confirmed. The LibreOffice implementation of `doc_paste()` accepts the clipboard data, then calls `comphelper::dispatchCommand(".uno:Paste", ...)`. That overload resolves the command through the desktop's active frame (falling back to the desktop frame); it does not dispatch against the `LibreOfficeKitDocument` passed to `doc_paste()`. In the standalone worker, a LOK view can be active while that desktop dispatch lookup still cannot resolve `.uno:Paste`. A real mouse click before `paste()` does not fix this. The relevant implementation is in LibreOffice's [`desktop/source/lib/init.cxx`](https://github.com/LibreOffice/core/blob/master/desktop/source/lib/init.cxx) and [`comphelper/source/misc/dispatchcommand.cxx`](https://github.com/LibreOffice/core/blob/master/comphelper/source/misc/dispatchcommand.cxx).

The worker smoke test now inserts through LOK mouse and extended-text-input events instead of the failing paste convenience method. It renders a tile, enters text, saves DOCX, closes and reopens it, then resaves the reopened document. The resaved OOXML is inspected to confirm its actual text. ASCII, accented Latin, CJK, and supplementary Unicode survived. The existing `output/FirstDocument.docx` was preserved; the verified file is written under the isolated `nexus-engine-smoke` output directory. A CMake/CTest build and OOXML verification script now reproduce this check in a build directory; see the worker's README.

This establishes that LibreOfficeKit is a technically viable foundation for a real document engine and that the current paste failure has a workable input path. It does not establish full application readiness. The official project describes tiled rendering as experimental and tiled editing as a client API with known clients including GTK tiled viewer and Android. The worker is still a one-shot Windows test program with hardcoded installation paths, a timed event-queue wait, no request protocol, no Linux build, and no bridge to React. Production integration must use callbacks/event sequencing rather than the smoke test's fixed waits, and must verify save results by extracting/reopening document content.

## Engine direction

Continue evaluating LibreOfficeKit as the document engine rather than extending `contentEditable` into a Word-like file model. LOK gives Nexus a mature Writer document model and LibreOffice's import/export filters while retaining a native client UI option. Its limitations and version coupling need to be made explicit, and each shipped platform needs a compatible LibreOfficeKit runtime. Linux packaging should be the primary integration target; the current Windows absolute paths must not become the production architecture.

The main architectural prerequisite is a desktop host and a stable engine boundary. The host should manage the worker lifecycle and local file access; the frontend should consume typed document operations and render LOK output and callbacks. The React UI must not claim native editing, DOCX round-trip fidelity, or local file access until that bridge exists. I recommend Tauri v2 as the provisional host: it keeps the frontend in React, provides a Rust command boundary, and supports Windows and Linux ([IPC](https://v2.tauri.app/concept/inter-process-communication/), [platform prerequisites](https://v2.tauri.app/start/prerequisites/)). Linux packaging will need its documented WebKitGTK development dependencies. The repository has no prior desktop-runtime decision, so this can be revised if a product-level constraint appears.

## Verification at this checkpoint

- `npm run build` passed for the current frontend.
- Local autosave now runs after editor input and reports a local-storage failure instead of showing a false saved state.
- The repository-wide `npm run lint` did not complete within the command window; it was interrupted. A focused lint run is still needed.
- The native worker compiled with MSVC 14.51 and LibreOfficeKit headers from the supplied probe directory, using the new CMake configuration.
- The native worker rendered, inserted, saved DOCX, reopened it, and saved the reopened document successfully.
- The saved DOCX `word/document.xml` was parsed directly; its test text and Unicode content were present.
- CTest passed both the LOK create/render/input/save/reopen run and the Python OOXML-content check.
- The Linux CMake path is documented but has not been built or run.
- There is no automated test suite yet, and no full DOCX import-edit-save-reopen compatibility claim is made.

## Remaining engineering work

1. Add the provisional Tauri desktop host and define a typed interface between the React UI and the native engine.
2. Turn the smoke-test worker into a long-lived, cross-platform process or an equivalent native library. Remove hardcoded paths, implement lifecycle/error handling, serialize operations, and handle callbacks and rendering safely.
3. Replace the browser-only `contentEditable` document state with an engine-backed editor surface; wire pointer, keyboard, clipboard, selection, formatting, and rendering events end to end.
4. Add local file open/save/save-as and recovery/autosave using engine documents and atomic persistence.
5. Add automated native and frontend tests for editing, formatting, pagination, document formats, recovery, large files, and Unicode. Verify exported artifacts by reopening and extracting their contents.
6. Document format-specific limitations based on round-trip fixtures rather than assumptions about LibreOffice support.
