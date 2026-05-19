use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;
use std::collections::HashMap;
use std::sync::{LazyLock, mpsc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

const WEBFETCH_MAX_BODY: usize = 5 * 1024 * 1024;
const WEBFETCH_TIMEOUT_SECS: u64 = 30;
#[cfg(target_os = "windows")]
const CHROME_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
#[cfg(target_os = "macos")]
const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
#[cfg(target_os = "linux")]
const CHROME_UA: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
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

#[derive(Serialize, Clone)]
struct StartupData {
    settings: Option<serde_json::Value>,
    session: Option<serde_json::Value>,
    active_tab_content: Option<String>,
    active_tab_id: Option<String>,
    untitled_contents: HashMap<String, String>,
}

struct StartupState {
    data: Option<StartupData>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionTabJson {
    tab_id: Option<String>,
    untitled_id: Option<String>,
    file_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionJson {
    tabs: Option<Vec<SessionTabJson>>,
    active_tab_id: Option<String>,
    active_file_path: Option<String>,
    active_untitled_id: Option<String>,
}

fn preload_startup_data(app: &tauri::App) -> StartupData {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return StartupData {
            settings: None,
            session: None,
            active_tab_content: None,
            active_tab_id: None,
            untitled_contents: HashMap::new(),
        },
    };

    let t0 = std::time::Instant::now();
    let settings: Option<serde_json::Value> = std::fs::read(dir.join("settings.json"))
        .ok()
        .and_then(|data| serde_json::from_slice(&data).ok());
    log::info!("[startup] preload-settings: {}ms", t0.elapsed().as_millis());

    let t1 = std::time::Instant::now();
    let session: Option<serde_json::Value> = std::fs::read(dir.join("session.json"))
        .ok()
        .and_then(|data| serde_json::from_slice(&data).ok());
    log::info!("[startup] preload-session: {}ms", t1.elapsed().as_millis());

    let t2 = std::time::Instant::now();
    let (active_tab_id, active_tab_content, untitled_contents) = match &session {
        Some(session_val) => {
            let parsed: Result<SessionJson, _> = serde_json::from_value(session_val.clone());
            match parsed {
                Ok(sess) => {
                    let mut active_id: Option<String> = None;
                    let mut active_path: Option<String> = None;
                    let mut untitled = HashMap::new();

                    if let Some(ref id) = sess.active_tab_id {
                        active_id = Some(id.clone());
                    } else if let Some(ref path) = sess.active_file_path {
                        active_path = Some(path.clone());
                    } else if let Some(ref id) = sess.active_untitled_id {
                        active_id = Some(id.clone());
                    }

                    if let Some(ref tabs) = sess.tabs {
                        for tab in tabs {
                            let tab_id = tab.tab_id.as_deref().or(tab.untitled_id.as_deref());
                            if let Some(tid) = tab_id {
                                if tab.file_path.is_none() {
                                    let untitled_path = dir.join("untitled").join(format!("{}.md", tid));
                                    if let Ok(content) = std::fs::read_to_string(&untitled_path) {
                                        untitled.insert(tid.to_string(), content);
                                    }
                                }
                                if active_path.is_none() && active_id.as_deref() == Some(tid) && tab.file_path.is_some() {
                                    active_path = tab.file_path.clone();
                                }
                                if active_id.is_none() && active_path.is_none() && tab.file_path.is_some() {
                                    active_id = Some(tid.to_string());
                                    active_path = tab.file_path.clone();
                                }
                            }
                        }
                    }

                    let content = if let Some(ref path) = active_path {
                        std::fs::read_to_string(path).ok()
                    } else {
                        None
                    };

                    (active_id, content, untitled)
                }
                Err(_) => (None, None, HashMap::new()),
            }
        }
        None => (None, None, HashMap::new()),
    };
    log::info!("[startup] preload-tab-content: {}ms", t2.elapsed().as_millis());
    log::info!("[startup] preload-total: {}ms", t0.elapsed().as_millis());

    StartupData {
        settings,
        session,
        active_tab_content,
        active_tab_id,
        untitled_contents,
    }
}

fn validate_proxy_url(url: &str) -> Option<String> {
    if url.is_empty() {
        return None;
    }
    match url.parse::<url::Url>() {
        Ok(_) => Some(url.to_string()),
        Err(e) => {
            log::warn!("[proxy] invalid proxy URL '{}': {}", url, e);
            None
        }
    }
}

fn read_proxy_from_settings(app: &tauri::App) -> Option<String> {
    let dir = app.path().app_data_dir().ok()?;
    let path = dir.join("settings.json");
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

static NOISE_FULL_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
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
    ].iter().map(|p| Regex::new(p).unwrap()).collect()
});

static BLOCK_ELEMENT_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?is)<header[^>]*>.*?</header>",
        r"(?is)<form[^>]*>.*?</form>",
        r"(?is)<button[^>]*>.*?</button>",
    ].iter().map(|p| Regex::new(p).unwrap()).collect()
});

static SCRIPT_STYLE_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?is)<script[^>]*>.*?</script>",
        r"(?is)<style[^>]*>.*?</style>",
        r"(?s)<!--.*?-->",
    ].iter().map(|p| Regex::new(p).unwrap()).collect()
});

static CLASS_ATTR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"\s+class\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)"#).unwrap()
});

static STYLE_ATTR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)"#).unwrap()
});

static TAG_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<[^>]+>").unwrap());
static MULTI_NEWLINE_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\n{3,}").unwrap());

fn strip_patterns(html: &str, patterns: &[Regex]) -> String {
    let mut result = html.to_string();
    for re in patterns {
        result = re.replace_all(&result, "").into_owned();
    }
    result
}

fn strip_html_noise_full(html: &str) -> String {
    strip_patterns(html, &NOISE_FULL_PATTERNS)
}

fn strip_block_elements(html: &str) -> String {
    strip_patterns(html, &BLOCK_ELEMENT_PATTERNS)
}

fn strip_script_style(html: &str) -> String {
    strip_patterns(html, &SCRIPT_STYLE_PATTERNS)
}

fn strip_class_style_attrs(html: &str) -> String {
    let result = CLASS_ATTR_RE.replace_all(html, "");
    STYLE_ATTR_RE.replace_all(&result, "").into_owned()
}

fn strip_all_tags(html: &str) -> String {
    let result = TAG_RE.replace_all(html, "");
    let result = MULTI_NEWLINE_RE.replace_all(&result, "\n\n");
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
    let mut s = body.to_string();
    s.truncate(500);
    let head = s.to_lowercase();
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
        let mut s = text.to_string();
        s.truncate(WEBFETCH_MAX_BODY);
        s.push_str("\n...[response truncated]");
        s
    }
}

fn build_reqwest_client(proxy_url: Option<&str>, user_agent: &str) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(WEBFETCH_TIMEOUT_SECS))
        .user_agent(user_agent);
    if let Some(url) = proxy_url {
        if !url.is_empty() {
            log::info!("[reqwest] using proxy: {}", url);
            builder = builder.proxy(reqwest::Proxy::all(url).map_err(|e| format!("Invalid proxy URL '{}': {}", url, e))?);
        }
    } else {
        log::info!("[reqwest] no proxy configured");
    }
    builder.build().map_err(|e| e.to_string())
}

fn get_cancel_token(app: &tauri::AppHandle) -> CancellationToken {
    app.state::<CancelState>().token.lock().unwrap().clone()
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
    let cancel_token = get_cancel_token(&app);
    let proxy_url = app.state::<ProxyState>().proxy_url.lock().ok().and_then(|guard| guard.clone())
        .or_else(|| std::env::var("HTTPS_PROXY").ok().or_else(|| std::env::var("HTTP_PROXY").ok()).or_else(|| std::env::var("ALL_PROXY").ok()));

    if let Some(ref p) = proxy_url {
        log::info!("[webfetch] proxy: {} -> {}", p, url);
    } else {
        log::info!("[webfetch] no proxy -> {}", url);
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

    let cancel_token2 = get_cancel_token(&app);
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
            let cancel_token3 = get_cancel_token(&app);
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
        let cancel_token3 = get_cancel_token(&app);
        let body = tokio::select! {
            b = res.bytes() => b,
            _ = cancel_token3.cancelled() => {
                return Err("Request cancelled".to_string());
            }
        }.map_err(|e| format!("Failed to read response: {}", e))?;
        return process_response(&content_type, &body, &fmt);
    }

    let cancel_token3 = get_cancel_token(&app);
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
            log::info!("[webfetch] markdown: {} -> {} bytes ({}% removed)", original_size, cleaned_size, removed_pct);
            truncate_body(&md)
        }
        "text" => {
            let cleaned = strip_html_noise_full(&body_text);
            let cleaned = strip_block_elements(&cleaned);
            let cleaned = strip_class_style_attrs(&cleaned);
            let text = strip_all_tags(&cleaned);
            let cleaned_size = text.len();
            let removed_pct = if original_size > 0 { 100 - cleaned_size * 100 / original_size } else { 0 };
            log::info!("[webfetch] text: {} -> {} bytes ({}% removed)", original_size, cleaned_size, removed_pct);
            truncate_body(&text)
        }
        "html" => {
            let cleaned = strip_script_style(&body_text);
            let cleaned_size = cleaned.len();
            let removed_pct = if original_size > 0 { 100 - cleaned_size * 100 / original_size } else { 0 };
            log::info!("[webfetch] html: {} -> {} bytes ({}% removed)", original_size, cleaned_size, removed_pct);
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
        Some(u) => log::info!("[proxy] set_proxy: {}", u),
        None => log::info!("[proxy] set_proxy: disabled"),
    }
    *url = validated;
    Ok(())
}

#[tauri::command]
fn allow_paths(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let scope = app.fs_scope();
    for path in &paths {
        scope.allow_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_startup_data(state: tauri::State<StartupState>) -> Option<StartupData> {
    state.data.clone()
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

const SKILLS_REPO_OWNER: &str = "xmm1989218";
const SKILLS_REPO_NAME: &str = "moflow-skills";

#[tauri::command]
async fn fetch_skill_registry(url: String, app: tauri::AppHandle) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL: only http and https allowed".to_string());
    }

    let proxy_url = app.state::<ProxyState>().proxy_url.lock().ok().and_then(|guard| guard.clone())
        .or_else(|| std::env::var("HTTPS_PROXY").ok().or_else(|| std::env::var("HTTP_PROXY").ok()).or_else(|| std::env::var("ALL_PROXY").ok()));

    let client = build_reqwest_client(proxy_url.as_deref(), CHROME_UA)?;
    let res = client.get(&url)
        .header("Accept", "application/vnd.github+json, application/json, text/yaml, text/plain, */*")
        .send()
        .await
        .map_err(|e| format!("Request error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("HTTP error {}", res.status()));
    }

    let body = res.text().await.map_err(|e| format!("Read body error: {}", e))?;
    Ok(body)
}

#[tauri::command]
async fn download_and_install_skill(tag: String, skill_name: String, app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let skills_dir = dir.join("skills");
    std::fs::create_dir_all(&skills_dir).map_err(|e| format!("Create skills dir: {}", e))?;

    let target_dir = skills_dir.join(&skill_name);
    let tmp_dir = skills_dir.join(format!(".tmp-{}", skill_name));

    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir).map_err(|e| format!("Remove stale tmp: {}", e))?;
    }

    let zip_url = format!(
        "https://github.com/{}/{}/archive/refs/tags/{}.zip",
        SKILLS_REPO_OWNER, SKILLS_REPO_NAME, tag
    );

    log::info!("[skill] downloading: {}", zip_url);

    let proxy_url = app.state::<ProxyState>().proxy_url.lock().ok().and_then(|guard| guard.clone())
        .or_else(|| std::env::var("HTTPS_PROXY").ok().or_else(|| std::env::var("HTTP_PROXY").ok()).or_else(|| std::env::var("ALL_PROXY").ok()));

    let client = build_reqwest_client(proxy_url.as_deref(), CHROME_UA)?;
    let res = client.get(&zip_url).send().await.map_err(|e| format!("Download error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Download HTTP error {}", res.status()));
    }

    let bytes = res.bytes().await.map_err(|e| format!("Read download: {}", e))?;
    log::info!("[skill] downloaded {} bytes for {}", bytes.len(), skill_name);

    std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("Create tmp dir: {}", e))?;

    let reader = std::io::Cursor::new(&bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("Zip parse: {}", e))?;

    let skill_prefix_path = std::path::PathBuf::from(format!("skills/{}", skill_name));

    let mut extracted_any = false;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Zip entry {}: {}", i, e))?;
        let out_path = match file.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue,
        };

        let after_root: std::path::PathBuf = out_path.components().skip(1).collect();
        if after_root.as_os_str().is_empty() { continue; }

        if !after_root.starts_with(&skill_prefix_path) {
            continue;
        }

        let relative = after_root.strip_prefix(&skill_prefix_path).map_err(|e| format!("Strip prefix: {}", e))?;
        if relative.as_os_str().is_empty() && file.is_dir() {
            std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("Create dir {}: {}", tmp_dir.display(), e))?;
            continue;
        }

        let full_path = tmp_dir.join(relative);

        if file.is_dir() {
            std::fs::create_dir_all(&full_path).map_err(|e| format!("Create dir {}: {}", full_path.display(), e))?;
        } else {
            if let Some(parent) = full_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Create parent {}: {}", parent.display(), e))?;
            }
            let mut out_file = std::fs::File::create(&full_path).map_err(|e| format!("Create file {}: {}", full_path.display(), e))?;
            std::io::copy(&mut file, &mut out_file).map_err(|e| format!("Write file {}: {}", full_path.display(), e))?;
            extracted_any = true;
        }
    }

    if !extracted_any {
        std::fs::remove_dir_all(&tmp_dir).ok();
        return Err(format!("Skill '{}' not found in repository archive", skill_name));
    }

    let old_dir = skills_dir.join(format!("{}.old", skill_name));

    if target_dir.exists() {
        if old_dir.exists() {
            std::fs::remove_dir_all(&old_dir).map_err(|e| format!("Remove old backup: {}", e))?;
        }
        std::fs::rename(&target_dir, &old_dir).map_err(|e| format!("Rename current to old: {}", e))?;
    }

    let rename_result = std::fs::rename(&tmp_dir, &target_dir);
    if rename_result.is_err() {
        if old_dir.exists() {
            let rollback = std::fs::rename(&old_dir, &target_dir);
            if rollback.is_err() {
                log::error!("[skill] rollback failed for {}", skill_name);
            }
        }
        std::fs::remove_dir_all(&tmp_dir).ok();
        return rename_result.map_err(|e| format!("Install rename: {}", e));
    }

    if old_dir.exists() {
        std::fs::remove_dir_all(&old_dir).map_err(|e| {
            log::warn!("[skill] failed to remove old backup for {}: {}", skill_name, e);
            format!("Remove old: {}", e)
        })?;
    }

    log::info!("[skill] installed {} v{}", skill_name, tag);
    Ok(())
}

#[tauri::command]
async fn uninstall_skill(skill_name: String, app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let skill_dir = dir.join("skills").join(&skill_name);

    if !skill_dir.exists() {
        return Err(format!("Skill '{}' not found", skill_name));
    }

    std::fs::remove_dir_all(&skill_dir).map_err(|e| format!("Remove {}: {}", skill_name, e))?;
    log::info!("[skill] uninstalled {}", skill_name);
    Ok(())
}

#[tauri::command]
async fn clean_skill_temp(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let skills_dir = dir.join("skills");

    if !skills_dir.exists() {
        return Ok(());
    }

    let entries = std::fs::read_dir(&skills_dir).map_err(|e| format!("Read dir: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Entry: {}", e))?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if name_str.starts_with(".tmp-") || name_str.ends_with(".old") {
            let path = entry.path();
            if path.is_dir() {
                std::fs::remove_dir_all(&path).map_err(|e| format!("Remove {}: {}", path.display(), e))?;
            } else {
                std::fs::remove_file(&path).map_err(|e| format!("Remove {}: {}", path.display(), e))?;
            }
            log::info!("[skill] cleaned {}", name_str);
        }
    }
    Ok(())
}

#[tauri::command]
async fn check_bun_available() -> Result<String, String> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::process::Command::new("bun")
            .arg("--version")
            .output(),
    )
    .await
    .map_err(|_| "Timeout: bun check took >5s".to_string())?
    .map_err(|e| format!("Failed to run bun: {}", e))?;

    if !output.status.success() {
        return Err(format!("bun exited with code {}", output.status.code().unwrap_or(-1)));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        return Err("bun --version returned empty output".to_string());
    }
    Ok(version)
}

#[tauri::command]
async fn execute_script(
    script_path: String,
    args: Vec<String>,
    env_vars: Option<HashMap<String, String>>,
    timeout_secs: Option<u64>,
    cwd: Option<String>,
) -> Result<String, String> {
    let timeout = std::time::Duration::from_secs(timeout_secs.unwrap_or(30));
    let script_dir = std::path::Path::new(&script_path)
        .parent()
        .ok_or_else(|| "Script path has no parent directory".to_string())?;

    if !std::path::Path::new(&script_path).exists() {
        return Err(format!("Script not found: {}", script_path));
    }

    let work_dir = cwd
        .as_deref()
        .and_then(|c| if std::path::Path::new(c).exists() { Some(c.to_string()) } else { None })
        .unwrap_or_else(|| script_dir.to_string_lossy().to_string());

    let mut cmd = tokio::process::Command::new("bun");
    cmd.arg(&script_path)
        .args(&args)
        .current_dir(&work_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(vars) = env_vars {
        for (k, v) in vars {
            cmd.env(k, v);
        }
    }

    let output = tokio::time::timeout(timeout, cmd.output())
        .await
        .map_err(|_| format!("Script timed out after {}s", timeout.as_secs()))?
        .map_err(|e| format!("Failed to execute bun: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let code = output.status.code().unwrap_or(-1);
        let msg = if stderr.is_empty() {
            format!("Script exited with code {}", code)
        } else {
            format!("Script exited with code {}: {}", code, stderr.trim())
        };
        return Err(msg);
    }

    if !stderr.is_empty() {
        log::warn!("[execute_script] stderr: {}", stderr.trim());
    }

    Ok(stdout)
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

        #[cfg(target_os = "windows")]
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
                let path_h_for_pdf = path_h;
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

        let result = tokio::task::spawn_blocking(move || {
            rx.recv().map_err(|e| e.to_string()).and_then(|r| r)
        }).await.map_err(|e| e.to_string())??;

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
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![toggle_devtools, export_pdf, allow_paths, webfetch, set_proxy, cancel_requests, get_startup_data, fetch_skill_registry, download_and_install_skill, uninstall_skill, clean_skill_temp, check_bun_available, execute_script])
        .setup(move |app| {
            log::info!("[startup] setup-enter: {}ms", app_start.elapsed().as_millis());

            let startup_data = preload_startup_data(app);
            log::info!("[startup] preload-done: {}ms", app_start.elapsed().as_millis());

            let proxy_url = read_proxy_from_settings(app);
            log::info!("[startup] proxy-read: {}ms", app_start.elapsed().as_millis());

            let mut window_builder = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("MoFlow")
            .inner_size(1200.0, 800.0)
            .resizable(true)
            .center()
            .visible(false);

            #[cfg(target_os = "macos")]
            {
                window_builder = window_builder
                    .decorations(true)
                    .title_bar_style(tauri::TitleBarStyle::Overlay);
            }

            #[cfg(not(target_os = "macos"))]
            {
                window_builder = window_builder.decorations(false);
            }

            #[cfg(target_os = "windows")]
            if let Some(ref url) = proxy_url {
                if let Ok(parsed) = url.parse::<url::Url>() {
                    window_builder = window_builder.proxy_url(parsed);
                    log::info!("[startup] WebView2 proxy enabled: {}", url);
                }
            }

            #[cfg(not(target_os = "windows"))]
            if proxy_url.is_some() {
                log::info!("[startup] proxy configured (system/webfetch only): {}", proxy_url.as_deref().unwrap());
            }

            window_builder.build().map_err(|e| format!("Failed to create main window: {}", e))?;
            log::info!("[startup] window-built: {}ms", app_start.elapsed().as_millis());

            app.manage(StartupState { data: Some(startup_data) });
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

            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.show();
                    }
                });
            }

            log::info!("[startup] setup-done: {}ms", app_start.elapsed().as_millis());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

