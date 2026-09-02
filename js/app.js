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
  const toastEl = $('toast');
  const ttsBar = $('tts-bar');
  const ttsLabel = $('tts-label');
  const btnTtsToggle = $('btn-tts-toggle');
  const btnTtsRepeat = $('btn-tts-repeat');
  const btnReadAll = $('btn-read-all');
  const ttsRateField = $('tts-rate-field');
  const ttsRateSeg = $('tts-rate-seg');

  // ---------------- 저장소 키 ----------------
  const K_DOC = 'md-viewer-draft';
  const K_NAME = 'md-viewer-filename';
  const K_THEME = 'md-viewer-theme';
  const K_FONT = 'md-viewer-font-size';
  const K_RATE = 'md-viewer-tts-rate';
  const K_REPEAT = 'md-viewer-tts-repeat';

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

  // 짧은 안내. 저장처럼 결과가 눈에 안 보이는 동작에 쓴다.
  let toastTimer = null;
  function toast(message, isError) {
    toastEl.textContent = message;
    toastEl.classList.toggle('error', !!isError);
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('visible'));

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('visible');
      setTimeout(() => {
        if (!toastEl.classList.contains('visible')) toastEl.hidden = true;
      }, 220);
    }, 2600);
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
  // 데스크탑 앱(Electron)으로 실행 중이면 브라우저 파일 입력 대신
  // 운영체제 기본 파일 대화상자를 쓴다.
  const desktop = window.mdViewerDesktop || null;

  function pickFile() {
    closeOverlays();
    if (desktop) {
      desktop.openFileDialog();
      return;
    }
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

  function saveName() {
    return filename && /\.\w+$/.test(filename) ? filename : 'document.md';
  }

  // 저장은 환경마다 되는 방법이 다르다.
  //  - 데스크탑 앱: 앱이 네이티브 저장 대화상자로 직접 파일을 쓴다
  //  - 모바일: 공유 시트로 내보낸다 (file:// 에서는 다운로드가 막히는 경우가 많다)
  //  - PC 브라우저: 일반 다운로드
  // 어느 쪽이든 결과를 토스트로 알려서 "눌러도 아무 일이 없는" 상황을 없앤다.
  async function saveDocument() {
    closeOverlays();

    if (!content.trim()) {
      toast('저장할 내용이 없습니다.', true);
      return;
    }

    const name = saveName();

    // 1) 데스크탑 앱
    if (desktop && typeof desktop.saveFile === 'function') {
      try {
        const res = await desktop.saveFile({ name, content });
        if (res && res.ok) toast('저장했습니다.');
        else if (!res || !res.canceled) toast('저장하지 못했습니다.' + (res && res.error ? ` (${res.error})` : ''), true);
      } catch (err) {
        toast('저장하지 못했습니다.', true);
      }
      return;
    }

    // 2) 모바일: 공유 시트로 파일 내보내기
    //    await 이전에 호출해야 사용자 제스처가 유지된다.
    const file = new File([content], name, { type: 'text/markdown' });
    let canShareFile = false;
    try {
      canShareFile = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    } catch (_) {
      canShareFile = false;
    }

    if (canShareFile) {
      try {
        await navigator.share({ files: [file], title: name });
        return; // 공유 시트에서 사용자가 처리
      } catch (err) {
        // 사용자가 취소한 경우는 조용히 끝낸다
        if (err && err.name === 'AbortError') return;
        // 공유가 실패하면 아래 다운로드로 넘어간다
      }
    }

    // 3) PC 브라우저: 일반 다운로드
    try {
      const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`${name} 으로 내려받았습니다.`);
    } catch (err) {
      toast('저장하지 못했습니다.', true);
    }
  }

  $('btn-save').addEventListener('click', saveDocument);

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
  let ttsRepeat = false; // 회화 섀도잉 연습용: 켜두면 재생이 끝날 때마다 같은 내용을 다시 읽는다
  let repeatTimer = null;
  let playToken = 0; // 재생을 새로 시작할 때마다 증가시켜, 이전 재생의 지연된 onend/onerror가
  // 방금 시작한 새 재생에 잘못 간섭(재생바를 끄거나 반복을 거는 등)하지 않도록 막는다

  const KOREAN_RE = /[가-힣ᄀ-ᇿ㄰-㆏]/;
  const LATIN_RE = /[A-Za-z]/;

  function pickVoiceByLang(prefix) {
    if (!synth) return null;
    const voices = synth.getVoices();
    if (!voices.length) return null;
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(prefix)) || null;
  }

  // 한/영이 섞인 문장을 한 음성으로 통째로 읽으면 "한국인이 영어 읽는" 어색한
  // 발음이 난다. 한글 구간과 영문 구간을 나눠 각각 맞는 언어로 읽게 한다.
  // 공백/숫자/기호 같은 중립 문자는 방금 전 구간에 그대로 붙여서, 스크립트가
  // 실제로 바뀌는 경계에서만 문장을 쪼갠다.
  function segmentByScript(text) {
    const segments = [];
    let cur = '';
    let curLang = null; // 'ko' | 'en' | null(아직 정해지지 않음)

    for (const ch of text) {
      const chLang = KOREAN_RE.test(ch) ? 'ko' : LATIN_RE.test(ch) ? 'en' : null;
      if (chLang === null || curLang === null || chLang === curLang) {
        cur += ch;
        if (chLang !== null) curLang = chLang;
      } else {
        segments.push({ text: cur, lang: curLang });
        cur = ch;
        curLang = chLang;
      }
    }
    if (cur.trim()) segments.push({ text: cur, lang: curLang || 'en' });
    return segments.filter((s) => s.text.trim());
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
      // 이 사이 새로운 재생이 시작돼 바가 다시 보이는 중이면 건드리지 않는다
      if (!ttsBar.classList.contains('visible')) ttsBar.hidden = true;
    }, 240);
    if (activeBlockBtn) {
      activeBlockBtn.classList.remove('playing');
      activeBlockBtn = null;
    }
  }

  function speakText(text, label) {
    if (!synth || !text || !text.trim()) return;
    clearTimeout(repeatTimer);
    synth.cancel();
    const myToken = ++playToken;

    const trimmed = text.trim();
    const hasKorean = KOREAN_RE.test(trimmed);
    const hasLatin = LATIN_RE.test(trimmed);
    // 한/영이 둘 다 섞여 있을 때만 굳이 쪼갠다. 한쪽 언어뿐이면 통짜로 읽는 게
    // 더 자연스럽고(불필요한 끊김이 없다), 어차피 발음도 문제 없다.
    const segments =
      hasKorean && hasLatin ? segmentByScript(trimmed) : [{ text: trimmed, lang: hasKorean ? 'ko' : 'en' }];

    const koVoice = pickVoiceByLang('ko');
    const enVoice = pickVoiceByLang('en');

    segments.forEach((seg, i) => {
      const utter = new SpeechSynthesisUtterance(seg.text);
      utter.rate = ttsRate;
      if (seg.lang === 'ko') {
        utter.lang = 'ko-KR';
        if (koVoice) utter.voice = koVoice;
      } else {
        utter.lang = 'en-US';
        if (enVoice) utter.voice = enVoice;
      }
      // 여러 조각을 이어 speak() 하면 브라우저가 순서대로 재생 큐에 쌓아준다.
      // 마지막 조각이 끝나야 진짜로 다 읽은 것이므로 종료 처리는 거기에만 건다.
      if (i === segments.length - 1) {
        utter.onend = () => {
          if (myToken !== playToken) return; // 이미 다른 재생으로 대체됨 — 무시
          if (ttsRepeat) {
            // 바로 다시 읽기 시작하면 문장 사이 구분이 안 되니 살짝 쉬었다 반복한다
            repeatTimer = setTimeout(() => speakText(text, label), 550);
          } else {
            hideBar();
          }
        };
        utter.onerror = () => {
          if (myToken !== playToken) return;
          hideBar();
        };
      }
      synth.speak(utter);
    });

    showBar(label);
  }

  function stopSpeaking() {
    clearTimeout(repeatTimer);
    playToken++; // 지금 재생 중인 발화의 onend/onerror 를 전부 무효화
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

  function applyTtsRepeat(on) {
    ttsRepeat = on;
    btnTtsRepeat.classList.toggle('active', on);
    btnTtsRepeat.setAttribute('aria-pressed', String(on));
    store.set(K_REPEAT, on ? '1' : '0');
  }

  btnTtsRepeat.addEventListener('click', () => applyTtsRepeat(!ttsRepeat));

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

    if (ttsSupported) {
      const savedRate = parseFloat(store.get(K_RATE));
      ttsRate = savedRate > 0 ? savedRate : 1;
      ttsRateSeg
        .querySelectorAll('button')
        .forEach((b) => b.classList.toggle('active', parseFloat(b.dataset.rate) === ttsRate));
      applyTtsRepeat(store.get(K_REPEAT) === '1');
    }

    // 네이티브 앱이 연 파일을 웹앱으로 넘기는 통로.
    // 데스크탑(Electron preload)과 안드로이드(MainActivity)가 모두 이걸 호출한다.
    window.__mdViewerOpenFile = (name, text) => {
      setContent(String(text == null ? '' : text), name || '');
      viewer.scrollTop = 0;
      showTopbar();
      closeOverlays();
    };

    if (desktop) {
      desktop.onOpenFile(({ name, content: text }) => window.__mdViewerOpenFile(name, text));
    }

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
