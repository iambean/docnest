// 侧边栏功能
(function() {
  // 等待 DOM 加载完成
  function initSidebarResizer() {
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    const toggle = document.getElementById('sidebar-collapse-toggle');
    
    if (!sidebar || !resizer || !toggle) {
      // 如果元素还没加载，延迟重试
      setTimeout(initSidebarResizer, 100);
      return;
    }
    
    const COLLAPSE_KEY = 'sidebar-collapsed';
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    function getSidebarBounds() {
      const styles = window.getComputedStyle(sidebar);
      const minWidth = Number.parseFloat(styles.minWidth) || 240;
      const viewportMaxWidth = Math.floor(window.innerWidth * 0.42);
      const cssMaxWidth = Number.parseFloat(styles.maxWidth) || viewportMaxWidth;
      const maxWidth = Math.max(minWidth, Math.min(cssMaxWidth, viewportMaxWidth));
      return { minWidth, maxWidth };
    }

    function clampWidth(width) {
      const { minWidth, maxWidth } = getSidebarBounds();
      return Math.min(Math.max(width, minWidth), maxWidth);
    }

    function applySidebarWidth(width, shouldPersist) {
      const nextWidth = clampWidth(width);
      sidebar.style.width = nextWidth + 'px';
      if (shouldPersist) {
        localStorage.setItem('sidebar-width', String(Math.round(nextWidth)));
      }
    }

    function setCollapsed(collapsed) {
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', collapsed ? '展开目录' : '收起目录');
      toggle.setAttribute('title', collapsed ? '展开目录' : '收起目录');
      toggle.querySelector('.sidebar-collapse-icon').textContent = collapsed ? '›' : '‹';
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    }

    // 从 localStorage 读取保存的宽度，读不到则使用当前计算宽度兜底
    const savedWidth = Number.parseFloat(localStorage.getItem('sidebar-width') || '');
    const initialWidth = Number.isFinite(savedWidth) ? savedWidth : sidebar.getBoundingClientRect().width;
    applySidebarWidth(initialWidth, false);
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    
    resizer.addEventListener('mousedown', function(e) {
      if (document.body.classList.contains('sidebar-collapsed')) return;
      isResizing = true;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation();
    });
    
    document.addEventListener('mousemove', function(e) {
      if (!isResizing) return;
      
      const diff = e.clientX - startX;
      const newWidth = startWidth + diff;
      applySidebarWidth(newWidth, false);
      e.preventDefault();
    });
    
    document.addEventListener('mouseup', function() {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // 保存宽度到 localStorage
        applySidebarWidth(sidebar.offsetWidth, true);
      }
    });

    toggle.addEventListener('click', function() {
      const willCollapse = !document.body.classList.contains('sidebar-collapsed');
      setCollapsed(willCollapse);
    });

    window.addEventListener('resize', function() {
      const currentWidth = Number.parseFloat(sidebar.style.width) || sidebar.getBoundingClientRect().width;
      applySidebarWidth(currentWidth, false);
    });
  }
  
  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarResizer);
  } else {
    initSidebarResizer();
  }
})();

// 目录折叠/展开功能（图标统一为 ▼，展开=朝下，折叠=CSS 旋转为朝右）
function toggleDirectory(element) {
  const children = element.nextElementSibling;
  if (children) {
    const directoryItem = element.parentElement;
    const isCollapsed =
      directoryItem.classList.contains('collapsed') ||
      children.style.display === 'none';
    children.style.display = isCollapsed ? 'block' : 'none';
    directoryItem.classList.toggle('collapsed', !isCollapsed);
    if (typeof window.saveTreeOpenState === 'function') window.saveTreeOpenState();
  }
}

// 目录行点击：与普通目录一致，统一为切换展开/折叠（README 需点击文件链接进入）
// 使用 body 委托，避免依赖 .tree-nav 加载时机
(function() {
  function onBodyClick(e) {
    const dirToggle = e.target.closest('.tree-nav .dir-toggle');
    if (!dirToggle) return;
    toggleDirectory(dirToggle);
  }
  function bindDirReadmeClick() {
    document.body.removeEventListener('click', onBodyClick);
    document.body.addEventListener('click', onBodyClick);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDirReadmeClick);
  } else {
    bindDirReadmeClick();
  }
  window.addEventListener('load', bindDirReadmeClick);
})();
