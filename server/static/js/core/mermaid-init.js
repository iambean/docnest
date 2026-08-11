// Mermaid 初始化
(function() {
  if (typeof mermaid === 'undefined') return;
  
  // 初始化函数，在 DOM 加载完成后执行
  function initMermaid() {
    // 安全地获取主题，如果 body 不存在则使用默认值
    const initialTheme = (document.body && document.body.getAttribute('data-theme')) || 'light';
    
    mermaid.initialize({ 
      startOnLoad: true, 
      theme: initialTheme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true
      }
    });
    
    // 手动渲染所有 Mermaid 图表
    mermaid.run().then(() => {
      // 为所有 Mermaid 图表添加点击事件
      if (typeof setupDiagramViewer === 'function') {
        setupDiagramViewer();
      }
    });
  }
  
  // 确保在 DOM 加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMermaid);
  } else {
    // DOM 已经加载完成，直接执行
    initMermaid();
  }
})();
