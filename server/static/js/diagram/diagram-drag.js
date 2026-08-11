// 图表拖拽功能
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartScrollX = 0;
let dragStartScrollY = 0;
let dragMouseDownHandler = null;
let dragMouseMoveHandler = null;
let dragMouseUpHandler = null;
let dragAnimationFrameId = null;
let lastMouseX = 0;
let lastMouseY = 0;

function setupDragPan() {
  const container = document.getElementById('diagram-viewer-svg-container');
  if (!container) return;
  
  dragMouseDownHandler = function(e) {
    // 只响应左键按下
    if (e.button !== 0) return;
    
    // 如果点击的是控制按钮，不启动拖拽
    if (e.target.closest('.diagram-viewer-controls')) return;
    
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    dragStartScrollX = container.scrollLeft;
    dragStartScrollY = container.scrollTop;
    
    // 改变鼠标样式
    container.style.cursor = 'grabbing';
    container.style.userSelect = 'none';
    
    // 阻止默认行为
    e.preventDefault();
  };
  
  dragMouseMoveHandler = function(e) {
    if (!isDragging) return;
    
    // 更新最新的鼠标位置
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    
    // 如果已经有待处理的动画帧，取消它
    if (dragAnimationFrameId !== null) {
      cancelAnimationFrame(dragAnimationFrameId);
    }
    
    // 使用 requestAnimationFrame 来优化性能
    dragAnimationFrameId = requestAnimationFrame(function() {
      if (!isDragging) return;
      
      const container = document.getElementById('diagram-viewer-svg-container');
      if (!container) return;
      
      // 计算鼠标移动距离
      const deltaX = lastMouseX - dragStartX;
      const deltaY = lastMouseY - dragStartY;
      
      // 计算新的滚动位置（反向移动，实现拖拽效果）
      const newScrollX = dragStartScrollX - deltaX;
      const newScrollY = dragStartScrollY - deltaY;
      
      // 限制滚动范围
      const wrapper = container.querySelector('.diagram-viewer-svg-wrapper');
      if (wrapper) {
        const containerRect = container.getBoundingClientRect();
        // 使用包装元素的实际尺寸来计算最大滚动范围
        // 优先使用 style.width/height（更准确），否则使用 offsetWidth/Height
        const wrapperWidth = parseFloat(wrapper.style.width) || wrapper.offsetWidth || 0;
        const wrapperHeight = parseFloat(wrapper.style.height) || wrapper.offsetHeight || 0;
        
        // 计算最大滚动范围：包装元素尺寸 - 容器可视区域尺寸
        // 这样可以确保能滚动到所有边界（包括 padding 区域）
        const maxScrollX = Math.max(0, wrapperWidth - containerRect.width);
        const maxScrollY = Math.max(0, wrapperHeight - containerRect.height);
        
        // 确保滚动位置在有效范围内
        container.scrollLeft = Math.max(0, Math.min(newScrollX, maxScrollX));
        container.scrollTop = Math.max(0, Math.min(newScrollY, maxScrollY));
      } else {
        // 如果没有包装元素，使用原来的逻辑
        container.scrollLeft = newScrollX;
        container.scrollTop = newScrollY;
      }
      
      dragAnimationFrameId = null;
    });
    
    // 阻止默认行为
    e.preventDefault();
  };
  
  dragMouseUpHandler = function(e) {
    if (!isDragging) return;
    
    // 取消待处理的动画帧
    if (dragAnimationFrameId !== null) {
      cancelAnimationFrame(dragAnimationFrameId);
      dragAnimationFrameId = null;
    }
    
    isDragging = false;
    
    // 恢复鼠标样式
    const container = document.getElementById('diagram-viewer-svg-container');
    if (container) {
      container.style.cursor = '';
      container.style.userSelect = '';
    }
  };
  
  // 添加事件监听器
  container.addEventListener('mousedown', dragMouseDownHandler);
  document.addEventListener('mousemove', dragMouseMoveHandler);
  document.addEventListener('mouseup', dragMouseUpHandler);
  
  // 鼠标离开窗口时也要释放拖拽
  document.addEventListener('mouseleave', dragMouseUpHandler);
}

function removeDragPan() {
  const container = document.getElementById('diagram-viewer-svg-container');
  
  // 取消待处理的动画帧
  if (dragAnimationFrameId !== null) {
    cancelAnimationFrame(dragAnimationFrameId);
    dragAnimationFrameId = null;
  }
  
  if (container && dragMouseDownHandler) {
    container.removeEventListener('mousedown', dragMouseDownHandler);
    dragMouseDownHandler = null;
  }
  
  if (dragMouseMoveHandler) {
    document.removeEventListener('mousemove', dragMouseMoveHandler);
    dragMouseMoveHandler = null;
  }
  
  if (dragMouseUpHandler) {
    document.removeEventListener('mouseup', dragMouseUpHandler);
    document.removeEventListener('mouseleave', dragMouseUpHandler);
    dragMouseUpHandler = null;
  }
  
  // 重置状态
  isDragging = false;
  if (container) {
    container.style.cursor = '';
    container.style.userSelect = '';
  }
}
