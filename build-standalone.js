#!/usr/bin/env node
/**
 * index.html 과 그 자산들을 하나의 HTML 파일로 합친다.
 *
 *   node build-standalone.js
 *   → markdown-viewer.html 생성
 *
 * 생성된 파일은 서버 없이 file:// 로 열어도 동작한다.
 * (서비스 워커가 필요한 오프라인 캐시 / 홈 화면 설치 / 공유 받기는 제외된다.)
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const OUTPUT = path.join(root, 'markdown-viewer.html');

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// 인라인한 스크립트 안에 </script> 문자열이 있으면 태그가 조기 종료된다.
const escapeForScriptTag = (js) => js.replace(/<\/script/gi, '<\\/script');

const css = read('css/style.css');
const marked = read('vendor/marked.min.js');
const purify = read('vendor/purify.min.js');
const app = read('js/app.js');
const iconSvg = read('icons/icon.svg');

const iconDataUri = 'data:image/svg+xml,' + encodeURIComponent(iconSvg.trim());

let html = read('index.html');

// 1) 외부 스타일시트 → 인라인 <style>
html = html.replace(
  /^[ \t]*<link rel="stylesheet" href="css\/style\.css" \/>\n/m,
  `  <style>\n${css}\n  </style>\n`
);

// 2) 매니페스트 링크 제거 (단일 파일에는 PWA 매니페스트가 없다)
html = html.replace(/^[ \t]*<link rel="manifest"[^>]*>\n/m, '');

// 3) 아이콘 → data URI (외부 파일 의존 제거)
html = html.replace(/href="icons\/icon\.svg"/g, `href="${iconDataUri}"`);

// 4) 외부 스크립트 3개 → 인라인 <script>
const scripts = [
  ['vendor/marked.min.js', marked],
  ['vendor/purify.min.js', purify],
  ['js/app.js', app],
];

for (const [src, code] of scripts) {
  const tag = new RegExp(`^[ \\t]*<script src="${src.replace(/[./]/g, '\\$&')}"><\\/script>\\n`, 'm');
  if (!tag.test(html)) {
    throw new Error(`index.html 에서 <script src="${src}"> 를 찾지 못했습니다.`);
  }
  html = html.replace(tag, `  <script>\n${escapeForScriptTag(code)}\n  </script>\n`);
}

// 5) 남아 있는 외부 참조가 없는지 검증
//    인라인된 스크립트/스타일 본문은 제외한다 (라이브러리 코드 안의
//    문자열이 src=/href= 처럼 보여 오탐이 발생하기 때문).
const markupOnly = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');

const leftovers = markupOnly.match(/(?:src|href)="(?!data:|#|https?:)[^"]+"/g);
if (leftovers) {
  throw new Error(`인라인되지 않은 외부 참조가 남아 있습니다: ${leftovers.join(', ')}`);
}

fs.writeFileSync(OUTPUT, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`생성 완료: ${path.relative(root, OUTPUT)} (${kb} KB)`);
