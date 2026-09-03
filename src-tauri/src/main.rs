// 윈도우에서 앱 실행 시 콘솔 창이 같이 뜨지 않도록 한다
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    markdown_viewer_lib::run()
}
