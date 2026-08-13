import fs from 'node:fs';
import path from 'node:path';

const MARKDOWN_SOURCE_EXTENSIONS = new Set(['.md', '.markdown']);
const SENSITIVE_ATTACHMENT_EXTENSIONS = new Set([
  '.env',
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
  '.secret',
  '.secrets',
]);
const SENSITIVE_ATTACHMENT_NAMES = new Set([
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
]);
const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const MARKDOWN_REFERENCE_PATTERN = /^\s{0,3}\[[^\]]+\]:\s*(?:<([^>\n]+)>|(\S+))/gm;
const HTML_ASSET_PATTERN = /\b(?:src|href)=["']([^"']+)["']/gi;
const FENCED_CODE_PATTERN = /(```|~~~)[^\n]*\n[\s\S]*?\n\1\s*/g;

export type DocumentAttachmentOptions = {
  /**
   * Whether a missing, non-Markdown local reference should fail collection.
   * Defaults to true so static builds cannot silently publish broken assets.
   */
  failOnMissing?: boolean;
};

export type DocumentAttachmentUrlOptions = {
  assetPaths?: readonly string[];
  assetPrefix?: string;
};

function collectMarkdownPaths(root: string, base = ''): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const relativePath = base ? path.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectMarkdownPaths(root, relativePath));
    } else if (entry.isFile() && MARKDOWN_SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(relativePath.replace(/\\/g, '/'));
    }
  }
  return results;
}

function isLocalRelativeTarget(target: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(target);
}

function stripTargetSuffix(target: string): string {
  return target.split(/[?#]/, 1)[0];
}

function isSensitiveAttachment(target: string): boolean {
  const baseName = path.basename(target).toLowerCase();
  return SENSITIVE_ATTACHMENT_EXTENSIONS.has(path.extname(baseName))
    || SENSITIVE_ATTACHMENT_NAMES.has(baseName)
    || baseName.startsWith('.env.');
}

function extractTargets(markdown: string): string[] {
  const source = markdown.replace(FENCED_CODE_PATTERN, '');
  const targets: string[] = [];

  MARKDOWN_LINK_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(MARKDOWN_LINK_PATTERN)) {
    targets.push(match[1] || match[2] || '');
  }

  MARKDOWN_REFERENCE_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(MARKDOWN_REFERENCE_PATTERN)) {
    targets.push(match[1] || match[2] || '');
  }

  HTML_ASSET_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(HTML_ASSET_PATTERN)) {
    targets.push(match[1] || '');
  }

  return targets;
}

function resolveAttachmentPath(
  docsRoot: string,
  realDocsRoot: string,
  markdownPath: string,
  rawTarget: string,
  failOnMissing: boolean,
): string | null {
  if (!rawTarget || !isLocalRelativeTarget(rawTarget)) return null;

  let decodedTarget: string;
  try {
    decodedTarget = decodeURIComponent(stripTargetSuffix(rawTarget));
  } catch {
    return null;
  }
  if (!decodedTarget) return null;
  if (decodedTarget.endsWith('/')) return null;

  const extension = path.extname(decodedTarget).toLowerCase();
  if (MARKDOWN_SOURCE_EXTENSIONS.has(extension)) return null;
  if (isSensitiveAttachment(decodedTarget)) return null;

  const resolved = path.resolve(docsRoot, path.dirname(markdownPath), decodedTarget);
  const relative = path.relative(docsRoot, resolved);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    return null;
  }

  const relativeSegments = relative.split(path.sep);
  if (relativeSegments.some((segment) => segment.startsWith('.'))) return null;

  if (!fs.existsSync(resolved)) {
    if (failOnMissing) {
      throw new Error(`文档附件不存在: ${markdownPath} -> ${rawTarget}`);
    }
    return null;
  }
  if (!fs.statSync(resolved).isFile()) return null;

  // Do not follow a symlink out of the document root.
  const realResolved = fs.realpathSync(resolved);
  const realRelative = path.relative(realDocsRoot, realResolved);
  if (path.isAbsolute(realRelative) || realRelative === '..' || realRelative.startsWith(`..${path.sep}`)) {
    return null;
  }

  return relative.replace(/\\/g, '/');
}

/** Collect every existing, explicitly referenced local document attachment. */
export function collectDocumentAttachmentPaths(
  docsRoot: string,
  options: DocumentAttachmentOptions = {},
): string[] {
  const root = path.resolve(docsRoot);
  if (!fs.statSync(root).isDirectory()) {
    throw new Error(`文档目录不存在: ${docsRoot}`);
  }

  const realRoot = fs.realpathSync(root);
  const failOnMissing = options.failOnMissing ?? true;
  const results = new Set<string>();
  for (const markdownPath of collectMarkdownPaths(root)) {
    const markdown = fs.readFileSync(path.join(root, markdownPath), 'utf8');
    for (const rawTarget of extractTargets(markdown)) {
      const attachmentPath = resolveAttachmentPath(root, realRoot, markdownPath, rawTarget, failOnMissing);
      if (attachmentPath) results.add(attachmentPath);
    }
  }

  return [...results].sort();
}

/** Copy collected attachments while preserving their paths relative to docsRoot. */
export function copyDocumentAttachments(
  sourceRoot: string,
  destinationRoot: string,
  options: DocumentAttachmentOptions = {},
): string[] {
  const attachmentPaths = collectDocumentAttachmentPaths(sourceRoot, options);
  const source = path.resolve(sourceRoot);
  const destination = path.resolve(destinationRoot);

  for (const relativePath of attachmentPaths) {
    const sourcePath = path.join(source, relativePath);
    const destinationPath = path.join(destination, relativePath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  }

  return attachmentPaths;
}

function encodeAssetPath(assetPath: string): string {
  return assetPath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

/** Rewrite rendered local attachment links to the static document asset endpoint. */
export function rewriteDocumentAttachmentUrls(
  html: string,
  documentPath: string,
  options: DocumentAttachmentUrlOptions = {},
): string {
  const assetPrefix = (options.assetPrefix || '/doc-asset').replace(/\/+$/, '');
  const assetPaths = options.assetPaths ? new Set(options.assetPaths) : null;
  const documentDir = path.posix.dirname(documentPath.replace(/\\/g, '/'));
  const attributePattern = /(<(?:a|audio|embed|iframe|img|object|source|video)\b[^>]*\s(?:href|src)=["'])([^"']+)(["'])/gi;

  return html.replace(attributePattern, (match, prefix: string, rawTarget: string, suffix: string) => {
    if (!rawTarget || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/|data:)/i.test(rawTarget)) return match;

    const targetWithoutSuffix = stripTargetSuffix(rawTarget);
    let decodedTarget: string;
    try {
      decodedTarget = decodeURIComponent(targetWithoutSuffix);
    } catch {
      return match;
    }
    if (!decodedTarget || MARKDOWN_SOURCE_EXTENSIONS.has(path.extname(decodedTarget).toLowerCase())) {
      return match;
    }

    const resolved = path.posix.normalize(path.posix.join(documentDir, decodedTarget));
    if (!resolved || resolved === '..' || resolved.startsWith('../') || resolved.startsWith('.')) return match;
    if (assetPaths && !assetPaths.has(resolved)) return match;

    const suffixStart = targetWithoutSuffix.length;
    const queryAndHash = rawTarget.slice(suffixStart);
    return `${prefix}${assetPrefix}/${encodeAssetPath(resolved)}${queryAndHash}${suffix}`;
  });
}
