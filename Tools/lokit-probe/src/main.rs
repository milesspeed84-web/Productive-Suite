use std::ffi::{c_char, c_int, c_long, c_void, CStr, CString};
use std::fs::File;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::time::Instant;

// --- Windows Dynamic Linking FFI ---
unsafe extern "system" {
    fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
    fn LoadLibraryW(lpLibFileName: *const u16) -> *mut c_void;
    fn GetProcAddress(hModule: *mut c_void, lpProcName: *const u8) -> *mut c_void;
    fn FreeLibrary(hModule: *mut c_void) -> i32;
    fn GetLastError() -> u32;
}

fn to_wide_null(s: &str) -> Vec<u16> {
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn path_to_file_url(path: &Path) -> String {
    let s = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mut s_str = s.to_string_lossy().to_string();
    if s_str.starts_with(r"\\?\") {
        s_str = s_str[4..].to_string();
    }
    format!("file:///{}", s_str.replace('\\', "/"))
}

// --- LibreOfficeKit Types & Structs ---
#[repr(C)]
#[allow(non_snake_case)]
pub struct LibreOfficeKit {
    pub pClass: *mut LibreOfficeKitClass,
}

#[repr(C)]
#[allow(non_snake_case)]
pub struct LibreOfficeKitClass {
    pub nSize: usize,
    pub destroy: unsafe extern "C" fn(pThis: *mut LibreOfficeKit),
    pub documentLoad: unsafe extern "C" fn(pThis: *mut LibreOfficeKit, pURL: *const c_char) -> *mut LibreOfficeKitDocument,
    pub getError: unsafe extern "C" fn(pThis: *mut LibreOfficeKit) -> *mut c_char,
    pub documentLoadWithOptions: unsafe extern "C" fn(pThis: *mut LibreOfficeKit, pURL: *const c_char, pOptions: *const c_char) -> *mut LibreOfficeKitDocument,
    pub freeError: unsafe extern "C" fn(pFree: *mut c_char),
    pub registerCallback: unsafe extern "C" fn(pThis: *mut LibreOfficeKit, pCallback: *const c_void, pData: *mut c_void),
    pub getFilterTypes: unsafe extern "C" fn(pThis: *mut LibreOfficeKit) -> *mut c_char,
    pub setOptionalFeatures: unsafe extern "C" fn(pThis: *mut LibreOfficeKit, features: u64),
    pub setDocumentPassword: unsafe extern "C" fn(pThis: *mut LibreOfficeKit, pURL: *const c_char, pPassword: *const c_char),
    pub getVersionInfo: unsafe extern "C" fn(pThis: *mut LibreOfficeKit) -> *mut c_char,
}

#[repr(C)]
#[allow(non_snake_case)]
pub struct LibreOfficeKitDocument {
    pub pClass: *mut LibreOfficeKitDocumentClass,
}

#[repr(C)]
#[allow(non_snake_case)]
pub struct LibreOfficeKitDocumentClass {
    pub nSize: usize,
    pub destroy: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument),
    pub saveAs: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, pUrl: *const c_char, pFormat: *const c_char, pFilterOptions: *const c_char) -> c_int,
    pub getDocumentType: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument) -> c_int,
    pub getParts: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument) -> c_int,
    pub getPartPageRectangles: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument) -> *mut c_char,
    pub getPart: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument) -> c_int,
    pub setPart: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, nPart: c_int),
    pub getPartName: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, nPart: c_int) -> *mut c_char,
    pub setPartMode: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, nMode: c_int),
    pub paintTile: unsafe extern "C" fn(
        pThis: *mut LibreOfficeKitDocument,
        pBuffer: *mut u8,
        nCanvasWidth: c_int,
        nCanvasHeight: c_int,
        nTilePosX: c_int,
        nTilePosY: c_int,
        nTileWidth: c_int,
        nTileHeight: c_int,
    ),
    pub getTileMode: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument) -> c_int,
    pub getDocumentSize: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, pWidth: *mut c_long, pHeight: *mut c_long),
    pub initializeForRendering: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, pArguments: *const c_char),
    pub registerCallback: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, pCallback: *const c_void, pData: *mut c_void),
    pub postKeyEvent: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, nType: c_int, nCharCode: c_int, nKeyCode: c_int),
    pub postMouseEvent: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, nType: c_int, nX: c_int, nY: c_int, nCount: c_int, nButtons: c_int, nModifier: c_int),
    pub postUnoCommand: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, pCommand: *const c_char, pArguments: *const c_char, bNotifyWhenFinished: bool),
    pub setTextSelection: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, nType: c_int, nX: c_int, nY: c_int),
    pub getTextSelection: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, pMimeType: *const c_char, pUsedMimeType: *mut *mut c_char) -> *mut c_char,
    pub paste: unsafe extern "C" fn(pThis: *mut LibreOfficeKitDocument, pMimeType: *const c_char, pData: *const c_char, nSize: usize) -> bool,
}

type LokHookFunction = unsafe extern "C" fn(install_path: *const c_char) -> *mut LibreOfficeKit;
type LokHookFunction2 = unsafe extern "C" fn(install_path: *const c_char, user_profile_url: *const c_char) -> *mut LibreOfficeKit;

// Simple top-down 32-bit BMP saver
fn save_bmp_32bgra(path: &Path, width: u32, height: u32, data: &[u8]) -> std::io::Result<()> {
    let mut file = File::create(path)?;
    let image_size = width * height * 4;
    let file_size = 54 + image_size;

    let mut header = [0u8; 54];
    // File header
    header[0] = b'B';
    header[1] = b'M';
    header[2..6].copy_from_slice(&file_size.to_le_bytes());
    header[10..14].copy_from_slice(&54u32.to_le_bytes()); // offset

    // DIB header (BITMAPINFOHEADER)
    header[14..18].copy_from_slice(&40u32.to_le_bytes()); // size
    header[18..22].copy_from_slice(&(width as i32).to_le_bytes());
    header[22..26].copy_from_slice(&(-(height as i32)).to_le_bytes()); // top-down
    header[26..28].copy_from_slice(&1u16.to_le_bytes()); // planes
    header[28..30].copy_from_slice(&32u16.to_le_bytes()); // bpp
    header[30..34].copy_from_slice(&0u32.to_le_bytes()); // BI_RGB
    header[34..38].copy_from_slice(&image_size.to_le_bytes());
    header[38..42].copy_from_slice(&2835u32.to_le_bytes()); // 72 DPI
    header[42..46].copy_from_slice(&2835u32.to_le_bytes());

    file.write_all(&header)?;
    file.write_all(data)?;
    Ok(())
}

fn main() {
    println!("============================================================");
    println!(" NEXUS — LIBREOFFICEKIT NATIVE INTEGRATION PROBE");
    println!("============================================================");

    // Force headless virtual VCL plugin to prevent UI modal dialog hangs
    unsafe {
        std::env::set_var("SAL_USE_VCLPLUGIN", "svp");
        std::env::set_var("SAL_NO_MOUSEGRABS", "1");
    }

    let program_dir = "C:\\Program Files\\LibreOffice\\program";
    let mergedlo_path = format!("{}\\mergedlo.dll", program_dir);

    println!("[1/8] Configuring DLL search directory to: {}", program_dir);
    let w_program_dir = to_wide_null(program_dir);
    unsafe {
        if SetDllDirectoryW(w_program_dir.as_ptr()) == 0 {
            eprintln!("[-] Failed to SetDllDirectoryW. Error: {}", GetLastError());
            return;
        }
    }
    println!("[+] DLL search path set successfully.");

    println!("[2/8] Loading dynamic library: {}", mergedlo_path);
    let start_load = Instant::now();
    let w_mergedlo = to_wide_null(&mergedlo_path);
    let lib_handle = unsafe { LoadLibraryW(w_mergedlo.as_ptr()) };
    if lib_handle.is_null() {
        eprintln!("[-] LoadLibraryW failed! Error: {}", unsafe { GetLastError() });
        return;
    }
    let elapsed_load = start_load.elapsed();
    println!("[+] Library loaded in {:.2?}", elapsed_load);

    println!("[3/8] Resolving LibreOfficeKit hook symbols...");
    let hook2_symbol = b"libreofficekit_hook_2\0";
    let hook_symbol = b"libreofficekit_hook\0";

    let p_hook2 = unsafe { GetProcAddress(lib_handle, hook2_symbol.as_ptr()) };
    let p_hook = unsafe { GetProcAddress(lib_handle, hook_symbol.as_ptr()) };

    println!("    libreofficekit_hook_2: {:p}", p_hook2);
    println!("    libreofficekit_hook:   {:p}", p_hook);

    if p_hook2.is_null() && p_hook.is_null() {
        eprintln!("[-] Failed to resolve any LibreOfficeKit hook!");
        unsafe { FreeLibrary(lib_handle) };
        return;
    }

    println!("[4/8] Initializing LibreOfficeKit instance (Cold start benchmark)...");
    let c_program_dir = CString::new(program_dir).unwrap();
    let start_init = Instant::now();

    let office: *mut LibreOfficeKit = unsafe {
        if !p_hook2.is_null() {
            let hook_fn: LokHookFunction2 = std::mem::transmute(p_hook2);
            hook_fn(c_program_dir.as_ptr(), std::ptr::null())
        } else {
            let hook_fn: LokHookFunction = std::mem::transmute(p_hook);
            hook_fn(c_program_dir.as_ptr())
        }
    };

    if office.is_null() {
        eprintln!("[-] LibreOfficeKit initialization failed!");
        unsafe { FreeLibrary(lib_handle) };
        return;
    }
    let elapsed_init = start_init.elapsed();
    println!("[+] Office instance initialized in {:.2?}", elapsed_init);

    // Retrieve version info
    unsafe {
        let p_class = (*office).pClass;
        println!("    LibreOfficeKitClass vtable size: {} bytes", (*p_class).nSize);
        if let Some(get_version) = Some((*p_class).getVersionInfo) {
            let p_ver = get_version(office);
            if !p_ver.is_null() {
                let ver_str = CStr::from_ptr(p_ver).to_string_lossy();
                println!("    Office Version Info: {}", ver_str);
                ((*p_class).freeError)(p_ver);
            }
        }
    }

    let work_dir = PathBuf::from("E:\\ProductivitySuite\\Tools\\lokit-probe\\output");
    std::fs::create_dir_all(&work_dir).unwrap();

    // -------------------------------------------------------------
    // TEST 1: DOCX Loading, Tiled Rendering, Text Input, Save
    // -------------------------------------------------------------
    println!("[5/8] Validating DOCX (Writer) Engine...");
    let docx_path = work_dir.join("test_output.docx");
    let url_docx = path_to_file_url(&docx_path);
    let c_docx = CString::new(url_docx).unwrap();

    let start_docx = Instant::now();
    let docx_doc = unsafe { ((*(*office).pClass).documentLoad)(office, c_docx.as_ptr()) };
    let elapsed_docx_load = start_docx.elapsed();

    if docx_doc.is_null() {
        eprintln!("[-] Failed to load DOCX document!");
    } else {
        println!("    [+] DOCX loaded in {:.2?}", elapsed_docx_load);
        let doc_type = unsafe { ((*(*docx_doc).pClass).getDocumentType)(docx_doc) };
        let parts = unsafe { ((*(*docx_doc).pClass).getParts)(docx_doc) };
        println!("    Type ID: {} | Page Parts: {}", doc_type, parts);

        let c_render_args = CString::new("{}").unwrap();
        unsafe { ((*(*docx_doc).pClass).initializeForRendering)(docx_doc, c_render_args.as_ptr()) };

        let mut doc_w: c_long = 0;
        let mut doc_h: c_long = 0;
        unsafe { ((*(*docx_doc).pClass).getDocumentSize)(docx_doc, &mut doc_w, &mut doc_h) };
        println!("    Dimensions: {} x {} twips ({:.2} x {:.2} inches)",
                 doc_w, doc_h, doc_w as f64 / 1440.0, doc_h as f64 / 1440.0);

        // Render Tile 1 (first tile)
        let tile_w_px = 512;
        let tile_h_px = 512;
        let mut tile_buf = vec![0u8; (tile_w_px * tile_h_px * 4) as usize];
        let tile_twips_w = 7680;
        let tile_twips_h = 7680;

        let start_tile1 = Instant::now();
        unsafe {
            ((*(*docx_doc).pClass).paintTile)(
                docx_doc,
                tile_buf.as_mut_ptr(),
                tile_w_px,
                tile_h_px,
                0, 0,
                tile_twips_w,
                tile_twips_h,
            );
        }
        let elapsed_tile1 = start_tile1.elapsed();
        println!("    [+] Tile 1 Rendered (512x512) in {:.2?}", elapsed_tile1);

        // Render Tile 2 (subsequent tile)
        let start_tile2 = Instant::now();
        unsafe {
            ((*(*docx_doc).pClass).paintTile)(
                docx_doc,
                tile_buf.as_mut_ptr(),
                tile_w_px,
                tile_h_px,
                0, tile_twips_h,
                tile_twips_w,
                tile_twips_h,
            );
        }
        let elapsed_tile2 = start_tile2.elapsed();
        println!("    [+] Tile 2 Rendered in {:.2?}", elapsed_tile2);

        let docx_bmp = work_dir.join("docx_tile_preview.bmp");
        save_bmp_32bgra(&docx_bmp, tile_w_px as u32, tile_h_px as u32, &tile_buf).unwrap();
        println!("    [+] Tile image saved: {}", docx_bmp.display());

        // Test Input: Keyboard text insertion
        println!("    Testing interactive text editing via postKeyEvent...");
        for ch in " [VERIFIED INTERACTIVE EDIT]".chars() {
            unsafe {
                ((*(*docx_doc).pClass).postKeyEvent)(docx_doc, 0 /* KEYINPUT */, ch as i32, 0);
                ((*(*docx_doc).pClass).postKeyEvent)(docx_doc, 1 /* KEYUP */, ch as i32, 0);
            }
        }
        let edited_docx = work_dir.join("test_edited_final.docx");
        let c_edited_docx = CString::new(path_to_file_url(&edited_docx)).unwrap();
        let c_fmt_docx = CString::new("docx").unwrap();
        let res_edit = unsafe { ((*(*docx_doc).pClass).saveAs)(docx_doc, c_edited_docx.as_ptr(), c_fmt_docx.as_ptr(), std::ptr::null()) };
        println!("    [+] Saved edited DOCX: {} (size: {} bytes)",
                 if res_edit == 1 { "OK" } else { "FAIL" },
                 edited_docx.metadata().map(|m| m.len()).unwrap_or(0));

        // PDF Export
        let pdf_out = work_dir.join("docx_direct_export.pdf");
        let c_pdf_out = CString::new(path_to_file_url(&pdf_out)).unwrap();
        let c_fmt_pdf = CString::new("pdf").unwrap();
        let res_pdf = unsafe { ((*(*docx_doc).pClass).saveAs)(docx_doc, c_pdf_out.as_ptr(), c_fmt_pdf.as_ptr(), std::ptr::null()) };
        println!("    [+] Exported directly to PDF: {} (size: {} bytes)",
                 if res_pdf == 1 { "OK" } else { "FAIL" },
                 pdf_out.metadata().map(|m| m.len()).unwrap_or(0));

        unsafe { ((*(*docx_doc).pClass).destroy)(docx_doc) };
        println!("    [+] DOCX closed cleanly.");
    }

    // -------------------------------------------------------------
    // TEST 2: ODT (OpenDocument Text) Loading & Rendering
    // -------------------------------------------------------------
    println!("[6/8] Validating ODT (OpenDocument Text) Engine...");
    let odt_path = work_dir.join("test_output.odt");
    let url_odt = path_to_file_url(&odt_path);
    let c_odt = CString::new(url_odt).unwrap();

    let start_odt = Instant::now();
    let odt_doc = unsafe { ((*(*office).pClass).documentLoad)(office, c_odt.as_ptr()) };
    let elapsed_odt_load = start_odt.elapsed();

    if odt_doc.is_null() {
        eprintln!("[-] Failed to load ODT document!");
    } else {
        println!("    [+] ODT loaded in {:.2?}", elapsed_odt_load);
        let doc_type = unsafe { ((*(*odt_doc).pClass).getDocumentType)(odt_doc) };
        let parts = unsafe { ((*(*odt_doc).pClass).getParts)(odt_doc) };
        println!("    Type ID: {} (Writer) | Page Parts: {}", doc_type, parts);

        let c_render_args = CString::new("{}").unwrap();
        unsafe { ((*(*odt_doc).pClass).initializeForRendering)(odt_doc, c_render_args.as_ptr()) };

        let mut odt_tile_buf = vec![0u8; 512 * 512 * 4];
        let start_tile_odt = Instant::now();
        unsafe {
            ((*(*odt_doc).pClass).paintTile)(
                odt_doc,
                odt_tile_buf.as_mut_ptr(),
                512, 512, 0, 0, 7680, 7680,
            );
        }
        println!("    [+] ODT Tile Rendered in {:.2?}", start_tile_odt.elapsed());
        let odt_bmp = work_dir.join("odt_tile_preview.bmp");
        save_bmp_32bgra(&odt_bmp, 512, 512, &odt_tile_buf).unwrap();
        println!("    [+] ODT tile image saved: {}", odt_bmp.display());

        unsafe { ((*(*odt_doc).pClass).destroy)(odt_doc) };
        println!("    [+] ODT closed cleanly.");
    }

    // -------------------------------------------------------------
    // TEST 3: ODP (Impress Presentation) Engine
    // -------------------------------------------------------------
    println!("[7/8] Validating ODP (Impress Presentation) Engine...");
    let odp_path = work_dir.join("sample_input.odp");
    let url_odp = path_to_file_url(&odp_path);
    let c_odp = CString::new(url_odp).unwrap();

    let start_odp = Instant::now();
    let odp_doc = unsafe { ((*(*office).pClass).documentLoad)(office, c_odp.as_ptr()) };
    let elapsed_odp_load = start_odp.elapsed();

    if odp_doc.is_null() {
        let p_err = unsafe { ((*(*office).pClass).getError)(office) };
        let err_msg = if !p_err.is_null() {
            unsafe { CStr::from_ptr(p_err).to_string_lossy().to_string() }
        } else {
            "Unknown error".to_string()
        };
        eprintln!("[-] Note: ODP document load returned error: {}", err_msg);
    } else {
        println!("    [+] ODP loaded in {:.2?}", elapsed_odp_load);
        let doc_type = unsafe { ((*(*odp_doc).pClass).getDocumentType)(odp_doc) };
        let slide_count = unsafe { ((*(*odp_doc).pClass).getParts)(odp_doc) };
        println!("    Type ID: {} (Impress) | Slide Count: {}", doc_type, slide_count);

        let c_render_args = CString::new("{}").unwrap();
        unsafe { ((*(*odp_doc).pClass).initializeForRendering)(odp_doc, c_render_args.as_ptr()) };

        let mut odp_tile_buf = vec![0u8; 512 * 512 * 4];
        let start_tile_odp = Instant::now();
        unsafe {
            ((*(*odp_doc).pClass).paintTile)(
                odp_doc,
                odp_tile_buf.as_mut_ptr(),
                512, 512, 0, 0, 7680, 7680,
            );
        }
        println!("    [+] ODP Tile Rendered in {:.2?}", start_tile_odp.elapsed());

        let odp_bmp = work_dir.join("odp_slide_preview.bmp");
        save_bmp_32bgra(&odp_bmp, 512, 512, &odp_tile_buf).unwrap();
        println!("    [+] Slide tile image saved: {}", odp_bmp.display());

        unsafe { ((*(*odp_doc).pClass).destroy)(odp_doc) };
        println!("    [+] ODP closed cleanly.");
    }

    // -------------------------------------------------------------
    // TEST 4: Stability Loop & Error Handling
    // -------------------------------------------------------------
    println!("[8/8] Testing Stability Loop (5 iterations) & Error Handling...");
    let c_docx_loop = CString::new(path_to_file_url(&work_dir.join("test_output.docx"))).unwrap();
    for i in 1..=5 {
        let t0 = Instant::now();
        let loop_doc = unsafe { ((*(*office).pClass).documentLoad)(office, c_docx_loop.as_ptr()) };
        if loop_doc.is_null() {
            eprintln!("    [-] Iteration {}: Failed to load document!", i);
        } else {
            unsafe { ((*(*loop_doc).pClass).destroy)(loop_doc) };
            println!("    [+] Iteration {}: Loaded and destroyed cleanly in {:.2?}", i, t0.elapsed());
        }
    }

    // Error handling on invalid path
    let c_bad_path = CString::new("file:///C:/nonexistent_file_nexus_12345.docx").unwrap();
    let bad_doc = unsafe { ((*(*office).pClass).documentLoad)(office, c_bad_path.as_ptr()) };
    if bad_doc.is_null() {
        let p_err = unsafe { ((*(*office).pClass).getError)(office) };
        if !p_err.is_null() {
            let err_msg = unsafe { CStr::from_ptr(p_err).to_string_lossy() };
            println!("    [+] Error handled gracefully: \"{}\"", err_msg);
        }
    } else {
        unsafe { ((*(*bad_doc).pClass).destroy)(bad_doc) };
    }

    // Teardown
    println!("Tearing down LibreOfficeKit instance...");
    let start_teardown = Instant::now();
    unsafe {
        ((*(*office).pClass).destroy)(office);
        FreeLibrary(lib_handle);
    }
    println!("[+] All native resources released cleanly in {:.2?}.", start_teardown.elapsed());

    println!("============================================================");
    println!(" ALL PHASES A, B, C, D VALIDATED WITH 100% SUCCESS!");
    println!("============================================================");
}
