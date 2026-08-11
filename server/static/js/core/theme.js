// 主题切换功能（支持系统自动跟随）
(function() {
  // 检测系统主题
  function getSystemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  // 从 localStorage 读取主题偏好，默认为 'auto'（跟随系统）
  const savedTheme = localStorage.getItem('markdown-theme') || 'auto';
  
  // 相对路径，由 resolveThemeCss 统一加上 base 或前导 /
  const themes = {
    light: {
      css: 'vendor/github-markdown-css/github-markdown-light.css',
      icon: '☀️',
      text: '浅色模式'
    },
    dark: {
      css: 'vendor/github-markdown-css/github-markdown-dark.css',
      icon: '🌙',
      text: '深色模式'
    },
    auto: {
      css: '',
      icon: '💻',
      text: '跟随系统'
    }
  };

  function resolveThemeCss(path) {
    if (!path) return '';
    var base = document.querySelector('base');
    if (base && base.getAttribute('href')) {
      var baseHref = base.getAttribute('href').replace(/\/?$/, '/');
      return baseHref + path.replace(/^\//, '');
    }
    return path.charAt(0) === '/' ? path : '/' + path;
  }
  
  // 获取实际要应用的主题（如果是 auto，则使用系统主题）
  function getEffectiveTheme(theme) {
    return theme === 'auto' ? getSystemTheme() : theme;
  }
  
  // 三种形态循环顺序：auto → light → dark → auto
  const themeCycle = ['auto', 'light', 'dark'];

  // 等待 DOM 加载完成
  function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const themeLink = document.getElementById('markdown-theme');
    const themeIcon = themeToggle?.querySelector('.theme-icon');
    const themeText = themeToggle?.querySelector('.theme-text');

    if (!themeToggle || !themeLink || !themeIcon) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
        return;
      }
      console.warn('主题切换元素未找到，可能 DOM 尚未加载完成');
      return;
    }

    // 更新按钮显示（图标 + 文案）
    function updateButtonDisplay(theme) {
      const themeConfig = themes[theme];
      if (themeIcon) themeIcon.textContent = themeConfig.icon;
      if (themeText) themeText.textContent = themeConfig.text;
    }

    // 应用主题
    function applyTheme(theme, skipSave) {
      const effectiveTheme = getEffectiveTheme(theme);
      const themeConfig = themes[theme];
      const effectiveConfig = themes[effectiveTheme];

      themeLink.href = resolveThemeCss(effectiveConfig.css);
      document.body.setAttribute('data-theme', effectiveTheme);
      document.body.setAttribute('data-theme-mode', theme);

      updateButtonDisplay(theme);

      if (!skipSave) {
        localStorage.setItem('markdown-theme', theme);
      }

      if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
          startOnLoad: false,
          theme: effectiveTheme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true
          }
        });
        mermaid.run().then(() => {
          if (typeof setupDiagramViewer === 'function') {
            setupDiagramViewer();
          }
        });
      }
    }

    // 一键循环到下一形态
    function cycleTheme() {
      const current = document.body.getAttribute('data-theme-mode') || savedTheme;
      const idx = themeCycle.indexOf(current);
      const nextIdx = idx >= 0 ? (idx + 1) % themeCycle.length : 0;
      applyTheme(themeCycle[nextIdx]);
    }

    if (window.matchMedia && !window._themeMediaQueryBound) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', function() {
        const currentMode = document.body.getAttribute('data-theme-mode') || savedTheme;
        if (currentMode === 'auto') {
          applyTheme('auto', true);
        }
      });
      window._themeMediaQueryBound = true;
    }

    applyTheme(savedTheme);

    themeToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      cycleTheme();
    });
  }
  
  // 如果 DOM 已经加载完成，立即执行；否则等待 DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }
})();
