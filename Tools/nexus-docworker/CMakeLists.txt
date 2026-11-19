cmake_minimum_required(VERSION 3.20)

project(nexus_docworker LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(LOKIT_INCLUDE_DIR "" CACHE PATH "Directory containing LibreOfficeKitInit.h")
set(LOKIT_PROGRAM_DIR "" CACHE PATH "LibreOffice program directory containing the LOK runtime")

if(NOT LOKIT_INCLUDE_DIR)
    find_path(LOKIT_INCLUDE_DIR LibreOfficeKitInit.h
        PATH_SUFFIXES include/LibreOfficeKit include)
endif()

if(NOT LOKIT_INCLUDE_DIR OR NOT EXISTS "${LOKIT_INCLUDE_DIR}/LibreOfficeKitInit.h")
    message(FATAL_ERROR "Set LOKIT_INCLUDE_DIR to the directory containing LibreOfficeKitInit.h")
endif()

if(NOT LOKIT_PROGRAM_DIR)
    if(WIN32)
        set(LOKIT_PROGRAM_DIR "C:/Program Files/LibreOffice/program")
    else()
        set(LOKIT_PROGRAM_DIR "/usr/lib/libreoffice/program")
    endif()
endif()

add_executable(nexus-docworker main.cpp)
target_include_directories(nexus-docworker PRIVATE "${LOKIT_INCLUDE_DIR}")

if(UNIX AND NOT APPLE)
    target_link_libraries(nexus-docworker PRIVATE ${CMAKE_DL_LIBS})
endif()

if(MSVC)
    target_compile_options(nexus-docworker PRIVATE /utf-8 /W4)
else()
    target_compile_options(nexus-docworker PRIVATE -Wall -Wextra -Wpedantic)
endif()

find_package(Python3 COMPONENTS Interpreter REQUIRED)
enable_testing()

set(SMOKE_OUTPUT_DIR "${CMAKE_CURRENT_BINARY_DIR}/smoke-output")
add_test(NAME lok_docx_roundtrip
    COMMAND nexus-docworker "${SMOKE_OUTPUT_DIR}" "${LOKIT_PROGRAM_DIR}")
add_test(NAME verify_docx_content
    COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/verify_docx_smoke.py"
            "${SMOKE_OUTPUT_DIR}/FirstDocument.docx")
set_tests_properties(verify_docx_content PROPERTIES DEPENDS lok_docx_roundtrip)
