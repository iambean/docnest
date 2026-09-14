(function() {
  'use strict';

  var MAX_RESULTS = 12;
  var SNIPPET_LENGTH = 160;
  var SEARCH_INDEX_PATH = '/search-index.json';
  var state = {
    index: null,
    indexPromise: null,
    modal: null,
    trigger: null,
    lastFocus: null,
    results: [],
    selectedIndex: -1,
  };

  function getAssetUrl(path) {
    var base = document.querySelector('base');
    if (base && base.getAttribute('href')) {
      return base.getAttribute('href').replace(/\/?$/, '/') + path.replace(/^\//, '');
    }
    return path;
  }

  function isStaticSite() {
    return document.documentElement.getAttribute('data-docnest-static') === 'true';
  }

  function normalizeText(value) {
    var text = String(value || '');
    if (typeof text.normalize === 'function') text = text.normalize('NFKC');
    return text.trim().toLocaleLowerCase();
  }

  function getQueryTerms(query) {
    return normalizeText(query).split(/\s+/).filter(function(term) { return term; });
  }

  function countOccurrences(text, term) {
    var count = 0;
    var offset = 0;
    while (offset < text.length) {
      var found = text.indexOf(term, offset);
      if (found === -1) break;
      count += 1;
      offset = found + Math.max(term.length, 1);
    }
    return count;
  }

  function getDocumentFields(document) {
    var title = normalizeText(document.title);
    var directory = normalizeText(document.directory);
    var path = normalizeText(document.path);
    var headings = normalizeText(Array.isArray(document.headings) ? document.headings.join(' ') : '');
    var text = normalizeText(document.text);
    return {
      title: title,
      directory: directory,
      path: path,
      headings: headings,
      text: text,
      all: [title, directory, path, headings, text].join('\n'),
    };
  }

  function scoreDocument(document, query, terms) {
    var fields = getDocumentFields(document);
    for (var i = 0; i < terms.length; i += 1) {
      if (!fields.all.includes(terms[i])) return null;
    }

    var score = 0;
    terms.forEach(function(term) {
      if (fields.title.includes(term)) score += 120;
      if (fields.headings.includes(term)) score += 70;
      if (fields.directory.includes(term)) score += 40;
      if (fields.path.includes(term)) score += 30;
      score += Math.min(countOccurrences(fields.text, term), 8) * 4;
    });

    var phrase = normalizeText(query);
    if (phrase.length > 1 && fields.all.includes(phrase)) score += 60;
    return score;
  }

  function searchDocuments(query) {
    var terms = getQueryTerms(query);
    if (!state.index || terms.length === 0) return [];

    return state.index.map(function(document, index) {
      return {
        document: document,
        index: index,
        score: scoreDocument(document, query, terms),
      };
    }).filter(function(result) {
      return result.score !== null;
    }).sort(function(left, right) {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    });
  }

  function getSnippet(document, terms) {
    var text = String(document.text || '').replace(/\s+/g, ' ').trim();
    if (!text) text = String((document.headings || []).join(' ')).trim();
    if (!text) return '';

    var normalized = normalizeText(text);
    var matchIndex = -1;
    terms.forEach(function(term) {
      var index = normalized.indexOf(term);
      if (index !== -1 && (matchIndex === -1 || index < matchIndex)) matchIndex = index;
    });

    if (matchIndex === -1) matchIndex = 0;
    var start = Math.max(0, matchIndex - 54);
    var end = Math.min(text.length, start + SNIPPET_LENGTH);
    if (end - start < SNIPPET_LENGTH && start > 0) {
      start = Math.max(0, end - SNIPPET_LENGTH);
    }
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function appendHighlightedText(container, text, terms) {
    var value = String(text || '');
    var uniqueTerms = Array.from(new Set(terms.filter(function(term) { return term; })))
      .sort(function(left, right) { return right.length - left.length; });
    if (uniqueTerms.length === 0) {
      container.appendChild(document.createTextNode(value));
      return;
    }

    var pattern = new RegExp('(' + uniqueTerms.map(escapeRegExp).join('|') + ')', 'gi');
    var cursor = 0;
    value.replace(pattern, function(match, ignored, offset) {
      if (offset > cursor) container.appendChild(document.createTextNode(value.slice(cursor, offset)));
      var mark = document.createElement('mark');
      mark.textContent = match;
      container.appendChild(mark);
      cursor = offset + match.length;
      return match;
    });
    if (cursor < value.length) container.appendChild(document.createTextNode(value.slice(cursor)));
  }

  function encodeDocumentPath(documentPath) {
    return String(documentPath || '').split('/').map(function(segment) {
      return encodeURIComponent(segment);
    }).join('/');
  }

  function buildDocumentUrl(documentPath) {
    var normalizedPath = String(documentPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (isStaticSite()) {
      var staticPath = normalizedPath.replace(/\.(md|markdown)$/i, '.html');
      return getAssetUrl('/doc/' + encodeDocumentPath(staticPath));
    }
    return getAssetUrl('/doc?path=' + encodeURIComponent(normalizedPath));
  }

  function setStatus(message) {
    if (state.modal && state.modal.status) state.modal.status.textContent = message;
  }

  function createEmptyState(message) {
    var empty = document.createElement('div');
    empty.className = 'doc-search-empty';
    empty.textContent = message;
    return empty;
  }

  function setSelectedIndex(index) {
    if (!state.modal || state.results.length === 0) {
      state.selectedIndex = -1;
      return;
    }
    state.selectedIndex = Math.max(0, Math.min(index, state.results.length - 1));
    var options = state.modal.results.querySelectorAll('.doc-search-result');
    options.forEach(function(option, optionIndex) {
      var selected = optionIndex === state.selectedIndex;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', String(selected));
    });
    var selectedOption = options[state.selectedIndex];
    if (selectedOption) {
      state.modal.input.setAttribute('aria-activedescendant', selectedOption.id);
      selectedOption.scrollIntoView({ block: 'nearest' });
    }
  }

  function createResult(result, resultIndex, terms) {
    var documentData = result.document;
    var option = document.createElement('a');
    option.className = 'doc-search-result';
    option.id = 'doc-search-result-' + resultIndex;
    option.href = buildDocumentUrl(documentData.path);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');

    var title = document.createElement('div');
    title.className = 'doc-search-result__title';
    appendHighlightedText(title, documentData.title || documentData.path, terms);

    var pathLabel = document.createElement('div');
    pathLabel.className = 'doc-search-result__path';
    appendHighlightedText(pathLabel, documentData.path, terms);

    var snippet = document.createElement('p');
    snippet.className = 'doc-search-result__snippet';
    appendHighlightedText(snippet, getSnippet(documentData, terms), terms);

    var arrow = document.createElement('span');
    arrow.className = 'doc-search-result__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';

    option.appendChild(title);
    option.appendChild(pathLabel);
    if (snippet.textContent) option.appendChild(snippet);
    option.appendChild(arrow);
    option.addEventListener('mouseenter', function() { setSelectedIndex(resultIndex); });
    option.addEventListener('click', function(event) {
      event.preventDefault();
      closeSearch();
      var url = buildDocumentUrl(documentData.path);
      if (!isStaticSite() && typeof window.navigateToDoc === 'function') {
        window.navigateToDoc(url);
      } else {
        window.location.href = url;
      }
    });
    return option;
  }

  function renderResults() {
    if (!state.modal) return;
    var query = state.modal.input.value.trim();
    state.modal.results.textContent = '';
    state.results = [];
    state.selectedIndex = -1;

    if (!query) {
      setStatus('输入标题、目录或正文关键词');
      state.modal.results.appendChild(createEmptyState('支持中文关键词、英文词组和文档路径搜索'));
      return;
    }

    var terms = getQueryTerms(query);
    var matches = searchDocuments(query);
    if (matches.length === 0) {
      setStatus('没有找到匹配的文档');
      state.modal.results.appendChild(createEmptyState('换个关键词试试，或检查目录名称是否完整'));
      return;
    }

    state.results = matches.slice(0, MAX_RESULTS);
    setStatus(matches.length > MAX_RESULTS
      ? '找到 ' + matches.length + ' 篇文档，显示最相关的 ' + MAX_RESULTS + ' 篇'
      : '找到 ' + matches.length + ' 篇文档');
    state.results.forEach(function(result, index) {
      state.modal.results.appendChild(createResult(result, index, terms));
    });
    setSelectedIndex(0);
  }

  function createModal() {
    var overlay = document.createElement('div');
    overlay.className = 'doc-search-modal';
    overlay.id = 'doc-search-modal';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="doc-search-modal__panel" role="dialog" aria-modal="true" aria-labelledby="doc-search-title" aria-describedby="doc-search-status">',
        '<div class="doc-search-modal__topline">',
          '<span class="doc-search-modal__eyebrow" id="doc-search-title">搜索文档</span>',
          '<button type="button" class="doc-search-modal__close" aria-label="关闭搜索">×</button>',
        '</div>',
        '<div class="doc-search-input-wrap">',
          '<span class="doc-search-input-icon" aria-hidden="true">⌕</span>',
          '<input class="doc-search-input" type="search" autocomplete="off" spellcheck="false" placeholder="搜索标题、目录、正文或路径" aria-label="搜索文档" aria-controls="doc-search-results">',
          '<kbd class="doc-search-input-key">Esc</kbd>',
        '</div>',
        '<div class="doc-search-status" id="doc-search-status" role="status" aria-live="polite"></div>',
        '<div class="doc-search-results" id="doc-search-results" role="listbox" aria-label="搜索结果"></div>',
        '<div class="doc-search-hint"><span>↑↓ 选择</span><span>Enter 打开</span><span>Esc 关闭</span></div>',
      '</div>',
    ].join('');

    var modal = {
      overlay: overlay,
      input: overlay.querySelector('.doc-search-input'),
      status: overlay.querySelector('.doc-search-status'),
      results: overlay.querySelector('.doc-search-results'),
      close: overlay.querySelector('.doc-search-modal__close'),
    };
    modal.input.addEventListener('input', renderResults);
    modal.close.addEventListener('click', closeSearch);
    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) closeSearch();
    });
    document.body.appendChild(overlay);
    state.modal = modal;
    return modal;
  }

  function loadSearchIndex() {
    if (state.index) return Promise.resolve(state.index);
    if (state.indexPromise) return state.indexPromise;

    state.indexPromise = fetch(getAssetUrl(SEARCH_INDEX_PATH), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(function(response) {
      if (!response.ok) throw new Error('搜索索引请求失败：' + response.status);
      return response.json();
    }).then(function(payload) {
      if (!payload || !Array.isArray(payload.documents)) {
        throw new Error('搜索索引格式无效');
      }
      state.index = payload.documents.filter(function(documentData) {
        return documentData && typeof documentData.path === 'string';
      });
      return state.index;
    }).catch(function(error) {
      state.indexPromise = null;
      throw error;
    });
    return state.indexPromise;
  }

  function openSearch() {
    if (!state.modal) createModal();
    state.lastFocus = document.activeElement;
    state.modal.overlay.hidden = false;
    state.modal.overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('doc-search-open');
    state.modal.input.disabled = true;
    state.modal.input.value = '';
    state.modal.results.textContent = '';
    setStatus('正在加载文档索引…');
    window.requestAnimationFrame(function() { state.modal.input.focus(); });

    loadSearchIndex().then(function() {
      if (state.modal.overlay.hidden) return;
      state.modal.input.disabled = false;
      renderResults();
      state.modal.input.focus();
    }).catch(function() {
      if (state.modal.overlay.hidden) return;
      state.modal.input.disabled = true;
      setStatus('搜索索引加载失败，请刷新页面后重试');
      state.modal.results.appendChild(createEmptyState('当前无法读取文档索引'));
    });
  }

  function closeSearch() {
    if (!state.modal || state.modal.overlay.hidden) return;
    state.modal.overlay.hidden = true;
    state.modal.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('doc-search-open');
    if (state.lastFocus && typeof state.lastFocus.focus === 'function') state.lastFocus.focus();
  }

  function moveSelection(delta) {
    if (!state.results.length) return;
    setSelectedIndex(state.selectedIndex + delta);
  }

  function onKeyDown(event) {
    if (event.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
      return;
    }
    if (!state.modal || state.modal.overlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === 'Enter' && state.selectedIndex >= 0 && state.results[state.selectedIndex]) {
      event.preventDefault();
      var selected = state.results[state.selectedIndex].document;
      closeSearch();
      var url = buildDocumentUrl(selected.path);
      if (!isStaticSite() && typeof window.navigateToDoc === 'function') {
        window.navigateToDoc(url);
      } else {
        window.location.href = url;
      }
    }
  }

  function init() {
    var config = window.DOCNEST_CONFIG || {};
    if (config.restrictedMode === true) return;
    var trigger = document.getElementById('doc-search-trigger');
    if (!trigger) return;

    state.trigger = trigger;
    trigger.addEventListener('click', openSearch);
    var shortcut = trigger.querySelector('.doc-search-shortcut');
    var isMac = /Mac|iPhone|iPad|iPod/i.test((window.navigator && window.navigator.platform) || '');
    if (shortcut) shortcut.textContent = isMac ? '⌘ K' : 'Ctrl K';
    document.addEventListener('keydown', onKeyDown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
