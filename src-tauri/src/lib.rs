use std::sync::Mutex;
use tauri::menu::{AboutMetadata, CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

struct ThemeState {
    items: Vec<CheckMenuItem<tauri::Wry>>,
}

const THEME_IDS: [&str; 6] = [
    "theme_github",
    "theme_github_dark",
    "theme_nord",
    "theme_nord_dark",
    "theme_catppuccin_latte",
    "theme_catppuccin_mocha",
];

struct L10n {
    file: &'static str,
    new: &'static str,
    open: &'static str,
    save: &'static str,
    save_as: &'static str,
    export_html: &'static str,
    export_pdf: &'static str,
    close_window: &'static str,
    edit: &'static str,
    view: &'static str,
    toggle_statusbar: &'static str,
    toggle_devtools: &'static str,
    zoom_in: &'static str,
    zoom_out: &'static str,
    reset_zoom: &'static str,
    toggle_fullscreen: &'static str,
    theme: &'static str,
    help: &'static str,
    about_moflow: &'static str,
}

fn zh() -> L10n {
    L10n {
        file: "文件",
        new: "新建",
        open: "打开...",
        save: "保存",
        save_as: "另存为...",
        export_html: "导出为 HTML",
        export_pdf: "导出为 PDF",
        close_window: "关闭窗口",
        edit: "编辑",
        view: "视图",
        toggle_statusbar: "切换状态栏",
        toggle_devtools: "开发者工具",
        zoom_in: "放大",
        zoom_out: "缩小",
        reset_zoom: "重置缩放",
        toggle_fullscreen: "切换全屏",
        theme: "主题",
        help: "帮助",
        about_moflow: "关于 MoFlow",
    }
}

fn en() -> L10n {
    L10n {
        file: "File",
        new: "New",
        open: "Open...",
        save: "Save",
        save_as: "Save As...",
        export_html: "Export as HTML",
        export_pdf: "Export as PDF",
        close_window: "Close Window",
        edit: "Edit",
        view: "View",
        toggle_statusbar: "Toggle Status Bar",
        toggle_devtools: "Toggle DevTools",
        zoom_in: "Zoom In",
        zoom_out: "Zoom Out",
        reset_zoom: "Reset Zoom",
        toggle_fullscreen: "Toggle Fullscreen",
        theme: "Theme",
        help: "Help",
        about_moflow: "About MoFlow",
    }
}

fn get_l10n() -> L10n {
    let locale = sys_locale::get_locale().unwrap_or_default();
    if locale.starts_with("zh") {
        zh()
    } else {
        en()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle();
            let l = get_l10n();

            let new_item = MenuItem::with_id(handle, "new", l.new, true, Some("Ctrl+N"))?;
            let open_item = MenuItem::with_id(handle, "open", l.open, true, Some("Ctrl+O"))?;
            let save_item = MenuItem::with_id(handle, "save", l.save, true, Some("Ctrl+S"))?;
            let save_as_item = MenuItem::with_id(handle, "save_as", l.save_as, true, Some("Ctrl+Shift+S"))?;
            let export_html = MenuItem::with_id(handle, "export_html", l.export_html, true, None::<&str>)?;
            let export_pdf = MenuItem::with_id(handle, "export_pdf", l.export_pdf, true, None::<&str>)?;
            let close_item = MenuItem::with_id(handle, "close", l.close_window, true, Some("Ctrl+W"))?;

            let file_menu = Submenu::with_items(
                handle,
                l.file,
                true,
                &[
                    &new_item,
                    &open_item,
                    &save_item,
                    &save_as_item,
                    &PredefinedMenuItem::separator(handle)?,
                    &export_html,
                    &export_pdf,
                    &PredefinedMenuItem::separator(handle)?,
                    &close_item,
                ],
            )?;

            let undo_item = PredefinedMenuItem::undo(handle, None)?;
            let redo_item = PredefinedMenuItem::redo(handle, None)?;
            let cut_item = PredefinedMenuItem::cut(handle, None)?;
            let copy_item = PredefinedMenuItem::copy(handle, None)?;
            let paste_item = PredefinedMenuItem::paste(handle, None)?;
            let select_all_item = PredefinedMenuItem::select_all(handle, None)?;

            let edit_menu = Submenu::with_items(
                handle,
                l.edit,
                true,
                &[
                    &undo_item,
                    &redo_item,
                    &PredefinedMenuItem::separator(handle)?,
                    &cut_item,
                    &copy_item,
                    &paste_item,
                    &PredefinedMenuItem::separator(handle)?,
                    &select_all_item,
                ],
            )?;

            let toggle_statusbar = MenuItem::with_id(handle, "toggle_statusbar", l.toggle_statusbar, true, None::<&str>)?;
            let devtools = MenuItem::with_id(handle, "toggle_devtools", l.toggle_devtools, true, Some("F12"))?;

            let theme_github = CheckMenuItem::with_id(handle, "theme_github", "GitHub Light", true, true, None::<&str>)?;
            let theme_github_dark = CheckMenuItem::with_id(handle, "theme_github_dark", "GitHub Dark", true, false, None::<&str>)?;
            let theme_nord = CheckMenuItem::with_id(handle, "theme_nord", "Nord Light", true, false, None::<&str>)?;
            let theme_nord_dark = CheckMenuItem::with_id(handle, "theme_nord_dark", "Nord Dark", true, false, None::<&str>)?;
            let theme_cat_latte = CheckMenuItem::with_id(handle, "theme_catppuccin_latte", "Catppuccin Latte", true, false, None::<&str>)?;
            let theme_cat_mocha = CheckMenuItem::with_id(handle, "theme_catppuccin_mocha", "Catppuccin Mocha", true, false, None::<&str>)?;

            let theme_items = vec![
                theme_github.clone(),
                theme_github_dark.clone(),
                theme_nord.clone(),
                theme_nord_dark.clone(),
                theme_cat_latte.clone(),
                theme_cat_mocha.clone(),
            ];
            app.manage(Mutex::new(ThemeState { items: theme_items }));

            let theme_menu = Submenu::with_items(
                handle,
                l.theme,
                true,
                &[
                    &theme_github,
                    &theme_github_dark,
                    &PredefinedMenuItem::separator(handle)?,
                    &theme_nord,
                    &theme_nord_dark,
                    &PredefinedMenuItem::separator(handle)?,
                    &theme_cat_latte,
                    &theme_cat_mocha,
                ],
            )?;

            let zoom_in = MenuItem::with_id(handle, "zoom_in", l.zoom_in, true, Some("Ctrl+="))?;
            let zoom_out = MenuItem::with_id(handle, "zoom_out", l.zoom_out, true, Some("Ctrl+-"))?;
            let reset_zoom = MenuItem::with_id(handle, "reset_zoom", l.reset_zoom, true, Some("Ctrl+0"))?;
            let fullscreen = MenuItem::with_id(handle, "fullscreen", l.toggle_fullscreen, true, Some("F11"))?;

            let view_menu = Submenu::with_items(
                handle,
                l.view,
                true,
                &[
                    &toggle_statusbar,
                    &PredefinedMenuItem::separator(handle)?,
                    &devtools,
                    &PredefinedMenuItem::separator(handle)?,
                    &zoom_in,
                    &zoom_out,
                    &reset_zoom,
                    &PredefinedMenuItem::separator(handle)?,
                    &fullscreen,
                ],
            )?;

            let about_meta = AboutMetadata {
                name: Some("MoFlow".into()),
                version: Some("0.1.0".into()),
                copyright: Some("© 2026 MoFlow".into()),
                ..Default::default()
            };
            let about_item = PredefinedMenuItem::about(handle, Some(l.about_moflow), Some(about_meta))?;

            let help_menu = Submenu::with_items(
                handle,
                l.help,
                true,
                &[&about_item],
            )?;

            let menu = Menu::with_items(handle, &[&file_menu, &edit_menu, &view_menu, &theme_menu, &help_menu])?;
            menu.set_as_app_menu()?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            let menu_id = event.id.as_ref();
            if menu_id == "toggle_devtools" {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
                return;
            }

            if menu_id.starts_with("theme_") {
                log::info!("Theme menu event: menu_id={}", menu_id);
                if let Some(state) = app.try_state::<Mutex<ThemeState>>() {
                    let mut state = state.lock().unwrap();
                    for (i, item) in state.items.iter().enumerate() {
                        let should_check = THEME_IDS[i] == menu_id;
                        log::info!("  set_checked('{}', {})", THEME_IDS[i], should_check);
                        let _ = item.set_checked(should_check);
                    }
                } else {
                    log::info!("  ThemeState not found in managed state");
                }
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("moflow-menu", menu_id);
                }
                return;
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("moflow-menu", menu_id);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
