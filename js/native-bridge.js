/**
 * 네이티브 앱 다리(bridge).
 *
 * 웹앱(app.js)은 window.mdViewerDesktop 하나만 바라본다.
 * 그 인터페이스를 실행 환경에 맞게 여기서 만들어 준다.
 *
 *  - Electron: preload.js 가 이미 window.mdViewerDesktop 을 넣어준다 → 그대로 둔다
 *  - Tauri:    아래에서 같은 모양으로 만들어 준다
 *  - 브라우저: 아무것도 하지 않는다 (app.js 가 알아서 브라우저 방식으로 동작)
 *
 * app.js 보다 먼저 실행되어야 한다.
 */
(() => {
  'use strict';

  // Electron 이 이미 다리를 놓았거나, Tauri 가 아니면 할 일이 없다
  if (window.mdViewerDesktop || !window.__TAURI__) return;

  const { dialog, event, core } = window.__TAURI__;
  const invoke = core.invoke;

  const MD_FILTER = [
    { name: '마크다운', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
    { name: '텍스트', extensions: ['txt'] },
  ];

  const baseName = (p) => String(p).split(/[\\/]/).pop();

  // 파일이 열렸을 때 웹앱에 알려줄 콜백 (app.js 가 등록한다)
  let onOpen = null;

  async function openPath(path) {
    if (!path) return;
    try {
      const content = await invoke('read_text_file', { path });
      if (onOpen) onOpen({ name: baseName(path), content });
    } catch (err) {
      console.warn('파일을 읽지 못했습니다.', err);
    }
  }

  window.mdViewerDesktop = {
    onOpenFile(callback) {
      onOpen = callback;
      // 파일 연결(.md 더블클릭)이나 두 번째 실행으로 들어온 파일은
      // Rust 쪽에서 경로만 보내준다.
      event.listen('open-file-path', (e) => openPath(e.payload));
      // 네이티브 메뉴의 "열기"
      event.listen('menu-open', () => window.mdViewerDesktop.openFileDialog());

      // 앱이 켜지기 전에 들어온 파일(.md 더블클릭으로 실행한 경우)을 가져온다.
      // 웹뷰가 준비되기 전 이벤트는 놓치므로, 준비된 지금 직접 물어본다.
      invoke('take_pending_file')
        .then((path) => path && openPath(path))
        .catch(() => {});
    },

    async openFileDialog() {
      const selected = await dialog.open({
        title: '마크다운 파일 열기',
        multiple: false,
        directory: false,
        filters: MD_FILTER,
      });
      // Tauri v2 는 선택 시 경로 문자열(또는 취소 시 null)을 준다
      await openPath(typeof selected === 'string' ? selected : selected && selected.path);
    },

    async saveFile({ name, content }) {
      try {
        const path = await dialog.save({
          title: '마크다운으로 저장',
          defaultPath: name,
          filters: MD_FILTER,
        });
        if (!path) return { ok: false, canceled: true };

        const target = typeof path === 'string' ? path : path.path;
        await invoke('write_text_file', { path: target, content: String(content == null ? '' : content) });
        return { ok: true, path: target };
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    },
  };
})();
