// This file is intentionally kept close to the proven document-center runtime
// while the public package is extracted. The typed configuration and CLI are
// the stable public boundary; the browser assets remain framework-free.
// @ts-nocheck
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const chokidar = require('chokidar');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');

const app = express();
const server = createServer(app);
const io = new Server(server);
const HOST = process.env.DOCS_HOST || '127.0.0.1';
const PORT_START = Number(process.env.DOCS_PORT_START) || 3000;
const PORT_FALLBACK_ENABLED = process.env.DOCS_PORT_FALLBACK !== 'false';
const ASSET_VERSION = process.env.ASSET_VERSION || 'dev';
const WATCH_ENABLED =
  process.env.DOCS_WATCH_ENABLED === undefined
    ? true
    : process.env.DOCS_WATCH_ENABLED === 'true';
const OPEN_BROWSER = process.env.DOCS_OPEN_BROWSER !== 'false';
const DOCS_TITLE = process.env.DOCS_TITLE || 'DocNest';
const DOCS_SUBTITLE = process.env.DOCS_SUBTITLE || '本地 Markdown 文档服务';
const DOCS_LOGO = process.env.DOCS_LOGO || '';
const DOCS_STORAGE_KEY_PREFIX = process.env.DOCS_STORAGE_KEY_PREFIX || 'docnest';
const DOCS_WATERMARK_ENABLED = process.env.DOCS_WATERMARK_ENABLED === 'true';
const DOCS_WATERMARK_TEXT = process.env.DOCS_WATERMARK_TEXT || DOCS_TITLE;
const DOCS_DIR = path.resolve(process.env.DOCS_ROOT || path.join(process.cwd(), 'docs'));
const ROOT_DIRECTORY_ORDER = (() => {
  try {
    const parsed = JSON.parse(process.env.DOCS_ROOT_DIRECTORY_ORDER || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
})();
const SERVER_DIR = path.join(__dirname, '..', 'server');
const PROJECT_NODE_MODULES_DIR = path.join(process.cwd(), 'node_modules');
function dependencyDir(packageName, fallbackName) {
  try {
    return path.dirname(require.resolve(packageName));
  } catch {
    return path.join(PROJECT_NODE_MODULES_DIR, fallbackName || packageName);
  }
}
const MERMAID_DIR = dependencyDir('mermaid');
const MARKDOWN_THEME_DIR = dependencyDir('github-markdown-css');
const HTML2CANVAS_DIR = dependencyDir('html2canvas');
const DOMPURIFY_DIR = dependencyDir('dompurify');
const JSPDF_DIR = dependencyDir('jspdf');
// Projects may provide their own document source (for example, an object-store
// backed source) without taking the generic viewer back into project-specific
// infrastructure. The adapter is installed before importing this module.
const injectedDocumentStore = globalThis.__DOCNEST_DOCUMENT_STORE__ || null;
const STORAGE_DRIVER = injectedDocumentStore?.name || 'local';
const DOCS_ROOT_LABEL = injectedDocumentStore?.rootLabel || DOCS_DIR;
const AUTH_ENABLED = globalThis.__DOCNEST_AUTH_ENABLED__ === true;

// 配置 EJS 模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(SERVER_DIR, 'views'));
app.locals.docsTitle = DOCS_TITLE;
app.locals.docsSubtitle = DOCS_SUBTITLE;
app.locals.docsLogo = DOCS_LOGO;
app.locals.docsStorageKeyPrefix = DOCS_STORAGE_KEY_PREFIX;
app.locals.docsWatermarkEnabled = DOCS_WATERMARK_ENABLED;
app.locals.docsWatermarkText = DOCS_WATERMARK_TEXT;

function normalizeDocRelativePath(value) {
  const raw = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === '.') return '';
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

function joinDocPath(...parts) {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

async function storageReadDir(dirPath = '') {
  const safePath = normalizeDocRelativePath(dirPath);
  if (safePath === null) {
    throw new Error('Invalid docs directory path');
  }
  if (injectedDocumentStore?.readDir) {
    return await injectedDocumentStore.readDir(safePath);
  }
  const fullPath = path.join(DOCS_DIR, safePath);
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
  }));
}

async function storageFileExists(docPath) {
  const safePath = normalizeDocRelativePath(docPath);
  if (!safePath || safePath === null) return false;
  if (injectedDocumentStore?.fileExists) {
    return await injectedDocumentStore.fileExists(safePath);
  }
  try {
    const stat = await fs.stat(path.join(DOCS_DIR, safePath));
    return stat.isFile();
  } catch {
    return false;
  }
}

async function storageReadFile(docPath) {
  const safePath = normalizeDocRelativePath(docPath);
  if (!safePath || safePath === null) {
    throw new Error('Invalid docs file path');
  }
  if (injectedDocumentStore?.readFile) {
    return await injectedDocumentStore.readFile(safePath);
  }
  return await fs.readFile(path.join(DOCS_DIR, safePath), 'utf-8');
}

async function storageReadAsset(assetPath) {
  const safePath = normalizeDocRelativePath(assetPath);
  if (!safePath || safePath === null) {
    throw new Error('Invalid docs asset path');
  }
  if (injectedDocumentStore?.readAsset) {
    return await injectedDocumentStore.readAsset(safePath);
  }
  return await fs.readFile(path.join(DOCS_DIR, safePath));
}

// 配置 markdown-it
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    // 特殊处理 Mermaid 图表
    if (lang === 'mermaid') {
      return `<div class="mermaid">${str}</div>`;
    }
    
    // 其他代码块使用 highlight.js
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
      } catch (__) {}
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

function slugifyHeading(text) {
  return (text || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~]/g, '')
    .replace(/[，。！？、；：“”‘’（）【】《》〈〉]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

md.core.ruler.push('heading_ids', function headingIds(state) {
  const slugCounter = new Map();
  for (let i = 0; i < state.tokens.length; i++) {
    const token = state.tokens[i];
    if (token.type !== 'heading_open') continue;
    const inline = state.tokens[i + 1];
    if (!inline || inline.type !== 'inline') continue;

    const baseSlug = slugifyHeading(inline.content) || 'section';
    const count = (slugCounter.get(baseSlug) || 0) + 1;
    slugCounter.set(baseSlug, count);
    const slug = count === 1 ? baseSlug : `${baseSlug}-${count}`;
    token.attrSet('id', slug);
  }
});

// 静态文件服务
app.use('/static', express.static(path.join(SERVER_DIR, 'static')));
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(SERVER_DIR, 'static', 'favicon.ico'));
});
// Mermaid.js 静态文件（相对于项目根目录）
app.use('/mermaid', express.static(MERMAID_DIR));
// GitHub Markdown 样式（本地，避免 CDN 慢）
app.use('/vendor/github-markdown-css', express.static(MARKDOWN_THEME_DIR));
// html2canvas / DOMPurify / jsPDF（本地，用于前端导出 PDF）
app.use('/vendor/html2canvas', express.static(HTML2CANVAS_DIR));
app.use('/vendor/dompurify', express.static(DOMPURIFY_DIR));
// jsPDF（本地，用于 Mermaid 图导出 PDF）
app.use('/vendor/jspdf', express.static(JSPDF_DIR));

// 文档中的本地图片、附件等静态资源，只允许从文档根目录读取。
app.get('/doc-asset/*', async (req, res) => {
  let requestedPath = req.path.slice('/doc-asset/'.length);
  try {
    requestedPath = decodeURIComponent(requestedPath);
  } catch {
    return res.status(400).send('资源路径无效');
  }

  const safePath = normalizeDocRelativePath(requestedPath);
  if (!safePath || safePath.split('/').some((part) => part.startsWith('.'))) {
    return res.status(403).send('禁止访问');
  }

  try {
    if (safePath.toLowerCase().endsWith('.md')) {
      return res.status(404).send('资源不存在');
    }
    const asset = await storageReadAsset(safePath);
    return res.type(path.extname(safePath)).send(asset);
  } catch {
    return res.status(404).send('资源不存在');
  }
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    docsTitle: DOCS_TITLE,
    docsRoot: DOCS_ROOT_LABEL,
    authEnabled: AUTH_ENABLED,
    watchEnabled: WATCH_ENABLED,
    storageDriver: STORAGE_DRIVER,
  });
});

app.get('/ready', async (req, res) => {
  try {
    if (injectedDocumentStore?.ready) {
      await injectedDocumentStore.ready();
    } else {
      const stat = await fs.stat(DOCS_DIR);
      if (!stat.isDirectory()) {
        throw new Error('DOCS_ROOT is not a directory');
      }
    }
    await storageReadDir('');
    return res.json({
      ok: true,
      docsRoot: DOCS_ROOT_LABEL,
      authEnabled: AUTH_ENABLED,
      storageDriver: STORAGE_DRIVER,
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      docsRoot: DOCS_ROOT_LABEL,
      authEnabled: AUTH_ENABLED,
      storageDriver: STORAGE_DRIVER,
      error: error.message,
    });
  }
});

// 消费项目可以在通用文档路由前注入自己的访问控制；DocNest 不实现任何项目身份系统。
const beforeDocumentRoutes = globalThis.__DOCNEST_BEFORE_DOCUMENT_ROUTES__ || [];
beforeDocumentRoutes.forEach((middleware) => app.use(middleware));

// 获取文档目录树（排除隐藏目录和系统文件）
async function getDocTree(dir, basePath = '') {
  const entries = await storageReadDir(basePath);
  const tree = [];
  const excludeDirs = ['node_modules', '.git'];
  const excludeFiles = [];

  for (const entry of entries) {
    // 跳过隐藏文件和排除的文件/目录
    if (entry.name.startsWith('.')) continue;
    if (excludeFiles.includes(entry.name)) continue;
    if (entry.isDirectory && excludeDirs.includes(entry.name)) continue;

    const relativePath = joinDocPath(basePath, entry.name);

    if (entry.isDirectory) {
      const children = await getDocTree(null, relativePath);
      if (children.length > 0) {
        tree.push({
          name: entry.name,
          type: 'directory',
          path: relativePath,
          children,
        });
      }
    } else if (entry.isFile && entry.name.endsWith('.md')) {
      // 只显示 Markdown 文件，排除 PDF 等其他文件
      tree.push({
        name: entry.name,
        type: 'file',
        path: relativePath,
      });
    }
    // 明确排除 PDF 文件和其他非 Markdown 文件
  }

  return tree.sort((a, b) => {
    const isReadme = (item) =>
      item.type === 'file' && item.name.toLowerCase() === 'readme.md';
    if (isReadme(a) && !isReadme(b)) return -1;
    if (!isReadme(a) && isReadme(b)) return 1;
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    if (!basePath && a.type === 'directory' && b.type === 'directory') {
      const orderA = ROOT_DIRECTORY_ORDER.indexOf(a.name);
      const orderB = ROOT_DIRECTORY_ORDER.indexOf(b.name);
      const hasOrderA = orderA !== -1;
      const hasOrderB = orderB !== -1;
      if (hasOrderA && hasOrderB) return orderA - orderB;
      if (hasOrderA) return -1;
      if (hasOrderB) return 1;
    }
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

// 首页：显示文档目录
app.get('/', async (req, res) => {
  try {
    const tree = await getDocTree(DOCS_DIR);
    const treeHtml = renderTree(tree);
    res.render('index', {
      treeHtml,
      assetVersion: ASSET_VERSION,
    });
  } catch (error) {
    res.status(500).send(`<h1>错误</h1><p>${error.message}</p>`);
  }
});

// 渲染目录树为 HTML
function renderTree(tree, level = 0) {
  let html = '<ul>';
  for (const item of tree) {
    const itemName = md.utils.escapeHtml(item.name || '');
    if (item.type === 'directory') {
      const dirPathNorm = (item.path || '').split(path.sep).join('/');
      const dataDirPath = ` data-dir-path="${encodeURIComponent(dirPathNorm)}"`;
      html += `<li class="directory collapsed"${dataDirPath}>
        <span class="dir-toggle">
          <span class="toggle-icon">▼</span>
          <span class="dir-name" title="${itemName}">📁 ${itemName}</span>
        </span>
        <div class="dir-children">${renderTree(item.children, level + 1)}</div>
      </li>`;
    } else {
      // 文件路径直接使用，路径重定向在 resolveDocPath 中处理
      const url = `/doc?path=${encodeURIComponent(item.path)}`;
      html += `<li class="file">
        <a href="${url}" class="file-link" title="${itemName}">📄 ${itemName}</a>
      </li>`;
    }
  }
  html += '</ul>';
  return html;
}

function encodeDocAssetPath(assetPath) {
  return assetPath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function rewriteDocAssetUrls(htmlContent, currentDir) {
  return htmlContent.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi,
    (match, prefix, source, suffix) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|#)/i.test(source)) {
        return match;
      }

      let decodedSource = source;
      try {
        decodedSource = decodeURIComponent(source);
      } catch {}

      const resolvedPath = normalizeDocRelativePath(
        path.posix.normalize(path.posix.join(currentDir, decodedSource))
      );
      if (!resolvedPath || resolvedPath.toLowerCase().endsWith('.md')) {
        return match;
      }
      return `${prefix}/doc-asset/${encodeDocAssetPath(resolvedPath)}${suffix}`;
    }
  );
}

async function renderDocNotFound(res, requestedPath) {
  const tree = await getDocTree(DOCS_DIR);
  const treeHtml = renderTree(tree);
  return res.status(404).render('not-found', {
    treeHtml,
    requestedPath,
    assetVersion: ASSET_VERSION,
  });
}

// 智能路径解析：基于文件系统实际路径，自动适配目录重命名
async function resolveDocPath(requestedPath) {
  requestedPath = normalizeDocRelativePath(requestedPath);
  if (!requestedPath) {
    return null;
  }

  // 先尝试直接路径
  if (await storageFileExists(requestedPath)) {
    return { resolvedPath: requestedPath };
  }
  
  // 将路径拆分为目录和文件名
  const pathParts = requestedPath.split('/');
  const fileName = pathParts.pop();
  
  // 如果路径包含目录，尝试逐级查找
  if (pathParts.length > 0) {
    let currentDir = '';
    const resolvedParts = [];
    
    // 逐级解析路径
    for (let i = 0; i < pathParts.length; i++) {
      const requestedDir = pathParts[i];
      
      // 查找父目录下的所有目录，尝试匹配
      try {
        const entries = await storageReadDir(currentDir);
        const matchingDir = entries.find(entry => 
          entry.isDirectory &&
          !entry.name.startsWith('.') &&
          // 尝试多种匹配策略
          (entry.name === requestedDir || 
           entry.name.toLowerCase() === requestedDir.toLowerCase() ||
           // 如果请求的是英文名，尝试查找中文名（或反之）
           entry.name.includes(requestedDir) ||
           requestedDir.includes(entry.name))
        );
        
        if (matchingDir) {
          resolvedParts.push(matchingDir.name);
          currentDir = joinDocPath(currentDir, matchingDir.name);
        } else {
          // 找不到匹配的目录，返回 null
          return null;
        }
      } catch (e) {
        return null;
      }
    }
    
    // 构建解析后的路径
    const resolvedDirPath = resolvedParts.join('/');
    const resolvedPath = resolvedDirPath ? `${resolvedDirPath}/${fileName}` : fileName;
    
    // 再次检查文件是否存在
    if (await storageFileExists(resolvedPath)) {
      return { resolvedPath };
    }
    return null;
  }
  
  // 如果只是文件名，尝试在整个文档目录中查找
  try {
    const foundPath = await findFileInTree('', fileName);
    if (foundPath) {
      return { resolvedPath: foundPath };
    }
  } catch (e) {
    // 查找失败
  }
  
  return null;
}

// 在目录树中查找文件
async function findFileInTree(dir, fileName, basePath = '') {
  try {
    const effectiveBasePath = basePath || dir || '';
    const entries = await storageReadDir(effectiveBasePath);
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      
      const relativePath = joinDocPath(effectiveBasePath, entry.name);
      
      if (entry.isDirectory) {
        const found = await findFileInTree('', fileName, relativePath);
        if (found) return found;
      } else if (entry.isFile && entry.name === fileName && entry.name.endsWith('.md')) {
        return relativePath;
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return null;
}

// 构建面包屑：基于文档路径
async function buildBreadcrumbs(docPath) {
  const crumbs = [];
  const normalizedPath = docPath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);

  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const isLastFile = isLast && parts[i].endsWith('.md');
    const displayName = isLastFile ? parts[i].slice(0, -3) : parts[i];

    if (isLast) {
      crumbs.push({ name: displayName, isLast: true, url: '' });
    } else {
      // 中间目录：构建到该目录的路径
      const dirPath = parts.slice(0, i + 1).join('/');
      // 尝试链接到该目录下的 README.md
      let dirUrl = '';
      if (await storageFileExists(joinDocPath(dirPath, 'README.md'))) {
        dirUrl = `/doc?path=${encodeURIComponent(dirPath + '/README.md')}`;
      } else {
        // 没有 README.md，链接到目录列表页
        dirUrl = `/dir?path=${encodeURIComponent(dirPath)}`;
      }
      crumbs.push({ name: displayName, isLast: false, url: dirUrl });
    }
  }

  return crumbs;
}

// 获取目录下的文件和子目录列表（仅一层）
async function getDirListing(dirPath) {
  let entries;
  try {
    entries = await storageReadDir(dirPath);
  } catch (e) {
    return null;
  }

  const dirs = [];
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const relPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      // 检查该目录是否在文档树中（非空、非排除）
      const children = await getDocTree(null, relPath);
      if (children.length > 0) {
        dirs.push({ name: entry.name, path: relPath });
      }
    } else if (entry.isFile && entry.name.endsWith('.md')) {
      files.push({ name: entry.name, path: relPath });
    }
  }

  // 排序
  dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  files.sort((a, b) => {
    const isReadme = (n) => n.toLowerCase() === 'readme.md';
    if (isReadme(a.name) && !isReadme(b.name)) return -1;
    if (!isReadme(a.name) && isReadme(b.name)) return 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  return { dirs, files };
}

// 目录浏览页面
app.get('/dir', async (req, res) => {
  try {
    let dirPath = req.query.path || '';
    try {
      dirPath = decodeURIComponent(dirPath);
    } catch (e) {}
    dirPath = normalizeDocRelativePath(dirPath);
    if (dirPath === null) {
      return res.status(403).send('<h1>禁止访问</h1>');
    }

    // 先检查是否有 README.md，如果有则重定向到文档页
    if (await storageFileExists(joinDocPath(dirPath, 'README.md'))) {
      return res.redirect(`/doc?path=${encodeURIComponent(dirPath ? dirPath + '/README.md' : 'README.md')}`);
    }
    // 没有 README，显示目录列表

    const listing = await getDirListing(dirPath);
    if (!listing) {
      return await renderDocNotFound(res, dirPath);
    }

    const tree = await getDocTree(DOCS_DIR);
    const treeHtml = renderTree(tree);
    const breadcrumbs = await buildBreadcrumbs(dirPath);
    const dirName = dirPath ? path.basename(dirPath) : '根目录';

    res.render('dir', {
      treeHtml,
      currentDirPath: dirPath,
      dirName,
      listing,
      breadcrumbs,
      assetVersion: ASSET_VERSION,
    });
  } catch (error) {
    res.status(500).send(`<h1>错误</h1><p>${error.message}</p>`);
  }
});

// 文档查看页面（必须在通配符路由之前）
app.get('/doc', async (req, res) => {
  try {
    let docPath = req.query.path;
    if (!docPath) {
      return res.redirect('/');
    }

    // Express 会自动解码 query 参数，但为了安全，我们再次解码确保正确
    try {
      docPath = decodeURIComponent(docPath);
    } catch (e) {
      // 如果解码失败，使用原始路径
    }

    // 使用智能路径解析
    const resolved = await resolveDocPath(docPath);
    if (!resolved) {
      return await renderDocNotFound(res, docPath);
    }

    // 如果解析后的路径与请求路径不同，重定向到正确路径
    if (resolved.resolvedPath !== docPath) {
      return res.redirect(`/doc?path=${encodeURIComponent(resolved.resolvedPath)}`);
    }

    const content = await storageReadFile(resolved.resolvedPath);
    let htmlContent = md.render(content);
    
    // 转换文档中的相对路径链接为 /doc?path=... 格式
    // 当前文档所在目录
    const currentDir = path.dirname(docPath);

    htmlContent = rewriteDocAssetUrls(htmlContent, currentDir);
    
    // 转换文档中的相对路径链接为 /doc?path=... 格式
    // 处理相对路径链接：./xxx.md 或 ../xxx.md 或 xxx.md
    htmlContent = htmlContent.replace(
      /<a\s+href="([^"]+\.md)"/g,
      (match, linkPath) => {
        // 如果已经是 /doc?path=... 格式，保持不变
        if (linkPath.startsWith('/doc?')) {
          return match;
        }
        
        // 先解码，避免双重编码（markdown-it 可能已经编码了）
        let decodedPath = linkPath;
        try {
          decodedPath = decodeURIComponent(linkPath);
        } catch (e) {
          // 如果解码失败，使用原始路径（可能不是编码的）
        }
        
        // 如果是绝对路径（以 / 开头但不是 /doc），转换为相对路径
        if (decodedPath.startsWith('/') && !decodedPath.startsWith('/doc')) {
          // 移除开头的 /，作为相对于 docs 目录的路径
          const relativePath = decodedPath.substring(1);
          const docUrl = `/doc?path=${encodeURIComponent(relativePath)}`;
          return `<a href="${docUrl}"`;
        }
        
        // 如果是相对路径，转换为绝对路径
        let resolvedPath;
        if (decodedPath.startsWith('./')) {
          // 相对于当前目录
          resolvedPath = path.join(currentDir, decodedPath.substring(2));
        } else if (decodedPath.startsWith('../')) {
          // 相对于父目录
          resolvedPath = path.join(currentDir, decodedPath);
        } else {
          // 相对于当前目录（没有 ./ 前缀）
          resolvedPath = path.join(currentDir, decodedPath);
        }
        
        // 规范化路径（处理 .. 和 .）
        resolvedPath = path.normalize(resolvedPath);
        
        // 确保路径使用正斜杠（URL 格式）
        const urlPath = resolvedPath.split(path.sep).join('/');
        
        // 转换为 /doc?path=... 格式（只编码一次）
        const docUrl = `/doc?path=${encodeURIComponent(urlPath)}`;
        return `<a href="${docUrl}"`;
      }
    );
    
    const tree = await getDocTree(DOCS_DIR);
    const treeHtml = renderTree(tree);
    const fileName = path.basename(docPath);
    const breadcrumbs = await buildBreadcrumbs(docPath);

    res.render('doc', {
      content: htmlContent,
      treeHtml,
      currentPath: docPath,
      fileName,
      breadcrumbs,
      assetVersion: ASSET_VERSION,
    });
  } catch (error) {
    res.status(500).send(`<h1>错误</h1><p>${error.message}</p>`);
  }
});

// 处理直接文件路径访问（如 /00-系统总览.md），重定向到 /doc?path=...
// 注意：此路由必须在 /doc 路由之后，避免拦截 /doc 路由
app.get('/*.md', async (req, res) => {
  let filePath = req.path.substring(1); // 移除开头的 /
  // 先解码，避免双重编码
  try {
    filePath = decodeURIComponent(filePath);
  } catch (e) {
    // 如果解码失败，使用原始路径
  }
  // 重定向到 /doc?path=... 格式（只编码一次）
  return res.redirect(`/doc?path=${encodeURIComponent(filePath)}`);
});

// WebSocket 连接处理
io.on('connection', (socket) => {
  console.log('客户端已连接:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('客户端已断开:', socket.id);
  });
});

// 文件监听功能
if (WATCH_ENABLED && !injectedDocumentStore) {
  console.log('🔍 文件监听模式已启用');

  const watcher = chokidar.watch(DOCS_DIR, {
    ignored: /(^|[\/\\])\../, // 忽略隐藏文件
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100
    }
  });

  // 统一路径格式（使用正斜杠，兼容跨平台）
  function normalizePath(filePath) {
    const relativePath = path.relative(DOCS_DIR, filePath);
    return relativePath.split(path.sep).join('/');
  }

  watcher.on('change', async (filePath) => {
    // 只监听 .md 文件
    if (!filePath.endsWith('.md')) {
      return;
    }

    const relativePath = normalizePath(filePath);
    console.log(`📝 文件已更新: ${relativePath}`);

    try {
      // 重新读取文件内容并渲染
      const content = await fs.readFile(filePath, 'utf-8');
      const htmlContent = md.render(content);
      
      // 通知所有客户端文件已更新
      io.emit('file-changed', {
        path: relativePath,
        content: htmlContent
      });
    } catch (error) {
      console.error('读取文件失败:', error);
      io.emit('file-error', {
        path: relativePath,
        error: error.message
      });
    }
  });

  watcher.on('add', (filePath) => {
    if (filePath.endsWith('.md')) {
      const relativePath = normalizePath(filePath);
      console.log(`➕ 新文件已添加: ${relativePath}`);
      io.emit('file-added', { path: relativePath });
    }
  });

  watcher.on('unlink', (filePath) => {
    if (filePath.endsWith('.md')) {
      const relativePath = normalizePath(filePath);
      console.log(`🗑️  文件已删除: ${relativePath}`);
      io.emit('file-deleted', { path: relativePath });
    }
  });

  watcher.on('error', (error) => {
    console.error('文件监听错误:', error);
  });
} else {
  console.log('🔒 文件监听模式已关闭');
}

const MAX_PORT_ATTEMPTS = 100;

function startServer(port = PORT_START, attemptsLeft = MAX_PORT_ATTEMPTS) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && PORT_FALLBACK_ENABLED && attemptsLeft > 1) {
      console.warn(`⚠️ 端口 ${port} 已被占用，尝试端口 ${port + 1} ...`);
      server.removeAllListeners('error');
      server.removeAllListeners('listening');
      startServer(port + 1, attemptsLeft - 1);
      return;
    }
    throw error;
  });

  server.listen(port, HOST, () => {
    const actualPort = server.address().port;
    console.log(`📚 文档服务器已启动`);
    console.log(`   访问地址: http://localhost:${actualPort}`);
    console.log(`   绑定地址: ${HOST}`);
    console.log(`   文档目录: ${DOCS_DIR}`);
    console.log(`   ⚡ Watch 模式: ${WATCH_ENABLED ? '已启用（文件修改后自动刷新）' : '已关闭'}`);

    if (OPEN_BROWSER) {
      openBrowser(`http://localhost:${actualPort}`);
    }
  });
  return server;
}

function openBrowser(url) {
  const { exec } = require('child_process');
  const command =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(command, (error) => {
    if (error) {
      console.warn(`   ⚠️ 自动打开浏览器失败: ${error.message}`);
    }
  });
}

if (process.env.DOCS_AUTOSTART !== 'false') {
  startServer();
}

export type DocNestDocumentEntry = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
};

export type DocNestDocumentStore = {
  name: string;
  rootLabel?: string;
  readDir: (relativePath: string) => Promise<DocNestDocumentEntry[]>;
  fileExists: (relativePath: string) => Promise<boolean>;
  readFile: (relativePath: string) => Promise<string>;
  readAsset: (relativePath: string) => Promise<Uint8Array>;
  ready?: () => Promise<void>;
};

export {
  app,
  io,
  server,
  startServer,
  DOCS_DIR as docsDir,
};
