import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const config = await readFile(new URL('../src/config.ts', import.meta.url), 'utf8')
const cli = await readFile(new URL('../src/cli.ts', import.meta.url), 'utf8')
const server = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8')
const header = await readFile(
  new URL('../server/views/partials/header.ejs', import.meta.url),
  'utf8',
)
const appearance = await readFile(
  new URL('../server/views/partials/appearance-head.ejs', import.meta.url),
  'utf8',
)
const docView = await readFile(new URL('../server/views/doc.ejs', import.meta.url), 'utf8')
const protection = await readFile(
  new URL('../server/views/partials/page-protection.ejs', import.meta.url),
  'utf8',
)
const diagramViewer = await readFile(
  new URL('../server/static/js/diagram/diagram-viewer.js', import.meta.url),
  'utf8',
)
const diagramDownload = await readFile(
  new URL('../server/static/js/diagram/diagram-download.js', import.meta.url),
  'utf8',
)
const pdfExporter = await readFile(
  new URL('../server/static/js/core/doc-pdf-export.js', import.meta.url),
  'utf8',
)
const styles = await readFile(new URL('../server/static/css/themes.css', import.meta.url), 'utf8')

test('restrictedMode is the single export and reading policy boundary', () => {
  assert.match(config, /restrictedMode\?: boolean;/)
  assert.match(config, /restrictedMode: userConfig\.restrictedMode === true/)
  assert.doesNotMatch(config, /export\?:/)
  assert.match(cli, /DOCS_RESTRICTED_MODE = String\(config\.restrictedMode\)/)
  assert.match(server, /const DOCS_RESTRICTED_MODE = process\.env\.DOCS_RESTRICTED_MODE === 'true'/)
  assert.match(server, /const DOCS_PDF_ENABLED = !DOCS_RESTRICTED_MODE/)
  assert.match(server, /app\.locals\.docsRestrictedMode = DOCS_RESTRICTED_MODE/)
  assert.doesNotMatch(server, /DOCS_WATERMARK_(?:ENABLED|TEXT)/)
})

test('restricted mode hides export and Mermaid externalization affordances', () => {
  assert.match(header, /showPrintButton && !docsRestrictedMode/)
  assert.match(header, /showPdfButton && !docsRestrictedMode/)
  assert.match(appearance, /restrictedMode:/)
  assert.match(docView, /if \(!docsRestrictedMode\)/)
  assert.match(protection, /if \(docsRestrictedMode\)/)
  assert.match(protection, /docnest-page-watermark/)
  assert.match(protection, /addEventListener\('selectstart'/)
  assert.match(diagramViewer, /if \(isDocNestRestrictedMode\(\)\) return/)
  assert.match(diagramDownload, /if \(isDocNestRestrictedMode\(\)\) return/)
  assert.match(pdfExporter, /openPdfExportDialog/)
  assert.match(pdfExporter, /siteTitle/)
  assert.match(pdfExporter, /drawWatermarkPattern/)
  assert.match(styles, /html\.docnest-restricted \.markdown-body \.mermaid::after/)
  assert.match(styles, /html\.docnest-page-protected body,/)
})
