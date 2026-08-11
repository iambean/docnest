// 图表缩放功能（按钮缩放）
function zoomDiagram(direction) {
  if (!currentSvg) return;
  
  const container = document.getElementById('diagram-viewer-svg-container');
  if (!container) return;
  
  const wrapper = container.querySelector('.diagram-viewer-svg-wrapper');
  if (!wrapper) return;
  
  // 获取原始尺寸
  const originalWidth = parseFloat(currentSvg.style.width) || parseFloat(currentSvg.getAttribute('width')) || 800;
  const originalHeight = parseFloat(currentSvg.style.height) || parseFloat(currentSvg.getAttribute('height')) || 600;
  
  // 边界 padding 大小（与 diagram-viewer.js 中保持一致）
  const padding = 40;
  
  // 记录缩放前的状态
  const containerRect = container.getBoundingClientRect();
  const currentZoomValue = isNaN(currentZoom) || !isFinite(currentZoom) ? 1 : currentZoom;
  
  // 计算容器中心点相对于包装元素的位置（考虑滚动和 padding）
  const centerXInWrapper = container.scrollLeft + containerRect.width / 2;
  const centerYInWrapper = container.scrollTop + containerRect.height / 2;
  
  // 计算中心点指向的内容在原始尺寸中的位置（减去 padding）
  const contentX = (centerXInWrapper - padding) / currentZoomValue;
  const contentY = (centerYInWrapper - padding) / currentZoomValue;
  
  // 计算新的缩放值
  if (direction === 'in') {
    currentZoom = Math.min(currentZoomValue + 0.25, 3);
  } else {
    currentZoom = Math.max(currentZoomValue - 0.25, 0.25);
  }
  
  // 更新 SVG 缩放
  currentSvg.style.transform = `scale(${currentZoom})`;
  currentSvg.style.transformOrigin = 'top left';
  
  // 更新包装元素尺寸，确保滚动范围正确（包含 padding）
  const newWrapperWidth = originalWidth * currentZoom + padding * 2;
  const newWrapperHeight = originalHeight * currentZoom + padding * 2;
  wrapper.style.width = newWrapperWidth + 'px';
  wrapper.style.height = newWrapperHeight + 'px';
  
  if (typeof updateZoomInfo === 'function') {
    updateZoomInfo();
  }
  
  // 计算缩放后中心点指向的内容的新位置（加上 padding）
  const newCenterXInWrapper = contentX * currentZoom + padding;
  const newCenterYInWrapper = contentY * currentZoom + padding;
  
  // 计算新的滚动位置，使中心点指向的内容位置保持不变
  const newScrollX = newCenterXInWrapper - containerRect.width / 2;
  const newScrollY = newCenterYInWrapper - containerRect.height / 2;
  
  // 限制滚动范围，确保不超出边界
  const maxScrollX = Math.max(0, newWrapperWidth - containerRect.width);
  const maxScrollY = Math.max(0, newWrapperHeight - containerRect.height);
  
  setTimeout(() => {
    container.scrollLeft = Math.max(0, Math.min(newScrollX, maxScrollX));
    container.scrollTop = Math.max(0, Math.min(newScrollY, maxScrollY));
  }, 0);
}
