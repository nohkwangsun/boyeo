#!/usr/bin/env node
/**
 * 모바일 앱(Capacitor)에 넣을 웹 자산을 www/ 로 모은다.
 *
 *   node build-mobile.js
 *
 * Capacitor 는 하나의 webDir 안에 있는 것만 앱에 담기 때문에,
 * 저장소 루트에 흩어져 있는 웹앱 파일을 여기로 복사한다.
 * (www/ 는 생성물이므로 저장소에 커밋하지 않는다 — .gitignore 참고)
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const OUT = path.join(root, 'www');

// 앱에 담을 것 — 서비스 워커/매니페스트는 네이티브 앱에선 불필요하므로 제외
const ENTRIES = ['index.html', 'css', 'js', 'vendor', 'icons'];

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dest, name));
  } else {
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const entry of ENTRIES) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) throw new Error(`빠진 자산: ${entry}`);
  copy(src, path.join(OUT, entry));
}

// 네이티브 앱에는 PWA 설치 배너/서비스 워커가 필요 없다.
// app.js 가 이미 http(s) 에서만 서비스 워커를 등록하도록 막고 있으므로
// 별도 처리는 필요 없지만, 매니페스트 링크는 지워 불필요한 요청을 없앤다.
const indexPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(/^[ \t]*<link rel="manifest"[^>]*>\n/m, '');
fs.writeFileSync(indexPath, html);

const count = (function walk(dir) {
  return fs.readdirSync(dir).reduce((n, name) => {
    const p = path.join(dir, name);
    return n + (fs.statSync(p).isDirectory() ? walk(p) : 1);
  }, 0);
})(OUT);

console.log(`www/ 생성 완료 (${count}개 파일)`);
