// 全屏模式下控制栏自动隐藏功能
let controlsAutoHideTimer = null;
let controlsMouseMoveTimer = null;

function setupControlsAutoHide() {
  const viewer = document.getElementById('diagram-viewer');
  const controls = document.querySelector('.diagram-viewer-controls');
  if (!viewer || !controls) return;
  
  // 初始状态：全屏模式下隐藏控制栏
  if (isFullscreen) {
    controls.classList.add('controls-hidden');
  }
  
  // 鼠标移动事件处理
  const mouseMoveHandler = function(e) {
    if (!isFullscreen) return;
    
    const viewerRect = viewer.getBoundingClientRect();
    const mouseY = e.clientY - viewerRect.top;
    const viewerHeight = viewerRect.height;
    const threshold = 100; // 距离底部100px时显示控制栏
    
    // 清除之前的定时器
    if (controlsAutoHideTimer) {
      clearTimeout(controlsAutoHideTimer);
    }
    if (controlsMouseMoveTimer) {
      clearTimeout(controlsMouseMoveTimer);
    }
    
    // 如果鼠标在底部区域，显示控制栏
    if (mouseY > viewerHeight - threshold) {
      controls.classList.remove('controls-hidden');
      
      // 鼠标静止后隐藏控制栏
      controlsMouseMoveTimer = setTimeout(() => {
        controls.classList.add('controls-hidden');
      }, 2000); // 2秒后隐藏
    } else {
      // 鼠标不在底部区域，立即隐藏
      controls.classList.add('controls-hidden');
    }
  };
  
  // 鼠标离开查看器时隐藏控制栏
  const mouseLeaveHandler = function() {
    if (!isFullscreen) return;
    const controls = document.querySelector('.diagram-viewer-controls');
    if (controls) {
      controls.classList.add('controls-hidden');
    }
  };
  
  viewer.addEventListener('mousemove', mouseMoveHandler);
  viewer.addEventListener('mouseleave', mouseLeaveHandler);
  
  // 保存处理器以便后续移除
  viewer._controlsMouseMoveHandler = mouseMoveHandler;
  viewer._controlsMouseLeaveHandler = mouseLeaveHandler;
}

function removeControlsAutoHide() {
  const viewer = document.getElementById('diagram-viewer');
  if (!viewer) return;
  
  if (controlsAutoHideTimer) {
    clearTimeout(controlsAutoHideTimer);
    controlsAutoHideTimer = null;
  }
  if (controlsMouseMoveTimer) {
    clearTimeout(controlsMouseMoveTimer);
    controlsMouseMoveTimer = null;
  }
  
  if (viewer._controlsMouseMoveHandler) {
    viewer.removeEventListener('mousemove', viewer._controlsMouseMoveHandler);
    viewer._controlsMouseMoveHandler = null;
  }
  if (viewer._controlsMouseLeaveHandler) {
    viewer.removeEventListener('mouseleave', viewer._controlsMouseLeaveHandler);
    viewer._controlsMouseLeaveHandler = null;
  }
  
  // 移除隐藏状态
  const controls = document.querySelector('.diagram-viewer-controls');
  if (controls) {
    controls.classList.remove('controls-hidden');
  }
}
