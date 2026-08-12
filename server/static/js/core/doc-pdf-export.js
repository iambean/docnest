(function() {
  var EXPORT_CLASS = 'doc-pdf-export-root';

  function getAssetUrl(path) {
    var base = document.querySelector('base');
    if (base && base.getAttribute('href')) {
      return base.getAttribute('href').replace(/\/?$/, '/') + path.replace(/^\//, '');
    }
    return path;
  }

  function loadScript(src, isReady) {
    if (typeof isReady === 'function' && isReady()) {
      return Promise.resolve();
    }

    return new Promise(function(resolve, reject) {
      var existing = document.querySelector('script[data-dynamic-src="' + src + '"]');
      if (existing) {
        existing.addEventListener('load', function() {
          resolve();
        }, { once: true });
        existing.addEventListener('error', function() {
          reject(new Error('加载脚本失败: ' + src));
        }, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.setAttribute('data-dynamic-src', src);
      script.onload = function() {
        resolve();
      };
      script.onerror = function() {
        reject(new Error('加载脚本失败: ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function ensurePdfLibs() {
    return loadScript(
      getAssetUrl('/vendor/html2canvas/html2canvas.min.js'),
      function() { return typeof window.html2canvas !== 'undefined'; }
    ).then(function() {
      return loadScript(
        getAssetUrl('/vendor/dompurify/purify.min.js'),
        function() { return typeof window.DOMPurify !== 'undefined'; }
      );
    }).then(function() {
      return loadScript(
        getAssetUrl('/vendor/jspdf/jspdf.umd.min.js'),
        function() {
          return typeof window.jspdf !== 'undefined' || typeof window.jsPDF !== 'undefined';
        }
      );
    });
  }

  function getJsPdfCtor() {
    if (typeof window.jspdf !== 'undefined') {
      return window.jspdf.jsPDF || window.jspdf;
    }
    if (typeof window.jsPDF !== 'undefined') {
      return window.jsPDF;
    }
    throw new Error('jsPDF 未正确加载');
  }

  function sanitizeFileName(name) {
    return (name || 'document')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getExportFileName() {
    var currentPath = window.currentDocPath || document.body.getAttribute('data-current-path') || '';
    var name = currentPath.split('/').pop() || document.title || 'document';
    name = name.replace(/\.(md|html)$/i, '');
    name = name.replace(/\s*-\s*文档中心\s*$/i, '');
    return sanitizeFileName(name);
  }

  function removeTransientNodes(root) {
    root.querySelectorAll('.mermaid-download-btn').forEach(function(node) {
      node.remove();
    });
  }

  function createExportRoot(article) {
    var root = document.createElement('div');
    root.className = EXPORT_CLASS;

    var clone = article.cloneNode(true);
    removeTransientNodes(clone);
    root.appendChild(clone);
    document.body.appendChild(root);

    return root;
  }

  function collectBlockBreakpoints(root, canvasScale) {
    var rootRect = root.getBoundingClientRect();
    var selector = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'li', 'blockquote', 'pre', 'table',
      'hr', '.mermaid'
    ].join(',');
    var nodes = Array.prototype.slice.call(root.querySelectorAll(selector));
    var breakpoints = [];
    var seen = new Set();

    nodes.forEach(function(node) {
      var rect = node.getBoundingClientRect();
      if (!rect || rect.height <= 0) return;

      var top = Math.max(0, rect.top - rootRect.top);
      var bottom = Math.max(top, rect.bottom - rootRect.top);
      var key = Math.round(bottom);

      if (seen.has(key)) return;
      seen.add(key);

      breakpoints.push({
        top: Math.round(top * canvasScale),
        bottom: Math.round(bottom * canvasScale),
      });
    });

    breakpoints.sort(function(a, b) {
      return a.bottom - b.bottom;
    });

    return breakpoints;
  }

  function cleanupExportRoot(root) {
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
  }

  function waitForExportReady() {
    var fontReady = document.fonts && document.fonts.ready
      ? document.fonts.ready.catch(function() {})
      : Promise.resolve();

    return fontReady.then(function() {
      return new Promise(function(resolve) {
        requestAnimationFrame(function() {
          requestAnimationFrame(resolve);
        });
      });
    });
  }

  function renderCanvas(root) {
    var width = Math.max(root.scrollWidth, root.offsetWidth, 960);
    var height = Math.max(root.scrollHeight, root.offsetHeight, 1);

    return window.html2canvas(root, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: width,
      height: height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
    });
  }

  function getCanvasContext(canvas) {
    return canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
  }

  function getRowDensityScores(sourceCtx, width, startY, endY) {
    var bandHeight = Math.max(1, endY - startY);
    var imageData = sourceCtx.getImageData(0, startY, width, bandHeight).data;
    var rowStride = width * 4;
    var scores = new Array(bandHeight);

    for (var row = 0; row < bandHeight; row++) {
      var offset = row * rowStride;
      var darkPixelCount = 0;

      for (var x = 0; x < rowStride; x += 4) {
        var r = imageData[offset + x];
        var g = imageData[offset + x + 1];
        var b = imageData[offset + x + 2];

        if (r + g + b < 735) {
          darkPixelCount += 1;
        }
      }

      scores[row] = darkPixelCount / width;
    }

    return scores;
  }

  function findBreakByBlocks(blockBreakpoints, startY, preferredHeight) {
    if (!blockBreakpoints || blockBreakpoints.length === 0) return null;

    var idealBreakY = startY + preferredHeight;
    var minBreakY = startY + Math.max(160, Math.floor(preferredHeight * 0.7));
    var candidate = null;

    for (var i = 0; i < blockBreakpoints.length; i++) {
      var breakpoint = blockBreakpoints[i];
      var candidates = [breakpoint.top, breakpoint.bottom];

      for (var j = 0; j < candidates.length; j++) {
        var edge = candidates[j];
        if (edge <= minBreakY) {
          continue;
        }
        if (edge > idealBreakY) {
          break;
        }
        candidate = edge;
      }
      if (breakpoint.top > idealBreakY || breakpoint.bottom > idealBreakY) {
        break;
      }
    }

    return candidate ? candidate - startY : null;
  }

  function findBestPageBreak(canvas, sourceCtx, startY, preferredHeight) {
    var idealBreakY = Math.min(startY + preferredHeight, canvas.height);
    var minBreakY = Math.max(startY + Math.floor(preferredHeight * 0.72), startY + 80);
    var searchRadius = Math.min(180, Math.max(72, Math.floor(preferredHeight * 0.12)));
    var searchStartY = Math.max(minBreakY, idealBreakY - searchRadius);
    var searchEndY = Math.min(canvas.height, idealBreakY + searchRadius);

    if (searchEndY <= searchStartY + 4) {
      return idealBreakY - startY;
    }

    var rowScores = getRowDensityScores(sourceCtx, canvas.width, searchStartY, searchEndY);
    var lowDensityThreshold = 0.0015;
    var minBandHeight = 10;
    var bestBand = null;
    var bandStart = -1;

    for (var row = 0; row <= rowScores.length; row++) {
      var isLowDensity = row < rowScores.length && rowScores[row] <= lowDensityThreshold;

      if (isLowDensity && bandStart === -1) {
        bandStart = row;
      }

      if ((!isLowDensity || row === rowScores.length) && bandStart !== -1) {
        var bandEnd = row - 1;
        var bandHeight = bandEnd - bandStart + 1;

        if (bandHeight >= minBandHeight) {
          var bandCenter = searchStartY + bandStart + Math.floor(bandHeight / 2);
          var bandDistance = Math.abs(bandCenter - idealBreakY);

          if (!bestBand || bandDistance < bestBand.distance || (bandDistance === bestBand.distance && bandHeight > bestBand.height)) {
            bestBand = {
              center: bandCenter,
              distance: bandDistance,
              height: bandHeight,
            };
          }
        }

        bandStart = -1;
      }
    }

    if (bestBand) {
      return Math.max(minBreakY - startY, bestBand.center - startY);
    }

    var bestRow = idealBreakY - searchStartY;
    var bestScore = Number.POSITIVE_INFINITY;
    var bestDistance = Number.POSITIVE_INFINITY;

    for (var rowIndex = 0; rowIndex < rowScores.length; rowIndex++) {
      var windowStart = Math.max(0, rowIndex - 4);
      var windowEnd = Math.min(rowScores.length - 1, rowIndex + 4);
      var total = 0;
      var count = 0;

      for (var i = windowStart; i <= windowEnd; i++) {
        total += rowScores[i];
        count += 1;
      }

      var score = total / count;
      var candidateY = searchStartY + rowIndex;
      var distance = Math.abs(candidateY - idealBreakY);

      if (score < bestScore - 0.0001 || (Math.abs(score - bestScore) <= 0.0001 && distance < bestDistance)) {
        bestScore = score;
        bestDistance = distance;
        bestRow = rowIndex;
      }
    }

    return Math.max(minBreakY - startY, searchStartY + bestRow - startY);
  }

  function addCanvasToPdf(pdf, canvas, margin, blockBreakpoints, watermarkEnabled, watermarkText) {
    var pageWidth = pdf.internal.pageSize.getWidth();
    var pageHeight = pdf.internal.pageSize.getHeight();
    var usableWidth = pageWidth - margin * 2;
    var usableHeight = pageHeight - margin * 2;
    var pageCanvasHeight = Math.max(
      1,
      Math.floor((usableHeight * canvas.width) / usableWidth)
    );
    var sourceCtx = getCanvasContext(canvas);
    var offsetY = 0;
    var pageIndex = 0;

    while (offsetY < canvas.height) {
      var remainingHeight = canvas.height - offsetY;
      var sliceHeight;

      if (remainingHeight <= pageCanvasHeight) {
        sliceHeight = remainingHeight;
      } else {
        sliceHeight = findBreakByBlocks(blockBreakpoints, offsetY, pageCanvasHeight);
        if (!sliceHeight) {
          sliceHeight = findBestPageBreak(canvas, sourceCtx, offsetY, pageCanvasHeight);
        }
      }
      var pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;

      var context = getCanvasContext(pageCanvas);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(
        canvas,
        0,
        offsetY,
        canvas.width,
        sliceHeight,
        0,
        0,
        canvas.width,
        sliceHeight
      );

      if (watermarkEnabled) {
        drawWatermarkPattern(context, pageCanvas.width, pageCanvas.height, pageCanvasHeight, watermarkText);
      }

      if (pageIndex > 0) {
        pdf.addPage();
      }

      var imageHeight = (sliceHeight * usableWidth) / canvas.width;
      pdf.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        margin,
        margin,
        usableWidth,
        imageHeight,
        undefined,
        'FAST'
      );

      offsetY += sliceHeight;
      pageIndex += 1;
    }
  }

  function drawWatermarkPattern(context, width, height, referenceHeight, watermarkText) {
    if (!watermarkText) return;
    var tileWidth = width / 4;
    var tileHeight = referenceHeight / 2;
    var fontSize = Math.round(Math.min(tileWidth, tileHeight) * 0.38);
    var startX = tileWidth / 2;
    var startY = tileHeight / 2;

    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(30, 41, 59, 0.055)';
    context.font = '700 ' + fontSize + 'px "PingFang SC", "Microsoft YaHei", sans-serif';

    for (var y = startY; y < height + tileHeight; y += tileHeight) {
      var rowOffsetX = Math.round(((y - startY) / tileHeight) % 2) * (tileWidth / 2);
      for (var x = startX; x < width + tileWidth; x += tileWidth) {
        context.save();
        context.translate(x + rowOffsetX, y);
        context.rotate(-Math.PI / 5.4);
        context.fillText(watermarkText, 0, 0);
        context.restore();
      }
    }

    context.restore();
  }

  function openPdfExportDialog() {
    return new Promise(function(resolve) {
      var config = window.DOCNEST_CONFIG || {};
      var defaultWatermarkEnabled = config.watermarkEnabled === true;
      var defaultWatermarkText = String(config.watermarkText || document.title || '');
      var modalId = 'pdf-export-modal';
      var overlay = document.createElement('div');
      overlay.className = 'pdf-export-modal';
      overlay.innerHTML = [
        '<div class="pdf-export-modal__panel" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title">',
          '<div class="pdf-export-modal__title" id="pdf-export-title">下载 PDF</div>',
          '<div class="pdf-export-modal__desc">导出前确认本次 PDF 是否需要水印；本次修改不会写回项目配置。</div>',
          '<label class="pdf-export-modal__option">',
            '<input type="checkbox" id="pdf-export-watermark-checkbox">',
            '<span class="pdf-export-modal__option-text">启用水印</span>',
          '</label>',
          '<label class="pdf-export-modal__watermark-field" for="pdf-export-watermark-text">水印文字</label>',
          '<input class="pdf-export-modal__watermark-input" id="pdf-export-watermark-text" type="text" maxlength="80">',
          '<div class="pdf-export-modal__actions">',
            '<button type="button" class="pdf-export-modal__btn" data-action="cancel">取消</button>',
            '<button type="button" class="pdf-export-modal__btn pdf-export-modal__btn--primary" data-action="confirm">确认下载</button>',
          '</div>',
        '</div>'
      ].join('');

      function close(result) {
        if (typeof removeModal === 'function') {
          removeModal(modalId);
        }
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        resolve(result);
      }

      overlay.addEventListener('click', function(event) {
        if (event.target === overlay) {
          close(null);
        }
      });

      overlay.querySelector('[data-action="cancel"]').addEventListener('click', function() {
        close(null);
      });

      overlay.querySelector('[data-action="confirm"]').addEventListener('click', function() {
        var checkbox = overlay.querySelector('#pdf-export-watermark-checkbox');
        var watermarkInput = overlay.querySelector('#pdf-export-watermark-text');
        close({
          watermarkEnabled: !!(checkbox && checkbox.checked),
          watermarkText: watermarkInput ? watermarkInput.value.trim() : defaultWatermarkText,
        });
      });

      document.body.appendChild(overlay);
      if (typeof pushModal === 'function') {
        pushModal(modalId, function() {
          close(null);
        });
      }

      var checkbox = overlay.querySelector('#pdf-export-watermark-checkbox');
      if (checkbox) {
        checkbox.checked = defaultWatermarkEnabled;
        checkbox.addEventListener('change', function() {
          var watermarkInput = overlay.querySelector('#pdf-export-watermark-text');
          if (watermarkInput) watermarkInput.disabled = !checkbox.checked;
        });
        checkbox.focus();
      }
      var watermarkInput = overlay.querySelector('#pdf-export-watermark-text');
      if (watermarkInput) {
        watermarkInput.value = defaultWatermarkText;
        watermarkInput.disabled = !defaultWatermarkEnabled;
      }
    });
  }

  function showPdfExportError(message) {
    var modalId = 'pdf-export-error';
    var existing = document.querySelector('.pdf-export-error');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    if (typeof removeModal === 'function') {
      removeModal(modalId);
    }

    var overlay = document.createElement('div');
    overlay.className = 'pdf-export-modal pdf-export-error';
    overlay.innerHTML = [
      '<div class="pdf-export-modal__panel" role="alertdialog" aria-modal="true" aria-labelledby="pdf-export-error-title" aria-describedby="pdf-export-error-desc">',
        '<div class="pdf-export-modal__title" id="pdf-export-error-title">导出 PDF 失败</div>',
        '<div class="pdf-export-modal__desc" id="pdf-export-error-desc"></div>',
        '<div class="pdf-export-modal__actions">',
          '<button type="button" class="pdf-export-modal__btn pdf-export-modal__btn--primary" data-action="close">知道了</button>',
        '</div>',
      '</div>'
    ].join('');

    var description = overlay.querySelector('#pdf-export-error-desc');
    if (description) {
      description.textContent = message || '暂时无法生成 PDF，请稍后重试。';
    }

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (typeof removeModal === 'function') {
        removeModal(modalId);
      }
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }

    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) {
        close();
      }
    });

    var closeButton = overlay.querySelector('[data-action="close"]');
    if (closeButton) {
      closeButton.addEventListener('click', close);
    }

    document.body.appendChild(overlay);
    if (typeof pushModal === 'function') {
      pushModal(modalId, close);
    }
    if (closeButton) {
      closeButton.focus();
    }
  }

  function setButtonLoading(button, loading) {
    if (!button) return;
    if (loading) {
      button.disabled = true;
      button.classList.add('is-loading');
      button.dataset.originalText = button.querySelector('.header-action-text')
        ? button.querySelector('.header-action-text').textContent || ''
        : '';
      var loadingText = button.querySelector('.header-action-text');
      if (loadingText) loadingText.textContent = '导出中...';
      return;
    }

    button.disabled = false;
    button.classList.remove('is-loading');
    var text = button.querySelector('.header-action-text');
    if (text && button.dataset.originalText) {
      text.textContent = button.dataset.originalText;
    }
  }

  function exportCurrentDoc(button, options) {
    var article = document.querySelector('.main-content .markdown-body');
    if (!article) {
      showPdfExportError('未找到当前文档内容，无法导出 PDF。');
      return;
    }

    setButtonLoading(button, true);

    ensurePdfLibs()
      .then(function() {
        var JsPdf = getJsPdfCtor();
        var exportRoot = createExportRoot(article);
        var margin = 12;
        var pdf = new JsPdf({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
          compress: true,
        });
        var config = window.DOCNEST_CONFIG || {};
        var watermarkEnabled = options && typeof options.watermarkEnabled === 'boolean'
          ? options.watermarkEnabled
          : config.watermarkEnabled === true;
        var watermarkText = options && options.watermarkText
          ? options.watermarkText
          : String(config.watermarkText || document.title || '');

        return waitForExportReady()
          .then(function() {
            return renderCanvas(exportRoot);
          })
          .then(function(canvas) {
            var blockBreakpoints = collectBlockBreakpoints(exportRoot, canvas.height / Math.max(exportRoot.scrollHeight, 1));
            addCanvasToPdf(pdf, canvas, margin, blockBreakpoints, watermarkEnabled, watermarkText);
            pdf.save(getExportFileName() + '.pdf');
          })
          .finally(function() {
            cleanupExportRoot(exportRoot);
          });
      })
      .catch(function(error) {
        console.error('导出 PDF 失败:', error);
        showPdfExportError('暂时无法生成 PDF，请稍后重试。');
      })
      .finally(function() {
        setButtonLoading(button, false);
      });
  }

  function init() {
    var button = document.getElementById('download-doc-pdf-btn');
    if (!button) return;

    button.addEventListener('click', function() {
      openPdfExportDialog().then(function(result) {
        if (!result) return;
        exportCurrentDoc(button, result);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
