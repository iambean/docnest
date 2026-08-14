/**
 * 文档页 SPA 式导航：点击文档链接时通过 fetch 局部更新内容，避免整页重载。
 * 效果：无页面闪烁、无卡顿，Socket 保持连接（不再出现断开+连接）。
 */
(function() {
  var article = null;
  var treeNav = null;
  var inFlight = false;

  function pathNorm(p) {
    return (p || '').trim().replace(/\.(html|md)$/i, '').replace(/\\/g, '/');
  }

  function buildBreadcrumbsFromPath(docPath) {
    var crumbs = [];
    var normalizedPath = (docPath || '').replace(/\\/g, '/');
    var parts = normalizedPath.split('/').filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      var isLast = i === parts.length - 1;
      var isLastFile = isLast && /\.md$/i.test(parts[i]);
      var displayName = isLastFile ? parts[i].replace(/\.md$/i, '') : parts[i];
      if (isLast) {
        crumbs.push({ name: displayName, isLast: true, url: '' });
      } else {
        var dirPath = parts.slice(0, i + 1).join('/');
        crumbs.push({ name: displayName, isLast: false, url: '/doc?path=' + encodeURIComponent(dirPath + '/README.md') });
      }
    }
    return crumbs;
  }

  function renderBreadcrumbs(crumbs) {
    var bc = document.querySelector('.breadcrumbs');
    if (!bc) return;
    var html = '<ol>';
    html += '<li class="breadcrumb-item"><a href="/" class="breadcrumb-link">首页</a></li>';
    for (var i = 0; i < crumbs.length; i++) {
      var c = crumbs[i];
      html += '<li class="breadcrumb-separator" aria-hidden="true">/</li>';
      if (c.isLast) {
        html += '<li class="breadcrumb-item breadcrumb-current" aria-current="page">' + escapeHtml(c.name) + '</li>';
      } else if (c.url) {
        html += '<li class="breadcrumb-item"><a href="' + c.url + '" class="breadcrumb-link">' + escapeHtml(c.name) + '</a></li>';
      } else {
        html += '<li class="breadcrumb-item breadcrumb-current">' + escapeHtml(c.name) + '</li>';
      }
    }
    html += '</ol>';
    bc.innerHTML = html;
  }

  function escapeHtml(text) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
  }

  function updateBreadcrumbs(docPath) {
    var crumbs = buildBreadcrumbsFromPath(docPath);
    renderBreadcrumbs(crumbs);
  }

  function pathFromHref(href) {
    if (!href) return '';
    try {
      var u = new URL(href, document.baseURI || window.location.href);
      if (u.searchParams.has('path')) return u.searchParams.get('path') || '';
      var idx = u.pathname.indexOf('/doc/');
      if (idx !== -1) return u.pathname.slice(idx + 5).replace(/\.html$/i, '');
    } catch (e) {}
    return '';
  }

  function showNavError(message) {
    console.warn('[doc-nav] ' + message);
    var id = 'doc-nav-error-toast';
    var old = document.getElementById(id);
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var toast = document.createElement('div');
    toast.id = id;
    toast.textContent = message;
    toast.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:16px',
      'padding:10px 14px',
      'background:#dc2626',
      'color:#fff',
      'font-size:13px',
      'border-radius:6px',
      'z-index:10001',
      'box-shadow:0 4px 14px rgba(0,0,0,0.2)'
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(function() {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2200);
  }

  function resolveAbsoluteUrl(url) {
    return new URL(url, document.baseURI || window.location.href).href;
  }

  function resolveDocUrlFromPath(docPath) {
    var pathname = window.location.pathname || '';
    var prefix = '';
    var idx = pathname.indexOf('/doc/');
    if (idx >= 0) {
      prefix = pathname.slice(0, idx);
    } else {
      idx = pathname.indexOf('/doc');
      if (idx >= 0) {
        prefix = pathname.slice(0, idx);
      } else {
        var baseTag = document.querySelector('base');
        if (baseTag && baseTag.getAttribute('href')) {
          try {
            var baseUrl = new URL(baseTag.getAttribute('href'), window.location.origin);
            prefix = (baseUrl.pathname || '').replace(/\/$/, '');
          } catch (e) {}
        }
      }
    }
    return window.location.origin + prefix + '/doc?path=' + encodeURIComponent(docPath);
  }

  function findClosestSidebarLink(eventTarget) {
    var node = eventTarget;
    if (!node) return null;
    if (node.nodeType !== 1) node = node.parentElement;
    if (!node || typeof node.closest !== 'function') return null;
    return node.closest('.tree-nav a.file-link');
  }

  function updateActiveLink(targetPath) {
    var nav = treeNav || document.querySelector('.tree-nav');
    if (!nav) return;
    var targetNorm = pathNorm(targetPath);
    nav.querySelectorAll('.file-link').forEach(function(link) {
      var linkPath = pathFromHref(link.getAttribute('href') || link.href);
      link.classList.toggle('active', pathNorm(linkPath) === targetNorm);
    });
  }

  function loadDoc(url, opts) {
    if (!article || inFlight) return;
    opts = opts || {};
    var absoluteUrl = resolveAbsoluteUrl(url);
    var targetNorm = pathNorm(pathFromHref(absoluteUrl));
    if (pathNorm(window.currentDocPath || '') === targetNorm) return;

    console.log('[doc-nav] 切换文档:', targetNorm || url);
    inFlight = true;
    article.style.transition = 'opacity 0.15s ease';
    article.style.opacity = '0.6';
    article.style.pointerEvents = 'none';

    var authCheck = typeof window.docNestEnsureAuthorized === 'function'
      ? window.docNestEnsureAuthorized()
      : Promise.resolve(true);

    authCheck.then(function(authorized) {
      if (!authorized) {
        if (typeof window.docNestRedirectToLogin === 'function') {
          window.docNestRedirectToLogin();
        }
        var redirectError = new Error('AUTH_REDIRECT');
        redirectError.redirected = true;
        throw redirectError;
      }
      return fetch(absoluteUrl, {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
    })
      .then(function(res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        return res.text();
      })
      .then(function(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var newArticle = doc.querySelector('.markdown-body');
        var newTitle = doc.querySelector('title');
        var pathFromUrl = (new URL(absoluteUrl, document.baseURI || window.location.href)).searchParams.get('path') || pathFromHref(absoluteUrl);

        if (!newArticle) {
          throw new Error('返回页面不是文档页');
        }

        article.innerHTML = newArticle.innerHTML;
        if (newTitle) document.title = newTitle.textContent;
        window.currentDocPath = pathFromUrl || pathFromHref(absoluteUrl);
        updateActiveLink(window.currentDocPath);
        updateBreadcrumbs(window.currentDocPath);
        if (typeof window.buildDocToc === 'function') window.buildDocToc();
        if (typeof window.scrollToDocHash === 'function') window.scrollToDocHash();

        if (opts.replace) {
          history.replaceState({ path: window.currentDocPath }, '', absoluteUrl);
          console.log('[doc-nav] 完成 (popstate):', window.currentDocPath);
        } else {
          history.pushState({ path: window.currentDocPath }, '', absoluteUrl);
          console.log('[doc-nav] 完成 (SPA):', window.currentDocPath);
        }

        if (typeof mermaid !== 'undefined') {
          mermaid.run().then(function() {
            if (typeof setupDiagramViewer === 'function') setupDiagramViewer();
          });
        } else if (typeof setupDiagramViewer === 'function') {
          setupDiagramViewer();
        }
      })
      .catch(function(err) {
        if (err && err.redirected) return;
        showNavError('文档加载失败，请稍后重试');
        console.warn('SPA 加载失败，保持当前页面:', err);
      })
      .finally(function() {
        inFlight = false;
        article.style.opacity = '';
        article.style.pointerEvents = '';
        article.style.transition = '';
      });
  }

  function init() {
    article = document.querySelector('.main-content .markdown-body');
    treeNav = document.querySelector('.tree-nav');
    if (!article) return;

    window.currentDocPath = window.currentDocPath || (document.body.getAttribute('data-current-path') || '');
    if (window.currentDocPath) {
      history.replaceState({ path: window.currentDocPath }, '', window.location.href);
    }

    // 委托到 body，避免部署后 treeNav 初始化时机导致未绑定（静态页/缓存等）
    document.body.addEventListener('click', function(e) {
      var link = findClosestSidebarLink(e.target);
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.saveTreeOpenState === 'function') window.saveTreeOpenState();
      var url = link.getAttribute('href');
      if (!url) return;
      url = resolveAbsoluteUrl(url);
      loadDoc(url);
    });

    window.navigateToDoc = function(urlOrPath) {
      var url = urlOrPath;
      if (url.indexOf('/') !== 0 && url.indexOf('http') !== 0) {
        url = resolveDocUrlFromPath(urlOrPath);
      } else {
        url = resolveAbsoluteUrl(url);
      }
      loadDoc(url);
    };

    window.addEventListener('popstate', function() {
      var pathname = window.location.pathname || '';
      var isDocPage = pathname.indexOf('/doc/') !== -1 || (new URL(window.location.href)).searchParams.get('path');
      if (isDocPage) {
        console.log('[doc-nav] 后退/前进:', pathname);
        loadDoc(window.location.href, { replace: true });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
