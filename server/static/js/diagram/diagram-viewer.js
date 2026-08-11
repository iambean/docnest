// 图表查看器核心功能
let currentZoom = 1;
let defaultZoom = 1;
let currentSvg = null;
let isFullscreen = false;

function setupDiagramViewer() {
  const diagrams = document.querySelectorAll('.markdown-body .mermaid');
  diagrams.forEach((diagram, index) => {
    // 添加下载按钮
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'mermaid-download-btn';
    downloadBtn.innerHTML = '⬇️ 下载';
    downloadBtn.title = '下载图表';
    downloadBtn.onclick = function(e) {
      e.stopPropagation(); // 阻止触发点击查看大图
      const svg = diagram.querySelector('svg');
      if (svg) {
        if (typeof showDownloadMenu === 'function') {
          showDownloadMenu(svg.cloneNode(true), `diagram-${index + 1}`);
        }
      }
    };
    diagram.appendChild(downloadBtn);
    
    // 点击查看大图
    diagram.addEventListener('click', function(e) {
      // 如果点击的是下载按钮，不打开查看器
      if (e.target === downloadBtn || downloadBtn.contains(e.target)) {
        return;
      }
      const svg = diagram.querySelector('svg');
      if (svg) {
        openDiagramViewer(svg.cloneNode(true));
      }
    });
  });
}

function openDiagramViewer(svgElement) {
  const viewer = document.getElementById('diagram-viewer');
  const container = document.getElementById('diagram-viewer-svg-container');
  
  if (!viewer || !container) return;
  
  // 获取原始 SVG 的尺寸
  let originalWidth = parseFloat(svgElement.getAttribute('width'));
  let originalHeight = parseFloat(svgElement.getAttribute('height'));
  
  // 如果没有 width/height，尝试从 viewBox 获取
  if (!originalWidth || !originalHeight || isNaN(originalWidth) || isNaN(originalHeight)) {
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      if (parts.length >= 4) {
        originalWidth = parseFloat(parts[2]) || 800;
        originalHeight = parseFloat(parts[3]) || 600;
      }
    }
  }
  
  // 如果还是没有，使用默认值
  if (!originalWidth || !originalHeight || isNaN(originalWidth) || isNaN(originalHeight)) {
    originalWidth = 800;
    originalHeight = 600;
  }
  
  // 设置 SVG 样式，确保充分利用空间
  svgElement.setAttribute('class', 'diagram-viewer-svg');
  // 清除之前的样式，但保留必要的属性
  svgElement.removeAttribute('style');
  // 确保 SVG 有正确的属性
  if (!svgElement.getAttribute('width')) {
    svgElement.setAttribute('width', originalWidth);
  }
  if (!svgElement.getAttribute('height')) {
    svgElement.setAttribute('height', originalHeight);
  }
  
  // 包装元素本身还包含边界 padding，因此适配比例必须把容器 padding 和图表边界一并算入。
  const padding = 40;
  const containerWidth = container.clientWidth - 40 - padding * 2;
  const containerHeight = container.clientHeight - 40 - padding * 2;
  
  // 确保容器尺寸有效
  const validContainerWidth = containerWidth > 0 ? containerWidth : 800;
  const validContainerHeight = containerHeight > 0 ? containerHeight : 600;
  
  const scaleX = validContainerWidth / originalWidth;
  const scaleY = validContainerHeight / originalHeight;
  const initialScale = Math.min(scaleX, scaleY, 1.5);
  
  // 横向或纵向长图默认适配到查看器可视区；放大图仍保留最多 150% 的默认比例。
  const safeInitialScale = isFinite(initialScale) && initialScale > 0 ? initialScale : 1;
  currentZoom = Math.min(Math.max(safeInitialScale, 0.25), 1.5);
  defaultZoom = currentZoom;
  
  // 创建包装元素，用于正确计算滚动范围
  // 添加边界 padding，确保边缘内容可见
  const wrapper = document.createElement('div');
  wrapper.className = 'diagram-viewer-svg-wrapper';
  wrapper.style.width = (originalWidth * currentZoom + padding * 2) + 'px';
  wrapper.style.height = (originalHeight * currentZoom + padding * 2) + 'px';
  wrapper.style.position = 'relative';
  wrapper.style.flexShrink = '0';
  wrapper.style.display = 'block';
  wrapper.style.margin = '0 auto';
  wrapper.style.padding = padding + 'px';
  wrapper.style.boxSizing = 'border-box';
  
  svgElement.style.transform = `scale(${currentZoom})`;
  svgElement.style.transformOrigin = 'top left';
  svgElement.style.width = originalWidth + 'px';
  svgElement.style.height = originalHeight + 'px';
  svgElement.style.position = 'absolute';
  svgElement.style.top = padding + 'px';
  svgElement.style.left = padding + 'px';
  svgElement.style.display = 'block';
  
  // 先清空容器
  container.innerHTML = '';
  // 添加包装元素
  container.appendChild(wrapper);
  wrapper.appendChild(svgElement);
  
  currentSvg = svgElement;
  
  // 确保在 DOM 更新后再更新缩放信息和滚动位置
  setTimeout(() => {
    if (typeof updateZoomInfo === 'function') {
      updateZoomInfo();
    }
    // 重置滚动位置到 padding 位置，确保能看到图表顶部和左侧边缘
    container.scrollTop = 0;
    container.scrollLeft = 0;
    
    // 超宽图从左侧边界开始，避免 flex 居中产生不可滚动的负溢出；小图由 wrapper 的 auto margin 居中。
    container.scrollLeft = 0;
    container.scrollTop = 0;
  }, 0);
  
  viewer.classList.add('show');
  document.body.style.overflow = 'hidden';
  
  // 重置全屏状态
  isFullscreen = false;
  if (typeof updateFullscreenButton === 'function') {
    updateFullscreenButton();
  }
  
  // 初始化各个功能模块
  if (typeof setupDragPan === 'function') {
    setupDragPan();
  }
  if (typeof setupControlsAutoHide === 'function') {
    setupControlsAutoHide();
  }
  
  // 将大图查看器加入弹窗栈
  if (typeof pushModal === 'function') {
    pushModal('diagram-viewer', closeDiagramViewer);
  }
}

function closeDiagramViewer() {
  const viewer = document.getElementById('diagram-viewer');
  if (!viewer) return;
  
  // 如果处于全屏模式，先退出全屏
  if (isFullscreen && typeof exitFullscreen === 'function') {
    exitFullscreen();
  }
  
  // 移除事件监听器
  if (typeof removeDragPan === 'function') {
    removeDragPan();
  }
  if (typeof removeControlsAutoHide === 'function') {
    removeControlsAutoHide();
  }
  
  viewer.classList.remove('show');
  document.body.style.overflow = '';
  currentSvg = null;
  currentZoom = 1;
  isFullscreen = false;
  
  // 从弹窗栈中移除
  if (typeof removeModal === 'function') {
    removeModal('diagram-viewer');
  }
}

function resetDiagramZoom() {
  if (!currentSvg) return;
  const container = document.getElementById('diagram-viewer-svg-container');
  if (!container) return;
  
  const wrapper = container.querySelector('.diagram-viewer-svg-wrapper');
  if (!wrapper) return;
  
  // 获取原始尺寸
  const originalWidth = parseFloat(currentSvg.style.width) || parseFloat(currentSvg.getAttribute('width')) || 800;
  const originalHeight = parseFloat(currentSvg.style.height) || parseFloat(currentSvg.getAttribute('height')) || 600;
  
  const padding = 40; // 边界 padding 大小（像素）
  currentZoom = defaultZoom;
  currentSvg.style.transform = `scale(${currentZoom})`;
  currentSvg.style.transformOrigin = 'top left';
  
  // 更新包装元素尺寸（包含 padding）
  wrapper.style.width = (originalWidth * currentZoom + padding * 2) + 'px';
  wrapper.style.height = (originalHeight * currentZoom + padding * 2) + 'px';
  
  if (typeof updateZoomInfo === 'function') {
    updateZoomInfo();
  }
  
  // 重置滚动位置到 padding 位置
  container.scrollTop = 0;
  container.scrollLeft = 0;
}

function toggleFullscreen() {
  if (isFullscreen) {
    if (typeof exitFullscreen === 'function') {
      exitFullscreen();
    }
  } else {
    if (typeof enterFullscreen === 'function') {
      enterFullscreen();
    }
  }
}

function enterFullscreen() {
  const viewer = document.getElementById('diagram-viewer');
  if (!viewer) return;
  
  if (viewer.requestFullscreen) {
    viewer.requestFullscreen();
  } else if (viewer.webkitRequestFullscreen) {
    viewer.webkitRequestFullscreen();
  } else if (viewer.mozRequestFullScreen) {
    viewer.mozRequestFullScreen();
  } else if (viewer.msRequestFullscreen) {
    viewer.msRequestFullscreen();
  }
  
  isFullscreen = true;
  if (typeof updateFullscreenButton === 'function') {
    updateFullscreenButton();
  }
  
  // 更新控制栏显示状态
  const controls = document.querySelector('.diagram-viewer-controls');
  if (controls) {
    controls.classList.add('controls-hidden');
  }
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.mozCancelFullScreen) {
    document.mozCancelFullScreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }
  
  isFullscreen = false;
  if (typeof updateFullscreenButton === 'function') {
    updateFullscreenButton();
  }
  
  // 显示控制栏
  const controls = document.querySelector('.diagram-viewer-controls');
  if (controls) {
    controls.classList.remove('controls-hidden');
  }
}

function updateFullscreenButton() {
  const btn = document.getElementById('fullscreen-btn');
  if (btn) {
    btn.textContent = isFullscreen ? '⛶ 退出全屏' : '⛶ 全屏';
  }
  
  // 更新复制和下载按钮的显示状态
  const controls = document.querySelector('.diagram-viewer-controls');
  if (controls) {
    const copyBtn = controls.querySelector('.copy-btn');
    const downloadBtn = controls.querySelector('.download-btn');
    if (copyBtn) copyBtn.style.display = isFullscreen ? 'none' : '';
    if (downloadBtn) downloadBtn.style.display = isFullscreen ? 'none' : '';
  }
}

function updateZoomInfo() {
  const zoomInfo = document.getElementById('zoom-info');
  if (zoomInfo) {
    // 确保 currentZoom 是有效数字
    const zoom = isNaN(currentZoom) || !isFinite(currentZoom) ? 1 : currentZoom;
    zoomInfo.textContent = Math.round(zoom * 100) + '%';
  }
}

// 点击模态框外部关闭
document.getElementById('diagram-viewer')?.addEventListener('click', function(e) {
  if (e.target === this) {
    closeDiagramViewer();
  }
});

// 监听全屏状态变化
document.addEventListener('fullscreenchange', function() {
  isFullscreen = !!document.fullscreenElement;
  if (typeof updateFullscreenButton === 'function') {
    updateFullscreenButton();
  }
  
  // 更新控制栏显示状态
  const controls = document.querySelector('.diagram-viewer-controls');
  if (controls) {
    if (isFullscreen) {
      controls.classList.add('controls-hidden');
    } else {
      controls.classList.remove('controls-hidden');
      if (typeof removeControlsAutoHide === 'function') {
        removeControlsAutoHide();
      }
      if (typeof setupControlsAutoHide === 'function') {
        setupControlsAutoHide();
      }
    }
  }
});

document.addEventListener('webkitfullscreenchange', function() {
  isFullscreen = !!document.webkitFullscreenElement;
  if (typeof updateFullscreenButton === 'function') {
    updateFullscreenButton();
  }
  
  const controls = document.querySelector('.diagram-viewer-controls');
  if (controls) {
    if (isFullscreen) {
      controls.classList.add('controls-hidden');
    } else {
      controls.classList.remove('controls-hidden');
      if (typeof removeControlsAutoHide === 'function') {
        removeControlsAutoHide();
      }
      if (typeof setupControlsAutoHide === 'function') {
        setupControlsAutoHide();
      }
    }
  }
});

document.addEventListener('mozfullscreenchange', function() {
  isFullscreen = !!document.mozFullScreenElement;
  if (typeof updateFullscreenButton === 'function') {
    updateFullscreenButton();
  }
  
  const controls = document.querySelector('.diagram-viewer-controls');
  if (controls) {
    if (isFullscreen) {
      controls.classList.add('controls-hidden');
    } else {
      controls.classList.remove('controls-hidden');
      if (typeof removeControlsAutoHide === 'function') {
        removeControlsAutoHide();
      }
      if (typeof setupControlsAutoHide === 'function') {
        setupControlsAutoHide();
      }
    }
  }
});

document.addEventListener('msfullscreenchange', function() {
  isFullscreen = !!document.msFullscreenElement;
  if (typeof updateFullscreenButton === 'function') {
    updateFullscreenButton();
  }
  
  const controls = document.querySelector('.diagram-viewer-controls');
  if (controls) {
    if (isFullscreen) {
      controls.classList.add('controls-hidden');
    } else {
      controls.classList.remove('controls-hidden');
      if (typeof removeControlsAutoHide === 'function') {
        removeControlsAutoHide();
      }
      if (typeof setupControlsAutoHide === 'function') {
        setupControlsAutoHide();
      }
    }
  }
});
