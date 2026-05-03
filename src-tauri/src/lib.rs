use tauri::Manager;
use std::sync::mpsc;

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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![toggle_devtools, export_pdf])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
