(() => {
  'use strict';

  // ---------- Elements ----------
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const workspace = document.getElementById('workspace');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const fileInput = document.getElementById('file-input');
  const filenameBadge = document.getElementById('filename-badge');

  const btnOpen = document.getElementById('btn-open');
  const btnSave = document.getElementById('btn-save');
  const btnToc = document.getElementById('btn-toc');
  const btnTocClose = document.getElementById('btn-toc-close');
  const btnFontMinus = document.getElementById('btn-font-minus');
  const btnFontPlus = document.getElementById('btn-font-plus');
  const btnTheme = document.getElementById('btn-theme');
  const btnClear = document.getElementById('btn-clear');

  const tocDrawer = document.getElementById('toc-drawer');
  const tocList = document.getElementById('toc-list');
  const scrim = document.getElementById('scrim');
  const dropzoneOverlay = document.getElementById('dropzone-overlay');

  // ---------- Storage keys ----------
  const LS_DRAFT = 'md-viewer-draft';
  const LS_FILENAME = 'md-viewer-filename';
  const LS_THEME = 'md-viewer-theme';
  const LS_FONT_SIZE = 'md-viewer-font-size';
  const LS_VIEW = 'md-viewer-view';

  const MIN_FONT = 13;
  const MAX_FONT = 26;
  const DEFAULT_FONT = 16;

  let currentFilename = '';

  // ---------- Markdown rendering ----------
  if (window.marked) {
    marked.setOptions({
      gfm: true,
      breaks: true,
    });
  }

  function renderMarkdown(source) {
    if (!source || !source.trim()) {
      preview.innerHTML = '';
      preview.classList.add('empty');
      tocList.innerHTML = '';
      renderTocEmptyState();
      return;
    }
    preview.classList.remove('empty');

    let html = '';
    try {
      html = window.marked ? window.marked.parse(source) : escapeHtml(source);
    } catch (err) {
      html = `<p>마크다운을 렌더링하는 중 오류가 발생했습니다: ${escapeHtml(String(err))}</p>`;
    }

    const clean = window.DOMPurify
      ? window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
      : html;

    preview.innerHTML = clean;
    postProcessPreview();
    buildToc();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function postProcessPreview() {
    // 외부 링크는 새 탭으로, 이미지는 지연 로딩
    preview.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
    preview.querySelectorAll('img').forEach((img) => {
      img.setAttribute('loading', 'lazy');
    });
  }

  // ---------- Table of contents ----------
  const usedSlugs = new Map();

  function slugify(text) {
    const base = text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-');
    const clean = base || 'section';
    const count = usedSlugs.get(clean) || 0;
    usedSlugs.set(clean, count + 1);
    return count === 0 ? clean : `${clean}-${count}`;
  }

  function buildToc() {
    usedSlugs.clear();
    const headings = Array.from(preview.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    tocList.innerHTML = '';

    if (!headings.length) {
      renderTocEmptyState();
      return;
    }

    const frag = document.createDocumentFragment();
    headings.forEach((heading) => {
      const id = slugify(heading.textContent || '');
      heading.id = id;
      const level = Number(heading.tagName.substring(1));
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'toc-item';
      item.style.paddingLeft = `${16 + (level - 1) * 12}px`;
      item.textContent = heading.textContent;
      item.addEventListener('click', () => {
        setView('preview');
        closeToc();
        requestAnimationFrame(() => {
          heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      frag.appendChild(item);
    });
    tocList.appendChild(frag);
  }

  function renderTocEmptyState() {
    tocList.innerHTML = '<p class="toc-empty">표시할 목차가 없습니다.</p>';
  }

  function openToc() {
    tocDrawer.classList.add('open');
    tocDrawer.setAttribute('aria-hidden', 'false');
    scrim.classList.add('open');
  }

  function closeToc() {
    tocDrawer.classList.remove('open');
    tocDrawer.setAttribute('aria-hidden', 'true');
    scrim.classList.remove('open');
  }

  btnToc.addEventListener('click', () => {
    tocDrawer.classList.contains('open') ? closeToc() : openToc();
  });
  btnTocClose.addEventListener('click', closeToc);
  scrim.addEventListener('click', closeToc);

  // ---------- View switching (edit / preview tabs, mobile) ----------
  function setView(view) {
    workspace.classList.remove('view-edit', 'view-preview');
    workspace.classList.add(`view-${view}`);
    tabs.forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    try {
      localStorage.setItem(LS_VIEW, view);
    } catch (_) {}
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  });

  // ---------- Editor input / autosave ----------
  let saveTimer = null;
  editor.addEventListener('input', () => {
    renderMarkdown(editor.value);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LS_DRAFT, editor.value);
      } catch (_) {}
    }, 300);
  });

  function setEditorContent(text, filename) {
    editor.value = text;
    renderMarkdown(text);
    try {
      localStorage.setItem(LS_DRAFT, text);
    } catch (_) {}
    if (filename !== undefined) {
      currentFilename = filename;
      filenameBadge.textContent = filename;
      try {
        localStorage.setItem(LS_FILENAME, filename);
      } catch (_) {}
    }
  }

  // ---------- Open file ----------
  btnOpen.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    readFile(file);
    fileInput.value = '';
  });

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      setEditorContent(String(reader.result || ''), file.name);
      setView('preview');
    };
    reader.onerror = () => {
      alert('파일을 읽는 중 오류가 발생했습니다.');
    };
    reader.readAsText(file);
  }

  // ---------- Drag & drop ----------
  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragCounter++;
    dropzoneOverlay.classList.add('active');
  });
  window.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) dropzoneOverlay.classList.remove('active');
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    dragCounter = 0;
    dropzoneOverlay.classList.remove('active');
    readFile(e.dataTransfer.files[0]);
  });

  // ---------- Save (download) ----------
  btnSave.addEventListener('click', () => {
    const blob = new Blob([editor.value], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFilename && /\.\w+$/.test(currentFilename) ? currentFilename : 'document.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ---------- Clear ----------
  btnClear.addEventListener('click', () => {
    if (editor.value.trim() && !confirm('편집 중인 내용을 모두 지울까요?')) return;
    setEditorContent('', '');
  });

  // ---------- Font size ----------
  function applyFontSize(size) {
    const clamped = Math.min(MAX_FONT, Math.max(MIN_FONT, size));
    document.documentElement.style.setProperty('--content-font-size', `${clamped}px`);
    try {
      localStorage.setItem(LS_FONT_SIZE, String(clamped));
    } catch (_) {}
    return clamped;
  }

  let fontSize = DEFAULT_FONT;
  btnFontMinus.addEventListener('click', () => {
    fontSize = applyFontSize(fontSize - 1);
  });
  btnFontPlus.addEventListener('click', () => {
    fontSize = applyFontSize(fontSize + 1);
  });

  // ---------- Theme ----------
  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      const isDark =
        theme === 'dark' ||
        (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      metaTheme.setAttribute('content', isDark ? '#0f172a' : '#f8fafc');
    }
  }

  btnTheme.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effectiveDark = current === 'dark' || (!current && systemDark);
    const next = effectiveDark ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(LS_THEME, next);
    } catch (_) {}
  });

  // ---------- Share target payload pickup ----------
  async function checkSharedContent() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shared') !== '1') return;

    // URL을 정리해 새로고침 시 중복 처리되지 않도록 함
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    if (!('caches' in window)) return;
    try {
      const cache = await caches.open('md-viewer-share-v1');
      const response = await cache.match('shared-payload');
      if (!response) return;
      const data = await response.json();
      if (data && data.content) {
        setEditorContent(data.content, data.filename || '공유된 내용');
        setView('preview');
      }
      await cache.delete('shared-payload');
    } catch (err) {
      console.warn('공유된 콘텐츠를 불러오지 못했습니다.', err);
    }
  }

  // ---------- Init ----------
  function init() {
    let theme = null;
    let savedFont = null;
    let savedView = null;
    let draft = '';
    let savedFilename = '';

    try {
      theme = localStorage.getItem(LS_THEME);
      savedFont = Number(localStorage.getItem(LS_FONT_SIZE));
      savedView = localStorage.getItem(LS_VIEW);
      draft = localStorage.getItem(LS_DRAFT) || '';
      savedFilename = localStorage.getItem(LS_FILENAME) || '';
    } catch (_) {}

    applyTheme(theme);
    fontSize = applyFontSize(Number.isFinite(savedFont) && savedFont ? savedFont : DEFAULT_FONT);
    setView(savedView === 'preview' ? 'preview' : 'edit');

    if (draft) {
      currentFilename = savedFilename;
      filenameBadge.textContent = savedFilename;
      editor.value = draft;
      renderMarkdown(draft);
    } else {
      renderMarkdown('');
    }

    checkSharedContent();

    // 서비스 워커는 http(s)에서만 동작한다.
    // 단일 HTML 파일을 file://로 직접 열었을 때는 등록을 시도하지 않는다.
    const isHttp = /^https?:$/.test(window.location.protocol);
    if (isHttp && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
          console.warn('서비스 워커 등록 실패:', err);
        });
      });
    }
  }

  init();
})();
