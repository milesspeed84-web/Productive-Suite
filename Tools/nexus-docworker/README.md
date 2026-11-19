# Nexus document worker smoke test

This is a native LibreOfficeKit integration experiment. It is not yet the production worker or a bridge used by the React application.

The executable performs a small end-to-end check: initialize LibreOfficeKit, create a Writer view, render a tile, place the caret with mouse input, insert a Unicode test string through extended text input, save DOCX, close it, reopen it, and save the reopened document again. `verify_docx_smoke.py` then parses the resaved DOCX package and checks the actual `word/document.xml` content.

## Build and run on Windows

Use a Visual Studio Developer Command Prompt with CMake and Ninja available:

```powershell
cmake -S . -B build -G Ninja `
  -DLOKIT_INCLUDE_DIR="E:/ProductivitySuite/Tools/lokit-probe/include/LibreOfficeKit" `
  -DLOKIT_PROGRAM_DIR="C:/Program Files/LibreOffice/program"
cmake --build build
ctest --test-dir build --output-on-failure
```

The CTest round-trip writes only under `build/smoke-output`; it does not overwrite prior output files or source backups.

## Linux build path

Install a LibreOffice build that provides LibreOfficeKit headers and runtime libraries, CMake, Ninja, a C++17 compiler, and Python 3. Then configure with the corresponding header and program directories:

```sh
cmake -S . -B build -G Ninja \
  -DLOKIT_INCLUDE_DIR=/path/to/include/LibreOfficeKit \
  -DLOKIT_PROGRAM_DIR=/usr/lib/libreoffice/program
cmake --build build
ctest --test-dir build --output-on-failure
```

The source has platform-specific environment and DLL setup guarded for Windows, and links `${CMAKE_DL_LIBS}` on Linux. The Linux path has not yet been built or run in this environment. A matching LibreOfficeKit runtime is required on each target platform.

## Limits

The text injection path exercises LOK input events. It does not resolve the standalone `paste()` convenience call, whose `.uno:Paste` dispatch fails in this worker. The smoke test's short waits only sequence this one-shot test; a production worker must use callback-driven event sequencing and explicit operation results. The worker still has no long-lived request protocol, concurrency model, file dialog, security boundary, service lifecycle, or frontend bridge.
