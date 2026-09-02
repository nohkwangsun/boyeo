// Electron 메인 프로세스
// 웹앱(index.html)을 그대로 띄우되, 데스크탑에서만 의미 있는 것들을 얹는다:
// 네이티브 메뉴, 파일 열기 대화상자, .md 파일 연결(더블클릭으로 열기),
// 창 크기 기억, 외부 링크는 기본 브라우저로.

const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const MD_EXT = /\.(md|markdown|mdown|mkd|txt)$/i;

let mainWindow = null;
let pendingFile = null; // 창이 준비되기 전에 들어온 파일을 잠시 들고 있는다

// ---------------- 창 상태 기억 ----------------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch (_) {}
  return { width: 1000, height: 800 };
}

function saveState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const { x, y, width, height } = mainWindow.getBounds();
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ x, y, width, height, maximized: mainWindow.isMaximized() })
    );
  } catch (_) {}
}

// ---------------- 파일 열기 ----------------
function readAndSend(filePath) {
  if (!filePath) return;
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    dialog.showErrorBox('파일을 열 수 없습니다', `${filePath}\n\n${err.message}`);
    return;
  }
  const payload = { name: path.basename(filePath), content };

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('open-file', payload);
    mainWindow.focus();
  } else {
    pendingFile = payload; // 아직 준비 전 — did-finish-load 에서 보낸다
  }
}

async function openFileDialog() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '마크다운 파일 열기',
    properties: ['openFile'],
    filters: [
      { name: '마크다운', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: '텍스트', extensions: ['txt'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
  });
  if (!canceled && filePaths[0]) readAndSend(filePaths[0]);
}

// 실행 인자에서 마크다운 파일 경로를 찾는다(파일 더블클릭 / CLI 인자)
function fileFromArgv(argv) {
  return (
    argv
      .slice(1)
      .filter((a) => !a.startsWith('-') && a !== '.')
      .find((a) => MD_EXT.test(a) && fs.existsSync(a)) || null
  );
}

// ---------------- 메뉴 ----------------
function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '파일',
      submenu: [
        { label: '열기…', accelerator: 'CmdOrCtrl+O', click: openFileDialog },
        { type: 'separator' },
        isMac ? { role: 'close', label: '닫기' } : { role: 'quit', label: '종료' },
      ],
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '전체 선택' },
      ],
    },
    {
      label: '보기',
      submenu: [
        { role: 'resetZoom', label: '실제 크기' },
        { role: 'zoomIn', label: '확대' },
        { role: 'zoomOut', label: '축소' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' },
        { role: 'reload', label: '새로고침' },
        { role: 'toggleDevTools', label: '개발자 도구' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        {
          label: '프로젝트 저장소 열기',
          click: () => shell.openExternal('https://github.com/nohkwangsun/boyeo'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------- 창 ----------------
function createWindow() {
  const state = loadState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 380,
    minHeight: 420,
    backgroundColor: '#ffffff',
    title: '마크다운 뷰어',
    icon: path.join(ROOT, 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (state.maximized) mainWindow.maximize();

  mainWindow.loadFile(path.join(ROOT, 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingFile) {
      mainWindow.webContents.send('open-file', pendingFile);
      pendingFile = null;
    }
  });

  // 문서 안의 외부 링크는 앱 안에서 열지 않고 기본 브라우저로 넘긴다
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  ['resize', 'move', 'close'].forEach((e) => mainWindow.on(e, saveState));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------- 앱 수명주기 ----------------
// 두 번째 실행은 새 창을 띄우지 않고, 이미 떠 있는 창으로 파일을 전달한다
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const file = fileFromArgv(argv);
    if (file) readAndSend(file);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS: 파일을 앱 아이콘에 떨어뜨리거나 연결 프로그램으로 열었을 때
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    readAndSend(filePath);
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();

    const file = fileFromArgv(process.argv);
    if (file) readAndSend(file);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // 렌더러(웹앱)에서 "파일 열기" 버튼을 눌렀을 때도 네이티브 대화상자를 쓴다
  ipcMain.handle('open-file-dialog', openFileDialog);
}
