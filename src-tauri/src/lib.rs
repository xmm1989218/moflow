use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;
use std::sync::mpsc;
use regex::Regex;
use serde::Deserialize;
use tokio_util::sync::CancellationToken;

const WEBFETCH_MAX_BODY: usize = 5 * 1024 * 1024;
const WEBFETCH_TIMEOUT_SECS: u64 = 30;
const CHROME_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const REAL_UA: &str = "opencode";

struct ProxyState {
    proxy_url: std::sync::Mutex<Option<String>>,
}

struct CancelState {
    token: std::sync::Mutex<CancellationToken>,
}

#[derive(Deserialize)]
struct SettingsJson {
    #[serde(rename = "proxyUrl")]
    proxy_url: Option<String>,
}

fn validate_proxy_url(url: &str) -> Option<String> {
    if url.is_empty() {
        return None;
    }
    match url.parse::<url::Url>() {
        Ok(_) => Some(url.to_string()),
        Err(e) => {
            println!("[proxy] warn: invalid proxy URL '{}': {}", url, e);
            None
        }
    }
}

fn read_proxy_from_settings(app: &tauri::App) -> Option<String> {
    let path = app.path().app_data_dir().ok().map(|dir| dir.join("settings.json"));
    let path = match path {
        Some(p) => p,
        None => return None,
    };
    let data = match std::fs::read(&path) {
        Ok(d) => d,
        Err(_) => return None,
    };
    let settings: SettingsJson = match serde_json::from_slice(&data) {
        Ok(s) => s,
        Err(_) => return None,
    };
    settings.proxy_url.as_deref().and_then(validate_proxy_url)
}

fn accept_header(format: &str) -> &'static str {
    match format {
        "markdown" => "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1",
        "text" => "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1",
        "html" => "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1",
        _ => "*/*",
    }
}

fn strip_html_noise_full(html: &str) -> String {
    let patterns: Vec<Regex> = [
        r"(?is)<head[^>]*>.*?</head>",
        r"(?is)<script[^>]*>.*?</script>",
        r"(?is)<style[^>]*>.*?</style>",
        r"(?is)<noscript[^>]*>.*?</noscript>",
        r"(?is)<svg[^>]*>.*?</svg>",
        r"(?is)<nav[^>]*>.*?</nav>",
        r"(?is)<footer[^>]*>.*?</footer>",
        r"(?is)<aside[^>]*>.*?</aside>",
        r"(?is)<iframe[^>]*>.*?</iframe>",
        r"(?is)<object[^>]*>.*?</object>",
        r"(?is)<embed[^>]*>.*?</embed>",
        r"(?i)<link\b[^>]*>",
        r"(?s)<!--.*?-->",
    ].iter().map(|p| Regex::new(p).unwrap()).collect();

    let mut result = html.to_string();
    for re in &patterns {
        result = re.replace_all(&result, "").into_owned();
    }
    result
}

fn strip_block_elements(html: &str) -> String {
    let patterns: Vec<Regex> = [
        r"(?is)<header[^>]*>.*?</header>",
        r"(?is)<form[^>]*>.*?</form>",
        r"(?is)<button[^>]*>.*?</button>",
    ].iter().map(|p| Regex::new(p).unwrap()).collect();

    let mut result = html.to_string();
    for re in &patterns {
        result = re.replace_all(&result, "").into_owned();
    }
    result
}

fn strip_script_style(html: &str) -> String {
    let patterns: Vec<Regex> = [
        r"(?is)<script[^>]*>.*?</script>",
        r"(?is)<style[^>]*>.*?</style>",
        r"(?s)<!--.*?-->",
    ].iter().map(|p| Regex::new(p).unwrap()).collect();

    let mut result = html.to_string();
    for re in &patterns {
        result = re.replace_all(&result, "").into_owned();
    }
    result
}

fn strip_class_style_attrs(html: &str) -> String {
    let class_re = Regex::new(r#"\s+class\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)"#).unwrap();
    let style_re = Regex::new(r#"\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)"#).unwrap();
    let result = class_re.replace_all(html, "");
    style_re.replace_all(&result, "").into_owned()
}

fn strip_all_tags(html: &str) -> String {
    let re = Regex::new(r"<[^>]+>").unwrap();
    let result = re.replace_all(html, "");
    let ws_re = Regex::new(r"\n{3,}").unwrap();
    let result = ws_re.replace_all(&result, "\n\n");
    result.trim().to_string()
}

fn html_to_markdown(html: &str) -> String {
    htmd::convert(html).unwrap_or_else(|e| format!("[HTML to Markdown conversion error: {}]", e))
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

fn is_image_mime(content_type: &str) -> bool {
    let ct = content_type.to_lowercase();
    ct.starts_with("image/") && !ct.contains("svg")
}

fn truncate_body(text: &str) -> String {
    if text.len() <= WEBFETCH_MAX_BODY {
        text.to_string()
    } else {
        text[..WEBFETCH_MAX_BODY].to_string() + "\n...[response truncated]"
    }
}

fn build_reqwest_client(proxy_url: Option<&str>, user_agent: &str) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(WEBFETCH_TIMEOUT_SECS))
        .user_agent(user_agent);
    if let Some(url) = proxy_url {
        if !url.is_empty() {
            println!("[reqwest] using proxy: {}", url);
            builder = builder.proxy(reqwest::Proxy::all(url).map_err(|e| format!("Invalid proxy URL '{}': {}", url, e))?);
        }
    } else {
        println!("[reqwest] no proxy configured");
    }
    builder.build().map_err(|e| e.to_string())
}

#[tauri::command]
async fn webfetch(url: String, format: Option<String>, app: tauri::AppHandle) -> Result<String, String> {
    let fmt = format.unwrap_or_else(|| "markdown".to_string());
    if fmt != "markdown" && fmt != "text" && fmt != "html" {
        return Err(format!("Invalid format '{}'. Supported: markdown, text, html", fmt));
    }

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Unsupported URL protocol. Only http and https are allowed.".to_string());
    }

    let accept = accept_header(&fmt);
    let cancel_token = app.state::<CancelState>().token.lock().unwrap().clone();
    let proxy_url = app.state::<ProxyState>().proxy_url.lock().ok().and_then(|guard| guard.clone())
        .or_else(|| std::env::var("HTTPS_PROXY").ok().or_else(|| std::env::var("HTTP_PROXY").ok()).or_else(|| std::env::var("ALL_PROXY").ok()));

    if let Some(ref p) = proxy_url {
        println!("[webfetch] proxy: {} -> {}", p, url);
    } else {
        println!("[webfetch] no proxy -> {}", url);
    }

    let client = build_reqwest_client(proxy_url.as_deref(), CHROME_UA)?;

    let res = tokio::select! {
        res = client.get(&url).header("Accept", accept).send() => res,
        _ = cancel_token.cancelled() => {
            return Err("Request cancelled".to_string());
        }
    }.map_err(|e| {
        if e.is_timeout() {
            format!("Request timed out after {}s", WEBFETCH_TIMEOUT_SECS)
        } else if e.is_connect() {
            format!("Connection failed: {}", e)
        } else {
            format!("Request error: {}", e)
        }
    })?;

    let cancel_token2 = app.state::<CancelState>().token.lock().unwrap().clone();
    let status = res.status();
    let content_type = res.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let cf_mitigated = res.headers()
        .get("cf-mitigated")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if status.as_u16() == 403 && cf_mitigated == "challenge" {
        let retry_client = build_reqwest_client(proxy_url.as_deref(), REAL_UA)?;

        let retry_res = tokio::select! {
            res = retry_client.get(&url).header("Accept", accept).send() => res,
            _ = cancel_token2.cancelled() => {
                return Err("Request cancelled".to_string());
            }
        }.map_err(|e| format!("Cloudflare retry failed: {}", e))?;

        if retry_res.status().is_success() {
            let ct = retry_res.headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            let cancel_token3 = app.state::<CancelState>().token.lock().unwrap().clone();
            let body = tokio::select! {
                b = retry_res.bytes() => b,
                _ = cancel_token3.cancelled() => {
                    return Err("Request cancelled".to_string());
                }
            }.map_err(|e| format!("Failed to read response: {}", e))?;
            return process_response(&ct, &body, &fmt);
        } else {
            return Err(format!("HTTP error {} (Cloudflare challenge)", retry_res.status()));
        }
    }

    if !status.is_success() {
        return Err(format!("HTTP error {}: {}", status, status.canonical_reason().unwrap_or("Unknown")));
    }

    if is_image_mime(&content_type) {
        let cancel_token3 = app.state::<CancelState>().token.lock().unwrap().clone();
        let body = tokio::select! {
            b = res.bytes() => b,
            _ = cancel_token3.cancelled() => {
                return Err("Request cancelled".to_string());
            }
        }.map_err(|e| format!("Failed to read response: {}", e))?;
        return process_response(&content_type, &body, &fmt);
    }

    let cancel_token3 = app.state::<CancelState>().token.lock().unwrap().clone();
    let body = tokio::select! {
        b = res.bytes() => b,
        _ = cancel_token3.cancelled() => {
            return Err("Request cancelled".to_string());
        }
    }.map_err(|e| format!("Failed to read response: {}", e))?;
    process_response(&content_type, &body, &fmt)
}

fn process_response(content_type: &str, body: &[u8], fmt: &str) -> Result<String, String> {
    if is_image_mime(content_type) {
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, body);
        return Ok(format!("data:{};base64,{}", content_type, encoded));
    }

    let body_text = String::from_utf8_lossy(body).into_owned();

    let is_html = is_html_content(content_type) || (content_type.is_empty() && looks_like_html(&body_text));

    if !is_html {
        return Ok(truncate_body(&body_text));
    }

    let original_size = body_text.len();

    let result = match fmt {
        "markdown" => {
            let cleaned = strip_html_noise_full(&body_text);
            let cleaned = strip_block_elements(&cleaned);
            let cleaned = strip_class_style_attrs(&cleaned);
            let md = html_to_markdown(&cleaned);
            let cleaned_size = md.len();
            let removed_pct = if original_size > 0 { 100 - cleaned_size * 100 / original_size } else { 0 };
            println!("[webfetch] markdown: {} -> {} bytes ({}% removed)", original_size, cleaned_size, removed_pct);
            truncate_body(&md)
        }
        "text" => {
            let cleaned = strip_html_noise_full(&body_text);
            let cleaned = strip_block_elements(&cleaned);
            let cleaned = strip_class_style_attrs(&cleaned);
            let text = strip_all_tags(&cleaned);
            let cleaned_size = text.len();
            let removed_pct = if original_size > 0 { 100 - cleaned_size * 100 / original_size } else { 0 };
            println!("[webfetch] text: {} -> {} bytes ({}% removed)", original_size, cleaned_size, removed_pct);
            truncate_body(&text)
        }
        "html" => {
            let cleaned = strip_script_style(&body_text);
            let cleaned_size = cleaned.len();
            let removed_pct = if original_size > 0 { 100 - cleaned_size * 100 / original_size } else { 0 };
            println!("[webfetch] html: {} -> {} bytes ({}% removed)", original_size, cleaned_size, removed_pct);
            truncate_body(&cleaned)
        }
        _ => truncate_body(&body_text),
    };

    Ok(result)
}

#[tauri::command]
fn cancel_requests(state: tauri::State<CancelState>) -> Result<(), String> {
    let mut token = state.token.lock().map_err(|e| e.to_string())?;
    token.cancel();
    *token = CancellationToken::new();
    Ok(())
}

#[tauri::command]
fn set_proxy(proxy_url: Option<String>, state: tauri::State<ProxyState>) -> Result<(), String> {
    let validated = proxy_url.as_deref().and_then(|u| validate_proxy_url(u));
    let mut url = state.proxy_url.lock().map_err(|e| e.to_string())?;
    match &validated {
        Some(u) => println!("[proxy] set_proxy: {}", u),
        None => println!("[proxy] set_proxy: disabled"),
    }
    *url = validated;
    Ok(())
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

        let mut pdf_builder = tauri::WebviewWindowBuilder::new(
            &app,
            &label,
            tauri::WebviewUrl::External("about:blank".parse().unwrap()),
        )
        .visible(false)
        .decorations(false)
        .skip_taskbar(true)
        .inner_size(1024.0, 768.0);

        if let Some(proxy_state) = app.try_state::<ProxyState>() {
            if let Some(ref url) = *proxy_state.proxy_url.lock().map_err(|e| e.to_string())? {
                if !url.is_empty() {
                    if let Ok(parsed) = url.parse::<url::Url>() {
                        pdf_builder = pdf_builder.proxy_url(parsed);
                    }
                }
            }
        }

        let webview_window = pdf_builder.build().map_err(|e| e.to_string())?;

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
        .invoke_handler(tauri::generate_handler![toggle_devtools, export_pdf, allow_paths, webfetch, set_proxy, cancel_requests])
        .setup(move |app| {
            println!("[startup] rust-setup: {}ms", app_start.elapsed().as_millis());

            let proxy_url = read_proxy_from_settings(app);

            let mut window_builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("MoFlow")
            .inner_size(1200.0, 800.0)
            .resizable(true)
            .center()
            .decorations(false)
            .visible(false);

            if let Some(ref url) = proxy_url {
                if let Ok(parsed) = url.parse::<url::Url>() {
                    window_builder = window_builder.proxy_url(parsed);
                    println!("[startup] WebView2 proxy enabled: {}", url);
                }
            } else {
                println!("[startup] no proxy configured for WebView2");
            }

            window_builder.build().map_err(|e| format!("Failed to create main window: {}", e))?;

            app.manage(ProxyState {
                proxy_url: std::sync::Mutex::new(proxy_url),
            });
            app.manage(CancelState {
                token: std::sync::Mutex::new(CancellationToken::new()),
            });

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
