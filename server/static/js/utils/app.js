// 主入口文件 - 保留必要的初始化逻辑
// 注意：此文件在所有模块加载后执行

// 全局变量已在 diagram-viewer.js 中定义
// 这里只保留必要的初始化逻辑

// 确保所有模块都已加载后再执行初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('文档已加载，所有模块已初始化');
  });
} else {
  console.log('文档已就绪，所有模块已初始化');
}
