use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;
use std::sync::mpsc;
use regex::Regex;

const WEBFETCH_MAX_BODY: usize = 100 * 1024;
const WEBFETCH_TIMEOUT_SECS: u64 = 30;

fn strip_html_noise(html: &str) -> String {
    let patterns: Vec<Regex> = [
        r"(?is)<head[^>]*>.*?</head>",
        r"(?is)<script[^>]*>.*?</script>",
        r"(?is)<style[^>]*>.*?</style>",
        r"(?is)<noscript[^>]*>.*?</noscript>",
        r"(?is)<svg[^>]*>.*?</svg>",
        r"(?i)<link\b[^>]*>",
        r"(?s)<!--.*?-->",
    ].iter().map(|p| Regex::new(p).unwrap()).collect();

    let mut result = html.to_string();
    for re in &patterns {
        result = re.replace_all(&result, "").into_owned();
    }
    result
}

fn is_html_content(content_type: &str) -> bool {
    let ct = content_type.to_lowercase();
    ct.contains("text/html") || ct.contains("application/xhtml")
}

fn looks_like_html(body: &str) -> bool {
    let prefix = body.len().min(500);
    let head = body[..prefix].to_lowercase();
    head.contains("<!doctype html") || head.contains("<html")
}

#[tauri::command]
async fn webfetch(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(format!("Unsupported URL protocol. Only http and https are allowed."));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(WEBFETCH_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url).send().await.map_err(|e| {
        if e.is_timeout() {
            format!("Request timed out after {}s", WEBFETCH_TIMEOUT_SECS)
        } else if e.is_connect() {
            format!("Connection failed: {}", e)
        } else {
            format!("Request error: {}", e)
        }
    })?;

    if !res.status().is_success() {
        return Err(format!("HTTP error {}: {}", res.status(), res.status().canonical_reason().unwrap_or("Unknown")));
    }

    let content_type = res.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body = res.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

    let result = if is_html_content(&content_type) || (content_type.is_empty() && looks_like_html(&body)) {
        let original_size = body.len();
        let cleaned = strip_html_noise(&body);
        let cleaned_size = cleaned.len();
        let removed_pct = if original_size > 0 { 100 - cleaned_size * 100 / original_size } else { 0 };
        println!("[webfetch] HTML stripped: {} -> {} bytes ({}% removed)", original_size, cleaned_size, removed_pct);
        if cleaned.len() > WEBFETCH_MAX_BODY {
            cleaned[..WEBFETCH_MAX_BODY].to_string() + "\n...[response truncated]"
        } else {
            cleaned
        }
    } else {
        if body.len() > WEBFETCH_MAX_BODY {
            body[..WEBFETCH_MAX_BODY].to_string() + "\n...[response truncated]"
        } else {
            body
        }
    };

    Ok(result)
}

#[tauri::command]
async fn allow_paths(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let scope = app.fs_scope();
    for path in &paths {
        scope.allow_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn fix_taskbar_icon(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;

    unsafe {
        let hinst = GetModuleHandleW(None).ok().map(|h| windows::Win32::Foundation::HINSTANCE(h.0));

        let cx_small = GetSystemMetrics(SM_CXSMICON);
        let cy_small = GetSystemMetrics(SM_CYSMICON);
        let cx_big = GetSystemMetrics(SM_CXICON);
        let cy_big = GetSystemMetrics(SM_CYICON);

        let resource_id: u16 = 32512;

        if let Ok(hicon_small) = LoadImageW(
            hinst,
            windows::core::PCWSTR(resource_id as *mut u16),
            IMAGE_ICON,
            cx_small,
            cy_small,
            LR_DEFAULTCOLOR,
        ) {
            let _ = SendMessageW(
                hwnd,
                WM_SETICON,
                Some(windows::Win32::Foundation::WPARAM(ICON_SMALL as usize)),
                Some(windows::Win32::Foundation::LPARAM(hicon_small.0 as isize)),
            );
        }

        if let Ok(hicon_big) = LoadImageW(
            hinst,
            windows::core::PCWSTR(resource_id as *mut u16),
            IMAGE_ICON,
            cx_big,
            cy_big,
            LR_DEFAULTCOLOR,
        ) {
            let _ = SendMessageW(
                hwnd,
                WM_SETICON,
                Some(windows::Win32::Foundation::WPARAM(ICON_BIG as usize)),
                Some(windows::Win32::Foundation::LPARAM(hicon_big.0 as isize)),
            );
        }
    }
}

#[tauri::command]
fn toggle_devtools(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(debug_assertions)]
        {
            if window.is_devtools_open() {
                window.close_devtools();
            } else {
                window.open_devtools();
            }
        }
        #[cfg(not(debug_assertions))]
        {
            window.open_devtools();
        }
    }
}

#[tauri::command]
async fn export_pdf(app: tauri::AppHandle, html: String, path: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2, ICoreWebView2_7, ICoreWebView2Environment6,
            COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
        };
        use webview2_com::{NavigationCompletedEventHandler, PrintToPdfCompletedHandler};
        use windows_core::Interface;

        let label = format!("__pdf_export_{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis());

        let webview_window = tauri::WebviewWindowBuilder::new(
            &app,
            &label,
            tauri::WebviewUrl::External("about:blank".parse().unwrap()),
        )
        .visible(false)
        .decorations(false)
        .skip_taskbar(true)
        .inner_size(1024.0, 768.0)
        .build()
        .map_err(|e| e.to_string())?;

        let (tx, rx) = mpsc::channel::<Result<bool, String>>();
        let tx_nav = tx.clone();
        let tx_pdf = tx.clone();
        let path_h: windows_core::HSTRING = path.into();

        webview_window
            .with_webview(move |webview| {
                let controller = webview.controller();
                let core: ICoreWebView2 = match unsafe { controller.CoreWebView2() } {
                    Ok(w) => w,
                    Err(e) => {
                        let _ = tx_nav.send(Err(e.to_string()));
                        return;
                    }
                };

                let core_7: ICoreWebView2_7 = match core.cast() {
                    Ok(w) => w,
                    Err(e) => {
                        let _ = tx_nav.send(Err(e.to_string()));
                        return;
                    }
                };

                let environment = webview.environment();
                let env6: ICoreWebView2Environment6 = match environment.cast() {
                    Ok(e) => e,
                    Err(e) => {
                        let _ = tx_nav.send(Err(e.to_string()));
                        return;
                    }
                };

                let settings = match unsafe { env6.CreatePrintSettings() } {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = tx_nav.send(Err(e.to_string()));
                        return;
                    }
                };

                if let Err(e) = unsafe {
                    settings
                        .SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)
                        .and_then(|_| settings.SetMarginBottom(0.5))
                        .and_then(|_| settings.SetMarginLeft(0.25))
                        .and_then(|_| settings.SetMarginRight(0.25))
                        .and_then(|_| settings.SetMarginTop(0.5))
                } {
                    let _ = tx_nav.send(Err(e.to_string()));
                    return;
                }

                let core_for_nav = core.clone();
                let core_for_pdf = core_7;
                let settings_for_pdf = settings;
                let path_h_for_pdf = path_h.clone();
                let mut nav_token: i64 = 0;

                let nav_handler = NavigationCompletedEventHandler::create(
                    {
                        let tx_pdf_err = tx_pdf.clone();
                        Box::new(move |_sender, _args| {
                            let tx_pdf_inner = tx_pdf.clone();
                            let completed = PrintToPdfCompletedHandler::create(
                                Box::new(move |hr: windows_core::Result<()>, is_successful: bool| {
                                    if let Err(e) = hr {
                                        let _ = tx_pdf_inner.send(Err(format!("PrintToPdf failed: {e}")));
                                    } else {
                                        let _ = tx_pdf_inner.send(Ok(is_successful));
                                    }
                                    Ok(())
                                }),
                            );

                            if let Err(e) = unsafe {
                                core_for_pdf.PrintToPdf(&path_h_for_pdf, &settings_for_pdf, &completed)
                            } {
                                let _ = tx_pdf_err.send(Err(e.to_string()));
                            }
                            Ok(())
                        })
                    },
                );

                if let Err(e) = unsafe { core_for_nav.add_NavigationCompleted(&nav_handler, &mut nav_token) } {
                    let _ = tx_nav.send(Err(e.to_string()));
                    return;
                }

                let html_h: windows_core::HSTRING = html.into();
                if let Err(e) = unsafe { core.NavigateToString(&html_h) } {
                    let _ = tx_nav.send(Err(e.to_string()));
                }
            })
            .map_err(|e| e.to_string())?;

        let result = rx.recv().map_err(|e| e.to_string())??;

        let _ = webview_window.close();

        Ok(result)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, html, path);
        Err("PDF export is only supported on Windows".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_start = std::time::Instant::now();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![toggle_devtools, export_pdf, allow_paths, webfetch])
        .setup(move |app| {
            println!("[startup] rust-setup: {}ms", app_start.elapsed().as_millis());

            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                    let window = app.get_webview_window("main").expect("no main window");
                    let _ = window.set_focus();
                    if args.len() > 1 {
                        let _ = window.emit("single-instance-file-open", &args[1]);
                    }
                }))?;

                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = window.hwnd() {
                        fix_taskbar_icon(hwnd);
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
