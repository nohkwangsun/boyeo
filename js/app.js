(() => {
  'use strict';

  // ---------------- 요소 ----------------
  const $ = (id) => document.getElementById(id);

  const topbar = $('topbar');
  const docTitle = $('doc-title');
  const viewer = $('viewer');
  const preview = $('preview');
  const empty = $('empty');
  const editor = $('editor');
  const editMode = $('edit-mode');
  const fileInput = $('file-input');
  const tocDrawer = $('toc-drawer');
  const tocList = $('toc-list');
  const menuSheet = $('menu-sheet');
  const scrim = $('scrim');
  const dropzone = $('dropzone');
  const fontValue = $('font-value');
  const themeSeg = $('theme-seg');
  const ttsBar = $('tts-bar');
  const ttsLabel = $('tts-label');
  const btnTtsToggle = $('btn-tts-toggle');
  const btnReadAll = $('btn-read-all');
  const ttsRateField = $('tts-rate-field');
  const ttsRateSeg = $('tts-rate-seg');

  // ---------------- 저장소 키 ----------------
  const K_DOC = 'md-viewer-draft';
  const K_NAME = 'md-viewer-filename';
  const K_THEME = 'md-viewer-theme';
  const K_FONT = 'md-viewer-font-size';
  const K_RATE = 'md-viewer-tts-rate';

  const FONT_MIN = 14;
  const FONT_MAX = 26;
  const FONT_DEFAULT = 17;

  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (_) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (_) {}
    },
  };

  let content = '';
  let filename = '';
  let fontSize = FONT_DEFAULT;

  // ---------------- 렌더링 ----------------
  if (window.marked) {
    marked.setOptions({ gfm: true, breaks: true });
  }

  function render() {
    const hasContent = content.trim().length > 0;
    empty.hidden = hasContent;
    preview.hidden = !hasContent;

    if (!hasContent) {
      preview.innerHTML = '';
      tocList.innerHTML = '';
      docTitle.textContent = '마크다운 뷰어';
      return;
    }

    let html;
    try {
      html = window.marked ? marked.parse(content) : escapeHtml(content);
    } catch (err) {
      html = `<p>렌더링 오류: ${escapeHtml(String(err))}</p>`;
    }

    preview.innerHTML = window.DOMPurify
      ? DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
      : html;

    preview.querySelectorAll('a[href]').forEach((a) => {
      if (/^https?:\/\//i.test(a.getAttribute('href') || '')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
    preview.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));

    buildToc();
    addBlockControls();
    updateTitle();
  }

  function escapeHtml(str) {
    const el = document.createElement('div');
    el.textContent = str;
    return el.innerHTML;
  }

  // 상단바에는 파일명을, 없으면 문서의 첫 제목을 보여준다.
  function updateTitle() {
    if (filename) {
      docTitle.textContent = filename;
      return;
    }
    const first = preview.querySelector('h1, h2, h3');
    docTitle.textContent = first ? first.textContent.trim() : '마크다운 뷰어';
  }

  function setContent(text, name) {
    stopSpeaking(); // 문서가 바뀌면 읽던 내용도 더는 유효하지 않다
    content = text || '';
    if (name !== undefined) {
      filename = name;
      store.set(K_NAME, name);
    }
    editor.value = content;
    store.set(K_DOC, content);
    render();
  }

  // ---------------- 목차 ----------------
  function buildToc() {
    const headings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
    tocList.innerHTML = '';

    if (!headings.length) {
      tocList.innerHTML = '<p class="toc-empty">제목이 없는 문서입니다.</p>';
      return;
    }

    const used = new Map();
    const frag = document.createDocumentFragment();

    headings.forEach((heading) => {
      const text = (heading.textContent || '').trim();
      const base =
        text
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]/gu, '')
          .replace(/\s+/g, '-') || 'section';
      const seen = used.get(base) || 0;
      used.set(base, seen + 1);
      heading.id = seen === 0 ? base : `${base}-${seen}`;

      const level = Number(heading.tagName[1]);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'toc-item';
      item.dataset.level = String(level);
      item.style.paddingLeft = `${18 + (level - 1) * 13}px`;
      item.textContent = text;
      item.addEventListener('click', () => {
        closeOverlays();
        showTopbar();
        requestAnimationFrame(() => heading.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      });
      frag.appendChild(item);
    });

    tocList.appendChild(frag);
  }

  // ---------------- 오버레이(목차/메뉴) ----------------
  function openToc() {
    closeSheet();
    tocDrawer.classList.add('open');
    tocDrawer.setAttribute('aria-hidden', 'false');
    scrim.classList.add('open');
  }

  function closeToc() {
    tocDrawer.classList.remove('open');
    tocDrawer.setAttribute('aria-hidden', 'true');
  }

  function openSheet() {
    closeToc();
    menuSheet.classList.add('open');
    menuSheet.setAttribute('aria-hidden', 'false');
    scrim.classList.add('open');
  }

  function closeSheet() {
    menuSheet.classList.remove('open');
    menuSheet.setAttribute('aria-hidden', 'true');
  }

  function closeOverlays() {
    closeToc();
    closeSheet();
    scrim.classList.remove('open');
  }

  $('btn-toc').addEventListener('click', openToc);
  $('btn-toc-close').addEventListener('click', closeOverlays);
  $('btn-menu').addEventListener('click', openSheet);
  scrim.addEventListener('click', closeOverlays);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlays();
  });

  // ---------------- 편집 모드 ----------------
  function openEditor() {
    closeOverlays();
    stopSpeaking();
    editor.value = content;
    editMode.hidden = false;
    requestAnimationFrame(() => editor.focus());
  }

  function closeEditor() {
    content = editor.value;
    store.set(K_DOC, content);
    // 파일명은 유지하되, 내용이 바뀌었으므로 제목을 다시 계산한다
    render();
    editMode.hidden = true;
    showTopbar();
  }

  $('btn-edit').addEventListener('click', openEditor);
  $('btn-write').addEventListener('click', openEditor);
  $('btn-edit-done').addEventListener('click', closeEditor);
  $('btn-edit-back').addEventListener('click', closeEditor);

  let editSaveTimer = null;
  editor.addEventListener('input', () => {
    clearTimeout(editSaveTimer);
    editSaveTimer = setTimeout(() => store.set(K_DOC, editor.value), 400);
  });

  // ---------------- 파일 열기 / 저장 ----------------
  function pickFile() {
    closeOverlays();
    fileInput.click();
  }

  $('btn-open').addEventListener('click', pickFile);
  $('btn-open-primary').addEventListener('click', pickFile);

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) readFile(file);
    fileInput.value = '';
  });

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result || ''), file.name);
      viewer.scrollTop = 0;
      showTopbar();
    };
    reader.onerror = () => alert('파일을 읽지 못했습니다.');
    reader.readAsText(file);
  }

  $('btn-save').addEventListener('click', () => {
    closeOverlays();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename && /\.\w+$/.test(filename) ? filename : 'document.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $('btn-clear').addEventListener('click', () => {
    closeOverlays();
    if (content.trim() && !confirm('현재 문서를 비울까요?')) return;
    setContent('', '');
  });

  // 드래그 앤 드롭(데스크톱)
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dropzone.classList.add('active');
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropzone.classList.remove('active');
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove('active');
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  });

  // ---------------- 글자 크기 ----------------
  function applyFont(size) {
    fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, size));
    document.documentElement.style.setProperty('--content-font-size', `${fontSize}px`);
    fontValue.textContent = String(fontSize);
    store.set(K_FONT, String(fontSize));
  }

  $('btn-font-minus').addEventListener('click', () => applyFont(fontSize - 1));
  $('btn-font-plus').addEventListener('click', () => applyFont(fontSize + 1));

  // ---------------- 테마 ----------------
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      theme = 'auto';
      document.documentElement.removeAttribute('data-theme');
    }

    themeSeg.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });

    const dark = theme === 'dark' || (theme === 'auto' && darkQuery.matches);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#16181d' : '#ffffff');

    store.set(K_THEME, theme);
  }

  themeSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-theme]');
    if (btn) applyTheme(btn.dataset.theme);
  });

  darkQuery.addEventListener('change', () => {
    if ((store.get(K_THEME) || 'auto') === 'auto') applyTheme('auto');
  });

  // ---------------- 상단바 자동 숨김 ----------------
  let lastScroll = 0;
  let ticking = false;

  function showTopbar() {
    topbar.classList.remove('hidden');
  }

  viewer.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = viewer.scrollTop;
        topbar.classList.toggle('scrolled', y > 4);

        // 아래로 충분히 내려간 뒤에만 숨기고, 위로 올리면 즉시 되돌린다
        if (y > 72 && y > lastScroll + 6) {
          topbar.classList.add('hidden');
        } else if (y < lastScroll - 6 || y <= 72) {
          showTopbar();
        }

        lastScroll = y;
        ticking = false;
      });
    },
    { passive: true }
  );

  // ---------------- 읽어주기 (TTS) ----------------
  const ttsSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const synth = ttsSupported ? window.speechSynthesis : null;

  let ttsRate = 1;

  // 한국어 문자가 섞여 있으면 한국어 음성/언어를 우선 지정한다.
  const KOREAN_RE = /[가-힣ᄀ-ᇿ㄰-㆏]/;

  function pickVoice(text) {
    if (!synth) return null;
    const voices = synth.getVoices();
    if (!voices.length) return null;
    if (KOREAN_RE.test(text)) {
      return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ko')) || null;
    }
    return null;
  }

  function showBar(label) {
    ttsLabel.textContent = label;
    ttsBar.hidden = false;
    requestAnimationFrame(() => ttsBar.classList.add('visible'));
    ttsBar.classList.remove('paused');
    btnTtsToggle.setAttribute('aria-label', '일시정지');
    btnTtsToggle.innerHTML = '<svg class="icon icon-fill"><use href="#i-pause" /></svg>';
  }

  function hideBar() {
    ttsBar.classList.remove('visible');
    setTimeout(() => {
      ttsBar.hidden = true;
    }, 240);
    if (activeBlockBtn) {
      activeBlockBtn.classList.remove('playing');
      activeBlockBtn = null;
    }
  }

  function speakText(text, label) {
    if (!synth || !text || !text.trim()) return;
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text.trim());
    utter.rate = ttsRate;
    if (KOREAN_RE.test(text)) utter.lang = 'ko-KR';
    const voice = pickVoice(text);
    if (voice) utter.voice = voice;

    utter.onend = hideBar;
    utter.onerror = hideBar;

    showBar(label);
    synth.speak(utter);
  }

  function stopSpeaking() {
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
    if (!ttsBar.hidden) hideBar();
  }

  btnTtsToggle.addEventListener('click', () => {
    if (!synth) return;
    if (synth.paused) {
      synth.resume();
      ttsBar.classList.remove('paused');
      btnTtsToggle.setAttribute('aria-label', '일시정지');
      btnTtsToggle.innerHTML = '<svg class="icon icon-fill"><use href="#i-pause" /></svg>';
    } else if (synth.speaking) {
      synth.pause();
      ttsBar.classList.add('paused');
      btnTtsToggle.setAttribute('aria-label', '재생');
      btnTtsToggle.innerHTML = '<svg class="icon icon-fill"><use href="#i-play" /></svg>';
    }
  });

  $('btn-tts-stop').addEventListener('click', stopSpeaking);

  btnReadAll.addEventListener('click', () => {
    closeOverlays();
    speakText(preview.innerText, '문서 전체 읽는 중…');
  });

  ttsRateSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-rate]');
    if (!btn) return;
    ttsRate = parseFloat(btn.dataset.rate) || 1;
    store.set(K_RATE, String(ttsRate));
    ttsRateSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  });

  if (ttsSupported) {
    btnReadAll.hidden = false;
    ttsRateField.hidden = false;
  }

  // ---- 블록별 듣기 버튼 ----
  // render() 가 preview.innerHTML 을 새로 채울 때마다 다시 호출된다.
  // 각 최상위 블록(문단/제목/목록/인용/코드블록/표...)을 .block-wrap 으로
  // 감싸고, 오른쪽 여백에 그 블록만 읽어주는 버튼을 붙인다.
  // (table/ul/ol 내부엔 button 을 직접 넣을 수 없어 바깥을 감싸는 방식을 쓴다.)
  let activeBlockBtn = null;

  function addBlockControls() {
    if (!ttsSupported) return;

    Array.from(preview.children).forEach((el) => {
      if (el.tagName === 'HR') return;
      const text = (el.innerText || el.textContent || '').trim();
      if (!text) return;

      const wrap = document.createElement('div');
      wrap.className = 'block-wrap';
      el.replaceWith(wrap);
      wrap.appendChild(el);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'block-tts';
      btn.setAttribute('aria-label', '이 부분 듣기');
      btn.innerHTML = '<svg class="icon"><use href="#i-speaker" /></svg>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeBlockBtn && activeBlockBtn !== btn) activeBlockBtn.classList.remove('playing');
        activeBlockBtn = btn;
        btn.classList.add('playing');
        speakText(text, '이 부분 읽는 중…');
      });
      wrap.appendChild(btn);
    });
  }

  // ---------------- 공유로 받기(Web Share Target) ----------------
  async function pickUpSharedContent() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shared') !== '1') return;

    window.history.replaceState({}, '', window.location.pathname);
    if (!('caches' in window)) return;

    try {
      const cache = await caches.open('md-viewer-share-v1');
      const res = await cache.match('shared-payload');
      if (!res) return;
      const data = await res.json();
      if (data && data.content) {
        setContent(data.content, data.filename || '');
        viewer.scrollTop = 0;
      }
      await cache.delete('shared-payload');
    } catch (err) {
      console.warn('공유된 콘텐츠를 불러오지 못했습니다.', err);
    }
  }

  // ---------------- 초기화 ----------------
  function init() {
    applyTheme(store.get(K_THEME) || 'auto');

    const savedFont = Number(store.get(K_FONT));
    applyFont(Number.isFinite(savedFont) && savedFont ? savedFont : FONT_DEFAULT);

    filename = store.get(K_NAME) || '';
    content = store.get(K_DOC) || '';
    editor.value = content;
    render();

    pickUpSharedContent();

    // 서비스 워커는 http(s)에서만 동작한다.
    // 단일 HTML 파일을 file:// 로 직접 열었을 때는 등록을 시도하지 않는다.
    if (/^https?:$/.test(window.location.protocol) && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        // updateViaCache: 'none' → sw.js 자체를 브라우저 HTTP 캐시에 기대지 않고
        // 매번 네트워크로 새로 확인한다. (이게 없으면 배포를 갱신해도
        // 새 서비스 워커를 한동안 못 알아챌 수 있다.)
        navigator.serviceWorker
          .register('sw.js', { updateViaCache: 'none' })
          .then((reg) => reg.update().catch(() => {}))
          .catch((err) => console.warn('서비스 워커 등록 실패:', err));
      });

      // 새 서비스 워커가 활성화되면(=새 배포가 반영되면) 화면을 한 번 새로고침해
      // 사용자가 직접 캐시를 지우지 않아도 최신 버전이 보이게 한다.
      let refreshedOnce = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshedOnce) return;
        refreshedOnce = true;
        window.location.reload();
      });
    }
  }

  init();
})();
