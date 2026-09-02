// 렌더러(웹앱)와 메인 프로세스를 잇는 최소한의 다리.
// contextIsolation 이 켜져 있으므로 필요한 것만 골라서 노출한다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mdViewerDesktop', {
  // 메인 프로세스가 파일을 읽어 보내주면 웹앱 쪽에 이벤트로 알린다
  onOpenFile(callback) {
    ipcRenderer.on('open-file', (_event, payload) => callback(payload));
  },
  // 웹앱의 "파일 열기" 버튼 → 브라우저 파일 입력 대신 네이티브 대화상자
  openFileDialog() {
    return ipcRenderer.invoke('open-file-dialog');
  },
  // "파일로 저장" → 네이티브 저장 대화상자로 직접 파일을 쓴다
  saveFile(payload) {
    return ipcRenderer.invoke('save-file', payload);
  },
});
