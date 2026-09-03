// 마크다운 뷰어 — 데스크탑 셸 (Tauri)
//
// 화면은 www/ 의 웹앱이 그대로 그린다. 여기서는 데스크탑에서만 의미 있는
// 것들만 담당한다: 네이티브 메뉴, .md 파일 연결로 실행됐을 때의 인자 처리,
// 파일 읽기/쓰기, 창 크기 기억.
//
// 파일 입출력을 fs 플러그인 대신 여기(Rust)에서 처리하는 이유:
// 플러그인은 접근 가능한 경로를 스코프로 제한하는데, 사용자가 대화상자로
// 고른 임의의 경로를 다뤄야 하므로 직접 처리하는 편이 단순하고 확실하다.

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

/// 앱이 켜지기 전에 들어온 파일 경로를 잠시 들고 있는다.
/// (웹뷰가 준비되기 전에 이벤트를 쏘면 놓치기 때문에, 웹앱이 직접 가져가게 한다)
#[derive(Default)]
struct PendingFile(Mutex<Option<String>>);

/// 확대/축소 배율
struct ZoomLevel(Mutex<f64>);

impl Default for ZoomLevel {
    fn default() -> Self {
        ZoomLevel(Mutex::new(1.0))
    }
}

const MD_EXTS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "txt"];

/// 실행 인자에서 마크다운 파일 경로를 찾는다 (파일 더블클릭 / 명령줄 인자)
fn markdown_path_from_args(args: &[String]) -> Option<String> {
    args.iter().skip(1).find_map(|arg| {
        if arg.starts_with('-') {
            return None;
        }
        let path = std::path::Path::new(arg);
        let ext_ok = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| MD_EXTS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false);
        if ext_ok && path.is_file() {
            Some(arg.clone())
        } else {
            None
        }
    })
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// 시작할 때 열어야 할 파일이 있으면 한 번만 돌려준다.
#[tauri::command]
fn take_pending_file(state: tauri::State<'_, PendingFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut p| p.take())
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "열기…", true, Some("CmdOrCtrl+O"))?;
    let file = Submenu::with_items(
        app,
        "파일",
        true,
        &[&open, &PredefinedMenuItem::separator(app)?, &PredefinedMenuItem::quit(app, Some("종료"))?],
    )?;

    let edit = Submenu::with_items(
        app,
        "편집",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("실행 취소"))?,
            &PredefinedMenuItem::redo(app, Some("다시 실행"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("잘라내기"))?,
            &PredefinedMenuItem::copy(app, Some("복사"))?,
            &PredefinedMenuItem::paste(app, Some("붙여넣기"))?,
            &PredefinedMenuItem::select_all(app, Some("전체 선택"))?,
        ],
    )?;

    let zoom_in = MenuItem::with_id(app, "zoom_in", "확대", true, Some("CmdOrCtrl+Plus"))?;
    let zoom_out = MenuItem::with_id(app, "zoom_out", "축소", true, Some("CmdOrCtrl+-"))?;
    let zoom_reset = MenuItem::with_id(app, "zoom_reset", "실제 크기", true, Some("CmdOrCtrl+0"))?;
    let view = Submenu::with_items(
        app,
        "보기",
        true,
        &[
            &zoom_in,
            &zoom_out,
            &zoom_reset,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, Some("전체 화면"))?,
        ],
    )?;

    Menu::with_items(app, &[&file, &edit, &view])
}

fn apply_zoom(app: &tauri::AppHandle, delta: Option<f64>) {
    let state = app.state::<ZoomLevel>();
    let mut level = match state.0.lock() {
        Ok(l) => l,
        Err(_) => return,
    };
    *level = match delta {
        Some(d) => (*level + d).clamp(0.5, 3.0),
        None => 1.0,
    };
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_zoom(*level);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // 이미 앱이 떠 있는데 파일을 더블클릭한 경우: 새 창을 띄우지 않고
    // 기존 창으로 파일을 넘긴다.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = markdown_path_from_args(&argv) {
                let _ = app.emit("open-file-path", path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(PendingFile::default())
        .manage(ZoomLevel::default())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            take_pending_file
        ])
        .setup(|app| {
            let handle = app.handle();

            let menu = build_menu(handle)?;
            app.set_menu(menu)?;

            // 실행 인자로 넘어온 파일은 웹앱이 준비된 뒤 가져가도록 보관해 둔다
            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = markdown_path_from_args(&args) {
                if let Ok(mut pending) = app.state::<PendingFile>().0.lock() {
                    *pending = Some(path);
                }
            }

            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                let _ = app.emit("menu-open", ());
            }
            "zoom_in" => apply_zoom(app, Some(0.1)),
            "zoom_out" => apply_zoom(app, Some(-0.1)),
            "zoom_reset" => apply_zoom(app, None),
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("앱을 시작하지 못했습니다");
}
