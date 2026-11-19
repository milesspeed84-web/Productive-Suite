#define LOK_USE_UNSTABLE_API
#include <cassert>
#include "LibreOfficeKitInit.h"
#include "LibreOfficeKitEnums.h"

#include <cstdlib>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include <chrono>
#include <thread>
namespace fs = std::filesystem;

static std::string file_url(const fs::path& path)
{
    std::string value = fs::absolute(path).generic_u8string();
    std::ostringstream encoded;
    encoded << std::uppercase << std::hex;
    for (const unsigned char byte : value) {
        const bool unreserved =
            (byte >= 'a' && byte <= 'z') ||
            (byte >= 'A' && byte <= 'Z') ||
            (byte >= '0' && byte <= '9') ||
            byte == '-' || byte == '_' || byte == '.' || byte == '~' ||
            byte == '/' || byte == ':';
        if (unreserved) {
            encoded << static_cast<char>(byte);
        } else {
            encoded << '%' << std::setw(2) << std::setfill('0')
                    << static_cast<unsigned>(byte);
        }
    }
    return !value.empty() && value.front() == '/'
        ? "file://" + encoded.str()
        : "file:///" + encoded.str();
}

static void show_error(LibreOfficeKit* office)
{
    if (!office || !office->pClass->getError) return;

    char* error = office->pClass->getError(office);
    if (error) {
        std::cerr << "LibreOfficeKit: " << error << '\n';
        office->pClass->freeError(error);
    }
}

int main(int argc, char** argv)
{
    const fs::path output = argc > 1
        ? fs::u8path(argv[1])
        : fs::current_path() / "output" / "nexus-engine-smoke";

    std::string configured_install_path;
#ifdef _WIN32
    char* configured_path_buffer = nullptr;
    size_t configured_path_length = 0;
    if (_dupenv_s(&configured_path_buffer, &configured_path_length,
                  "LIBREOFFICE_PROGRAM_DIR") == 0 && configured_path_buffer) {
        configured_install_path = configured_path_buffer;
        std::free(configured_path_buffer);
    }
    const std::string install_path = argc > 2
        ? argv[2]
        : (configured_install_path.empty()
            ? "C:/Program Files/LibreOffice/program"
            : configured_install_path);
#else
    if (const char* configured_path = std::getenv("LIBREOFFICE_PROGRAM_DIR"))
        configured_install_path = configured_path;
    const std::string install_path = argc > 2
        ? argv[2]
        : (configured_install_path.empty()
            ? "/usr/lib/libreoffice/program"
            : configured_install_path);
#endif

    fs::create_directories(output / "profile");

#ifdef _WIN32
    _putenv_s("SAL_USE_VCLPLUGIN", "svp");
    _putenv_s("SAL_NO_MOUSEGRABS", "1");
    SetDllDirectoryA(install_path.c_str());
#else
    setenv("SAL_USE_VCLPLUGIN", "svp", 1);
    setenv("SAL_NO_MOUSEGRABS", "1", 1);
#endif

    const std::string profile_url =
        file_url(output / "profile");

    std::cout << "[1] Initializing LibreOfficeKit...\n";

    LibreOfficeKit* office =
        lok_init_2(install_path.c_str(), profile_url.c_str());

    if (!office) {
        std::cerr << "LibreOfficeKit initialization failed.\n";
        return 1;
    }

    std::cout << "[2] Creating blank Writer document...\n";

    LibreOfficeKitDocument* document =
        office->pClass->documentLoad(
            office, "private:factory/swriter");

    if (!document) {
        show_error(office);
        office->pClass->destroy(office);
        return 2;
    }

    if (!LIBREOFFICEKIT_DOCUMENT_HAS(document, createView) ||
        !LIBREOFFICEKIT_DOCUMENT_HAS(document, paintTile) ||
        !LIBREOFFICEKIT_DOCUMENT_HAS(document, initializeForRendering) ||
        !LIBREOFFICEKIT_DOCUMENT_HAS(document, postMouseEvent) ||
        !LIBREOFFICEKIT_DOCUMENT_HAS(document, postWindowExtTextInputEvent)) {
        std::cerr << "Required LibreOfficeKit functions unavailable.\n";
        document->pClass->destroy(document);
        office->pClass->destroy(office);
        return 3;
    }

    std::cout << "[3] Initializing document view...\n";

    const int view = document->pClass->createView(document);

    if (view < 0) {
        std::cerr << "Could not create document view.\n";
        document->pClass->destroy(document);
        office->pClass->destroy(office);
        return 4;
    }

    document->pClass->setView(document, view);

    std::cout << "[3.1] Created view ID: " << view << '\n';
    std::cout << "[3.2] Active view ID: "
              << document->pClass->getView(document) << '\n';

    document->pClass->initializeForRendering(document, "{}");

    std::cout << "[3.5] Rendering initial document tile...\n";

    std::vector<unsigned char> tile_buffer(512 * 512 * 4);

    document->pClass->paintTile(
        document, tile_buffer.data(), 512, 512, 0, 0, 7680, 7680
    );

    std::cout << "[4] Inserting test text through LibreOfficeKit input events...\n";

    const std::string content = "Hello from Nexus! — café 世界 🌐";

    document->pClass->setView(document, view);

    std::cout << "[4.0] Active view before paste: "
              << document->pClass->getView(document) << '\n';

    document->pClass->postMouseEvent(
        document, LOK_MOUSEEVENT_MOUSEBUTTONDOWN, 1600, 1800, 1, 1, 0
    );
    document->pClass->postMouseEvent(
        document, LOK_MOUSEEVENT_MOUSEBUTTONUP, 1600, 1800, 1, 0, 0
    );
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    document->pClass->postWindowExtTextInputEvent(
        document, 0, LOK_EXT_TEXTINPUT, content.c_str()
    );
    document->pClass->postWindowExtTextInputEvent(
        document, 0, LOK_EXT_TEXTINPUT_END, ""
    );
    // LOK posts this input through VCL's event queue. The smoke-test process
    // must allow that queue to consume the event before saveAs() is called.
    std::this_thread::sleep_for(std::chrono::milliseconds(500));

    std::cout << "[4.2] Text input delivered to LibreOfficeKit.\n";

    const fs::path destination = output / "FirstDocument.docx";
    const std::string destination_url = file_url(destination);

    std::cout << "[5] Saving DOCX...\n";

    const int saved = document->pClass->saveAs(
        document,
        destination_url.c_str(),
        "docx",
        nullptr
    );

    if (saved != 1 || !fs::exists(destination)) {
        std::cerr << "DOCX save failed.\n";
        show_error(office);
        document->pClass->destroy(document);
        office->pClass->destroy(office);
        return 6;
    }

    std::cout << "[6] Closing document...\n";
    document->pClass->destroy(document);
    document = nullptr;

    std::cout << "[7] Reopening saved DOCX...\n";

    document = office->pClass->documentLoad(
        office,
        destination_url.c_str()
    );

    if (!document) {
        show_error(office);
        office->pClass->destroy(office);
        return 7;
    }

    std::cout << "[8] Resaving reopened DOCX for round-trip verification...\n";
    const int resaved = document->pClass->saveAs(
        document,
        destination_url.c_str(),
        "docx",
        nullptr
    );
    if (resaved != 1 || !fs::exists(destination)) {
        std::cerr << "Resaving the reopened DOCX failed.\n";
        show_error(office);
        document->pClass->destroy(document);
        office->pClass->destroy(office);
        return 8;
    }

    std::cout << "[SUCCESS] DOCX reopened successfully.\n";
    std::cout << "File: " << destination.string() << '\n';
    std::cout << "Size: " << fs::file_size(destination) << " bytes\n";

    document->pClass->destroy(document);
    office->pClass->destroy(office);

    std::cout << "[DONE] Native Writer test completed.\n";
    return 0;
}








