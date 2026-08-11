// 图表下载和复制功能
function downloadCurrentDiagram() {
  if (!currentSvg) return;
  // 获取原始 SVG（移除缩放样式）
  const originalSvg = currentSvg.cloneNode(true);
  originalSvg.style.transform = '';
  originalSvg.style.width = '';
  originalSvg.style.height = '';
  showDownloadMenu(originalSvg, 'diagram');
}

function copyCurrentDiagram() {
  if (!currentSvg) return;
  
  // 获取原始 SVG（移除缩放样式）
  const originalSvg = currentSvg.cloneNode(true);
  originalSvg.style.transform = '';
  originalSvg.style.width = '';
  originalSvg.style.height = '';
  
  copyDiagramToClipboard(originalSvg);
}

function copyDiagramToClipboard(svg) {
  // 获取 SVG 的真实尺寸
  const svgClone = svg.cloneNode(true);
  let viewBox = svgClone.getAttribute('viewBox');
  let svgWidth, svgHeight;
  
  // 优先从 viewBox 获取尺寸
  if (viewBox) {
    const parts = viewBox.split(/\s+/);
    if (parts.length >= 4) {
      svgWidth = parseFloat(parts[2]);
      svgHeight = parseFloat(parts[3]);
    }
  }
  
  // 如果没有 viewBox，尝试从属性获取
  if (!svgWidth || !svgHeight || isNaN(svgWidth) || isNaN(svgHeight)) {
    svgWidth = parseFloat(svgClone.getAttribute('width')) || 800;
    svgHeight = parseFloat(svgClone.getAttribute('height')) || 600;
  }
  
  // 确保 SVG 有明确的尺寸属性
  svgClone.setAttribute('width', svgWidth);
  svgClone.setAttribute('height', svgHeight);
  if (!viewBox) {
    svgClone.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  }
  
  // 清理 SVG
  cleanSVG(svgClone);
  
  const svgData = new XMLSerializer().serializeToString(svgClone);
  const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
  
  const img = new Image();
  img.onload = function() {
    try {
      // 使用高分辨率（2倍缩放，平衡清晰度和文件大小）
      const scale = 2;
      const padding = 20;
      const canvasWidth = Math.round(svgWidth * scale + padding * 2);
      const canvasHeight = Math.round(svgHeight * scale + padding * 2);
      
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('无法创建 Canvas 上下文');
      }
      
      // 禁用图像平滑（保持锐利边缘）
      ctx.imageSmoothingEnabled = false;
      
      // 白色背景
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 绘制图片
      ctx.drawImage(img, padding, padding, svgWidth * scale, svgHeight * scale);
      
      // 转换为 Blob 并复制到剪贴板
      canvas.toBlob(function(blob) {
        if (!blob) {
          showCopyNotification('复制失败，请重试', false);
          return;
        }
        
        // 使用 Clipboard API 复制图片
        if (navigator.clipboard && navigator.clipboard.write) {
          const item = new ClipboardItem({
            'image/png': blob
          });
          
          navigator.clipboard.write([item]).then(function() {
            showCopyNotification('图片已复制到剪贴板', true);
          }).catch(function(error) {
            console.error('复制失败:', error);
            // 降级方案：尝试使用 execCommand
            fallbackCopyToClipboard(canvas);
          });
        } else {
          // 降级方案：使用 execCommand
          fallbackCopyToClipboard(canvas);
        }
      }, 'image/png', 1.0);
    } catch (error) {
      console.error('复制失败:', error);
      showCopyNotification('复制失败，请重试', false);
    }
  };
  img.onerror = function() {
    showCopyNotification('图片加载失败，请重试', false);
  };
  img.src = svgDataUrl;
}

// 降级方案：使用 execCommand 复制
function fallbackCopyToClipboard(canvas) {
  try {
    // 将 Canvas 转换为 Data URL
    const dataUrl = canvas.toDataURL('image/png');
    
    // 创建一个临时图片元素
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.position = 'fixed';
    img.style.left = '-9999px';
    document.body.appendChild(img);
    
    // 选中图片
    const range = document.createRange();
    range.selectNode(img);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    
    // 尝试复制
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        showCopyNotification('图片已复制到剪贴板', true);
      } else {
        showCopyNotification('复制失败，请使用下载功能', false);
      }
    } catch (err) {
      showCopyNotification('复制失败，请使用下载功能', false);
    }
    
    // 清理
    selection.removeAllRanges();
    document.body.removeChild(img);
  } catch (error) {
    console.error('降级复制失败:', error);
    showCopyNotification('复制失败，请使用下载功能', false);
  }
}

// 显示复制通知
function showCopyNotification(message, success) {
  // 移除已存在的通知
  const existingNotification = document.querySelector('.copy-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${success ? '#4CAF50' : '#f44336'};
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 20001;
    font-size: 14px;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 2000);
}

// 下载功能
function showDownloadMenu(svgElement, defaultName) {
  const menu = document.createElement('div');
  menu.className = 'download-menu';
  menu.id = 'download-menu';
  menu.innerHTML = `
    <div class="download-menu-content">
      <h3>选择下载格式</h3>
      <button onclick="downloadDiagram('png', '${defaultName}')">📷 PNG 图片</button>
      <button onclick="downloadDiagram('svg', '${defaultName}')">📄 SVG 矢量图</button>
      <button onclick="downloadDiagram('pdf', '${defaultName}')">📑 PDF 文档</button>
      <button onclick="closeDownloadMenu()" class="cancel-btn">取消</button>
    </div>
  `;
  
  // 保存 SVG 到全局变量供下载函数使用
  window.currentDownloadSvg = svgElement;
  window.currentDownloadName = defaultName;
  
  document.body.appendChild(menu);
  
  // 将下载菜单加入弹窗栈
  if (typeof pushModal === 'function') {
    pushModal('download-menu', closeDownloadMenu);
  }
  
  // 点击外部关闭
  menu.addEventListener('click', function(e) {
    if (e.target === menu) {
      closeDownloadMenu();
    }
  });
}

function closeDownloadMenu() {
  const menu = document.querySelector('.download-menu');
  if (menu) {
    document.body.removeChild(menu);
  }
  window.currentDownloadSvg = null;
  window.currentDownloadName = null;
  
  // 从弹窗栈中移除
  if (typeof removeModal === 'function') {
    removeModal('download-menu');
  }
}

function downloadDiagram(format, name) {
  const svg = window.currentDownloadSvg;
  if (!svg) return;
  
  closeDownloadMenu();
  
  switch (format) {
    case 'png':
      downloadAsPNG(svg, name);
      break;
    case 'svg':
      downloadAsSVG(svg, name);
      break;
    case 'pdf':
      downloadAsPDF(svg, name);
      break;
  }
}

function downloadAsPNG(svg, name) {
  // 获取 SVG 的真实尺寸（从 viewBox 或实际渲染尺寸）
  const svgClone = svg.cloneNode(true);
  let viewBox = svgClone.getAttribute('viewBox');
  let svgWidth, svgHeight;
  
  // 优先从 viewBox 获取尺寸（这是 SVG 的真实尺寸）
  if (viewBox) {
    const parts = viewBox.split(/\s+/);
    if (parts.length >= 4) {
      svgWidth = parseFloat(parts[2]);
      svgHeight = parseFloat(parts[3]);
    }
  }
  
  // 如果没有 viewBox，尝试从属性获取
  if (!svgWidth || !svgHeight) {
    svgWidth = parseFloat(svgClone.getAttribute('width')) || 800;
    svgHeight = parseFloat(svgClone.getAttribute('height')) || 600;
  }
  
  // 确保 SVG 有明确的尺寸属性
  svgClone.setAttribute('width', svgWidth);
  svgClone.setAttribute('height', svgHeight);
  if (!viewBox) {
    svgClone.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  }
  
  // 清理 SVG，移除可能导致污染的外部引用
  cleanSVG(svgClone);
  
  const svgData = new XMLSerializer().serializeToString(svgClone);
  // 使用 Data URL 代替 Blob URL，避免 Canvas 污染
  const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
  
  const img = new Image();
  img.onload = function() {
    try {
      // 使用超高分辨率（4倍缩放，相当于 600 DPI，适合打印）
      const scale = 4; // 4倍分辨率
      const padding = 40; // 添加边距（像素）
      const canvasWidth = Math.round(svgWidth * scale + padding * 2);
      const canvasHeight = Math.round(svgHeight * scale + padding * 2);
      
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('无法创建 Canvas 上下文');
      }
      
      // 禁用图像平滑（对于矢量图，保持锐利边缘更好）
      ctx.imageSmoothingEnabled = false;
      
      // 白色背景
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 绘制图片（放大4倍）
      ctx.drawImage(img, padding, padding, svgWidth * scale, svgHeight * scale);
      
      // 下载（使用最高质量）
      canvas.toBlob(function(blob) {
        if (!blob) {
          alert('图片生成失败，请重试');
          return;
        }
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${name}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      }, 'image/png', 1.0); // 最高质量
    } catch (error) {
      console.error('PNG 生成失败:', error);
      alert('图片生成失败，请重试');
    }
  };
  img.onerror = function() {
    alert('图片加载失败，请重试');
  };
  img.src = svgDataUrl;
}

function downloadAsSVG(svg, name) {
  // 确保 SVG 有正确的命名空间和格式
  const svgClone = svg.cloneNode(true);
  if (!svgClone.getAttribute('xmlns')) {
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  if (!svgClone.getAttribute('xmlns:xlink')) {
    svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  
  const svgData = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 清理 SVG，移除可能导致 Canvas 污染的外部引用
function cleanSVG(svg) {
  // 移除所有外部资源引用
  const images = svg.querySelectorAll('image');
  images.forEach(img => {
    const href = img.getAttribute('href') || img.getAttribute('xlink:href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      img.remove();
    }
  });
  
  // 移除外部样式表引用
  const styleSheets = svg.querySelectorAll('style');
  styleSheets.forEach(style => {
    const content = style.textContent || '';
    if (content.includes('@import') || content.includes('url(')) {
      // 移除包含外部引用的样式
      style.remove();
    }
  });
  
  // 确保 SVG 有正确的命名空间
  if (!svg.getAttribute('xmlns')) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
}

function downloadAsPDF(svg, name) {
  // 获取 SVG 的真实尺寸（从 viewBox 或实际渲染尺寸）
  const svgClone = svg.cloneNode(true);
  let viewBox = svgClone.getAttribute('viewBox');
  let svgWidth, svgHeight;
  
  // 优先从 viewBox 获取尺寸（这是 SVG 的真实尺寸）
  if (viewBox) {
    const parts = viewBox.split(/\s+/);
    if (parts.length >= 4) {
      svgWidth = parseFloat(parts[2]);
      svgHeight = parseFloat(parts[3]);
    }
  }
  
  // 如果没有 viewBox，尝试从属性获取
  if (!svgWidth || !svgHeight) {
    svgWidth = parseFloat(svgClone.getAttribute('width')) || 800;
    svgHeight = parseFloat(svgClone.getAttribute('height')) || 600;
  }
  
  // 确保 SVG 有明确的尺寸属性
  svgClone.setAttribute('width', svgWidth);
  svgClone.setAttribute('height', svgHeight);
  if (!viewBox) {
    svgClone.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  }
  
  // 清理 SVG，移除可能导致污染的外部引用
  cleanSVG(svgClone);
  
  const svgData = new XMLSerializer().serializeToString(svgClone);
  // 使用 Data URL 代替 Blob URL，避免 Canvas 污染
  const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
  
  const img = new Image();
  img.onload = function() {
    try {
      // 使用超高分辨率（4倍缩放，相当于 600 DPI，适合打印）
      const scale = 4; // 4倍分辨率
      const padding = 40; // 添加边距（像素）
      const canvasWidth = Math.round(svgWidth * scale + padding * 2);
      const canvasHeight = Math.round(svgHeight * scale + padding * 2);
      
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('无法创建 Canvas 上下文');
      }
      
      // 禁用图像平滑（对于矢量图，保持锐利边缘更好）
      ctx.imageSmoothingEnabled = false;
      
      // 白色背景
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 绘制图片（放大4倍）
      ctx.drawImage(img, padding, padding, svgWidth * scale, svgHeight * scale);
      
      // 限制最大尺寸，避免 PDF 生成失败
      const maxWidth = 8000; // 提高最大尺寸限制（4倍分辨率）
      const maxHeight = 8000;
      let finalCanvas = canvas;
      if (canvas.width > maxWidth || canvas.height > maxHeight) {
        const scaleDown = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = Math.floor(canvas.width * scaleDown);
        scaledCanvas.height = Math.floor(canvas.height * scaleDown);
        const scaledCtx = scaledCanvas.getContext('2d');
        if (scaledCtx) {
          scaledCtx.imageSmoothingEnabled = false;
          scaledCtx.fillStyle = 'white';
          scaledCtx.fillRect(0, 0, scaledCanvas.width, scaledCanvas.height);
          scaledCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
          finalCanvas = scaledCanvas;
        }
      }
      
      // 使用 toBlob 获取图片数据（最高质量）
      finalCanvas.toBlob(function(blob) {
        if (!blob) {
          // 如果 toBlob 失败，尝试降级方案
          generatePDFFallback(finalCanvas, name);
          return;
        }
        
        // 将 Blob 转换为 Data URL 用于 PDF
        const reader = new FileReader();
        reader.onload = function() {
          const imgData = reader.result;
          
          // 动态加载 jsPDF（本地 /vendor/jspdf，支持 base 路径）
          if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
            const script = document.createElement('script');
            var base = document.querySelector('base');
            script.src = (base && base.getAttribute('href'))
              ? (base.getAttribute('href').replace(/\/?$/, '/') + 'vendor/jspdf/jspdf.umd.min.js')
              : '/vendor/jspdf/jspdf.umd.min.js';
            script.onload = function() {
              generatePDFFromBlob(imgData, finalCanvas, name);
            };
            script.onerror = function() {
              alert('加载 PDF 库失败，请检查网络连接。建议下载 PNG 格式。');
            };
            document.head.appendChild(script);
          } else {
            generatePDFFromBlob(imgData, finalCanvas, name);
          }
        };
        reader.onerror = function() {
          generatePDFFallback(finalCanvas, name);
        };
        reader.readAsDataURL(blob);
      }, 'image/png', 1.0); // 最高质量
    } catch (error) {
      console.error('Canvas 处理失败:', error);
      alert('处理图片失败，请尝试下载 PNG 格式');
    }
  };
  img.onerror = function() {
    alert('图片加载失败，请重试');
  };
  img.src = svgDataUrl;
}

function generatePDFFromBlob(imgData, canvas, name) {
  try {
    // 尝试多种方式获取 jsPDF
    let jsPDF;
    if (typeof window.jspdf !== 'undefined') {
      // UMD 格式
      jsPDF = window.jspdf.jsPDF || (window.jspdf.default && window.jspdf.default.jsPDF) || window.jspdf;
    } else if (typeof window.jsPDF !== 'undefined') {
      // 直接暴露的格式
      jsPDF = window.jsPDF;
    } else {
      throw new Error('jsPDF 库未正确加载');
    }
    
    // 使用 mm 单位，更稳定
    const pdfWidth = (canvas.width * 0.264583).toFixed(2); // px to mm
    const pdfHeight = (canvas.height * 0.264583).toFixed(2);
    
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [parseFloat(pdfWidth), parseFloat(pdfHeight)]
    });
    
    if (!imgData || imgData === 'data:,') {
      throw new Error('图片数据无效');
    }
    
    // 使用高质量压缩（SLOW 模式，但质量更好）
    pdf.addImage(imgData, 'PNG', 0, 0, parseFloat(pdfWidth), parseFloat(pdfHeight), undefined, 'SLOW');
    pdf.save(`${name}.pdf`);
  } catch (error) {
    console.error('生成 PDF 失败:', error);
    generatePDFFallback(canvas, name);
  }
}

function generatePDFFallback(canvas, name) {
  // 降级方案：直接下载 PNG（高质量）
  try {
    canvas.toBlob(function(blob) {
      if (blob) {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${name}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        alert('PDF 生成失败，已自动下载为 PNG 格式');
      } else {
        alert('PDF 生成失败，请尝试直接下载 PNG 格式');
      }
    }, 'image/png', 1.0); // 最高质量
  } catch (error) {
    console.error('PNG 下载也失败:', error);
    alert('PDF 生成失败，请尝试直接下载 PNG 格式');
  }
}
