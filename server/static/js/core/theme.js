// DocNest 外观系统：主题风格与明暗模式相互独立，并按宿主项目持久化。
(function() {
  'use strict';

  // The theme script is loaded in <head>. Keep the document out of the first
  // paint until the persisted appearance has been copied onto <body>.
  document.documentElement.setAttribute('data-docnest-theme-pending', '');

  var THEME_PROFILES = {
    'slate-modern': {
      label: 'Slate Modern',
      description: '清爽、克制的现代文档界面',
      colors: ['#ffffff', '#111111', '#5e6ad2']
    },
    'editorial-atlas': {
      label: 'Editorial Atlas',
      description: '安静、舒展的技术出版物',
      colors: ['#f3f0e7', '#171815', '#1f5b57']
    },
    'precision-index': {
      label: 'Precision Index',
      description: '高密度、可追溯的工程索引',
      colors: ['#eef2f3', '#14242b', '#007486']
    },
    'archive-room': {
      label: 'Archive Room',
      description: '温和、有秩序的档案阅览室',
      colors: ['#f3efe4', '#262821', '#a5523d']
    },
    'swiss-manual': {
      label: 'Swiss Manual',
      description: '鲜明、直接的瑞士工程手册',
      colors: ['#f4f3ef', '#111111', '#e33b27']
    }
  };

  var COLOR_MODES = {
    auto: { label: '跟随系统', shortLabel: 'A' },
    light: { label: '浅色', shortLabel: 'L' },
    dark: { label: '深色', shortLabel: 'D' }
  };
  var MODE_CYCLE = ['auto', 'light', 'dark'];
  var config = window.DOCNEST_CONFIG || {};
  var appearance = config.appearance || {};
  var storagePrefix = String(config.storageKeyPrefix || 'docnest');
  var themeStorageKey = storagePrefix + ':theme-style';
  var modeStorageKey = storagePrefix + ':theme-mode';

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {}
  }

  function normalizeThemeName(value) {
    return value === 'current-docs' ? 'slate-modern' : value;
  }

  function uniqueKnownThemes(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : [])
      .map(normalizeThemeName)
      .filter(function(value) {
        if (!THEME_PROFILES[value] || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  }

  var enabledThemes = uniqueKnownThemes(appearance.enabledThemes);
  if (enabledThemes.length === 0) enabledThemes = Object.keys(THEME_PROFILES);

  var configuredThemeName = normalizeThemeName(appearance.defaultTheme);
  var configuredTheme = THEME_PROFILES[configuredThemeName]
    ? configuredThemeName
    : 'slate-modern';
  var defaultTheme = enabledThemes.indexOf(configuredTheme) >= 0
    ? configuredTheme
    : enabledThemes[0];
  var defaultMode = COLOR_MODES[appearance.defaultMode] ? appearance.defaultMode : 'auto';
  var storedThemeValue = readStorage(themeStorageKey);
  var storedTheme = normalizeThemeName(storedThemeValue);
  var storedMode = readStorage(modeStorageKey);
  var migratedLegacyMode = false;

  // 兼容 0.1.x 的明暗模式存储键；只迁移有效值，不覆盖新的项目级偏好。
  if (!storedMode) {
    var legacyMode = readStorage('markdown-theme');
    if (COLOR_MODES[legacyMode]) {
      storedMode = legacyMode;
      migratedLegacyMode = true;
    }
  }

  var activeTheme = enabledThemes.indexOf(storedTheme) >= 0 ? storedTheme : defaultTheme;
  var activeMode = COLOR_MODES[storedMode] ? storedMode : defaultMode;
  if (storedThemeValue === 'current-docs') writeStorage(themeStorageKey, activeTheme);
  if (migratedLegacyMode) writeStorage(modeStorageKey, activeMode);

  function getSystemMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function getEffectiveMode(mode) {
    return mode === 'auto' ? getSystemMode() : mode;
  }

  function setAppearanceAttributes(theme, mode) {
    var effectiveMode = getEffectiveMode(mode);
    var root = document.documentElement;
    root.setAttribute('data-doc-theme', theme);
    root.setAttribute('data-theme', effectiveMode);
    root.setAttribute('data-theme-mode', mode);
    root.style.colorScheme = effectiveMode;
    if (document.body) {
      document.body.setAttribute('data-doc-theme', theme);
      document.body.setAttribute('data-theme', effectiveMode);
      document.body.setAttribute('data-theme-mode', mode);
    }
    return effectiveMode;
  }

  // 在 DOM 完成前先写入 html，避免主题闪烁。
  setAppearanceAttributes(activeTheme, activeMode);

  function resolveThemeCss(assetPath) {
    var base = document.querySelector('base');
    if (base && base.getAttribute('href')) {
      return base.getAttribute('href').replace(/\/?$/, '/') + assetPath.replace(/^\//, '');
    }
    return assetPath.charAt(0) === '/' ? assetPath : '/' + assetPath;
  }

  function applyMarkdownTheme(effectiveMode) {
    var link = document.getElementById('markdown-theme');
    if (!link) return;
    link.href = resolveThemeCss(
      effectiveMode === 'dark'
        ? 'vendor/github-markdown-css/github-markdown-dark.css'
        : 'vendor/github-markdown-css/github-markdown-light.css'
    );
  }

  function updateControls() {
    var profile = THEME_PROFILES[activeTheme];
    var styleText = document.querySelector('.theme-style-text');
    var modeText = document.querySelector('.theme-text');
    var modeIcon = document.querySelector('.theme-icon');
    if (styleText) styleText.textContent = profile.label;
    if (modeText) modeText.textContent = COLOR_MODES[activeMode].label;
    if (modeIcon) modeIcon.textContent = COLOR_MODES[activeMode].shortLabel;

    document.querySelectorAll('[data-theme-option]').forEach(function(button) {
      var checked = button.getAttribute('data-theme-option') === activeTheme;
      button.setAttribute('aria-checked', String(checked));
      button.classList.toggle('is-active', checked);
    });
    document.querySelectorAll('[data-mode-option]').forEach(function(button) {
      var checked = button.getAttribute('data-mode-option') === activeMode;
      button.setAttribute('aria-checked', String(checked));
      button.classList.toggle('is-active', checked);
    });
  }

  function refreshMermaid(effectiveMode) {
    if (typeof window.mermaid === 'undefined') return;
    window.mermaid.initialize({
      startOnLoad: false,
      theme: effectiveMode === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true }
    });
  }

  function applyAppearance(theme, mode, options) {
    var nextTheme = enabledThemes.indexOf(theme) >= 0 ? theme : defaultTheme;
    var nextMode = COLOR_MODES[mode] ? mode : defaultMode;
    activeTheme = nextTheme;
    activeMode = nextMode;
    var effectiveMode = setAppearanceAttributes(activeTheme, activeMode);
    applyMarkdownTheme(effectiveMode);
    updateControls();
    refreshMermaid(effectiveMode);

    if (!options || options.persist !== false) {
      writeStorage(themeStorageKey, activeTheme);
      writeStorage(modeStorageKey, activeMode);
    }

    window.dispatchEvent(new CustomEvent('docnest:appearance-change', {
      detail: {
        theme: activeTheme,
        mode: activeMode,
        effectiveMode: effectiveMode
      }
    }));
  }

  function buildThemeOptions(container) {
    enabledThemes.forEach(function(themeName) {
      var profile = THEME_PROFILES[themeName];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-option';
      button.setAttribute('role', 'radio');
      button.setAttribute('data-theme-option', themeName);
      button.setAttribute('aria-checked', 'false');

      var palette = document.createElement('span');
      palette.className = 'theme-option-palette';
      palette.setAttribute('aria-hidden', 'true');
      profile.colors.forEach(function(color) {
        var chip = document.createElement('i');
        chip.style.backgroundColor = color;
        palette.appendChild(chip);
      });

      var copy = document.createElement('span');
      copy.className = 'theme-option-copy';
      var title = document.createElement('strong');
      title.textContent = profile.label;
      var description = document.createElement('small');
      description.textContent = profile.description;
      copy.appendChild(title);
      copy.appendChild(description);

      var check = document.createElement('span');
      check.className = 'theme-option-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';

      button.appendChild(palette);
      button.appendChild(copy);
      button.appendChild(check);
      button.addEventListener('click', function() {
        applyAppearance(themeName, activeMode);
      });
      container.appendChild(button);
    });
  }

  function buildModeOptions(container) {
    MODE_CYCLE.forEach(function(mode) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-mode-option';
      button.setAttribute('role', 'radio');
      button.setAttribute('data-mode-option', mode);
      button.setAttribute('aria-checked', 'false');
      button.innerHTML = '<span aria-hidden="true">' + COLOR_MODES[mode].shortLabel + '</span>' +
        '<strong>' + COLOR_MODES[mode].label + '</strong>';
      button.addEventListener('click', function() {
        applyAppearance(activeTheme, mode);
      });
      container.appendChild(button);
    });
  }

  function initAppearanceControls() {
    setAppearanceAttributes(activeTheme, activeMode);
    var styleToggle = document.getElementById('theme-style-toggle');
    var modeToggle = document.getElementById('theme-toggle');
    var popover = document.getElementById('theme-popover');
    var themeOptions = document.getElementById('theme-options');
    var modeOptions = document.getElementById('theme-mode-options');

    if (themeOptions) buildThemeOptions(themeOptions);
    if (modeOptions) buildModeOptions(modeOptions);

    function setPopoverOpen(open) {
      if (!styleToggle || !popover) return;
      popover.hidden = !open;
      styleToggle.setAttribute('aria-expanded', String(open));
      if (open) {
        var activeOption = popover.querySelector('.theme-option.is-active');
        if (activeOption) activeOption.focus();
      }
    }

    if (styleToggle && popover) {
      styleToggle.addEventListener('click', function(event) {
        event.stopPropagation();
        setPopoverOpen(popover.hidden);
      });
      popover.addEventListener('click', function(event) {
        event.stopPropagation();
      });
      document.addEventListener('click', function() { setPopoverOpen(false); });
      document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
          setPopoverOpen(false);
          styleToggle.focus();
        }
      });
    }

    if (modeToggle) {
      modeToggle.addEventListener('click', function() {
        var index = MODE_CYCLE.indexOf(activeMode);
        applyAppearance(activeTheme, MODE_CYCLE[(index + 1) % MODE_CYCLE.length]);
      });
    }

    if (window.matchMedia && !window.__docnestThemeMediaQueryBound) {
      var query = window.matchMedia('(prefers-color-scheme: dark)');
      query.addEventListener('change', function() {
        if (activeMode === 'auto') applyAppearance(activeTheme, 'auto', { persist: false });
      });
      window.__docnestThemeMediaQueryBound = true;
    }

    applyAppearance(activeTheme, activeMode, { persist: false });
    document.documentElement.removeAttribute('data-docnest-theme-pending');
  }

  window.DocNestAppearance = {
    get: function() {
      return { theme: activeTheme, mode: activeMode, effectiveMode: getEffectiveMode(activeMode) };
    },
    setTheme: function(theme) { applyAppearance(theme, activeMode); },
    setMode: function(mode) { applyAppearance(activeTheme, mode); },
    themes: Object.keys(THEME_PROFILES)
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppearanceControls);
  } else {
    initAppearanceControls();
  }
})();
