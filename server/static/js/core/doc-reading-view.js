(function () {
  const layout = document.querySelector('.doc-layout');
  const main = document.querySelector('.main-content');
  const article = layout?.querySelector('.markdown-body');
  if (!layout || !main || !article) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'doc-reading-toggle';
  button.setAttribute('aria-controls', 'sidebar doc-toc');
  function updateButton() {
    const expanded = document.body.classList.contains('doc-reading-expanded');
    const iconPath = expanded
      ? 'M3 8h5V3M8 8 2 2M21 8h-5V3M16 8l6-6M3 16h5v5M8 16l-6 6M21 16h-5v5M16 16l6 6'
      : 'M8 3H3v5M3 3l6 6M16 3h5v5M21 3l-6 6M3 16v5h5M3 21l6-6M21 16v5h-5M21 21l-6-6';
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPath}"/></svg>`;
    button.setAttribute('aria-label', expanded ? '缩小正文，恢复目录' : '放大正文，隐藏目录');
    button.setAttribute('aria-pressed', String(expanded));
    button.title = expanded ? '恢复默认阅读布局' : '扩大正文阅读区域';
  }
  function positionButton() {
    const right = main.getBoundingClientRect().left + main.clientWidth - article.getBoundingClientRect().right;
    main.style.setProperty('--doc-reading-button-right', `${Math.max(0, right)}px`);
  }
  window.addEventListener('resize', positionButton);
  button.addEventListener('click', function () {
    if (!document.body.classList.contains('doc-reading-expanded')) {
      const mainBounds = main.getBoundingClientRect();
      const articleRight = article.getBoundingClientRect().right;
      const rightPadding = mainBounds.left + main.clientWidth - articleRight;
      const outerMargin = document.documentElement.clientWidth - articleRight;
      main.style.setProperty('--doc-reading-left-margin', `${Math.max(0, outerMargin)}px`);
      main.style.setProperty('--doc-reading-right-margin', `${Math.max(0, rightPadding)}px`);
    }
    document.body.classList.toggle('doc-reading-expanded');
    updateButton();
    positionButton();
  });
  updateButton();
  main.appendChild(button);
  positionButton();
})();
