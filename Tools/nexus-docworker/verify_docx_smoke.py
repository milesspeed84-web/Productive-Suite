"""Inspect the saved OOXML payload instead of trusting saveAs()'s return value."""

import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: verify_docx_smoke.py <document.docx>", file=sys.stderr)
        return 2

    document_path = Path(sys.argv[1])
    expected = "Hello from Nexus! — café 世界 🌐"

    try:
        with zipfile.ZipFile(document_path) as archive:
            document_xml = archive.read("word/document.xml")
        root = ElementTree.fromstring(document_xml)
    except (OSError, KeyError, zipfile.BadZipFile, ElementTree.ParseError) as error:
        print(f"Could not inspect DOCX content: {error}", file=sys.stderr)
        return 1

    text = "".join(root.itertext())
    if expected not in text:
        print("Expected text was not retained in word/document.xml", file=sys.stderr)
        return 1

    paragraph_count = len(root.findall(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"))
    print(f"DOCX OOXML parsed; Unicode test text retained in {paragraph_count} paragraph(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
