import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const themeStyles = await readFile(
  new URL('../server/static/css/themes.css', import.meta.url),
  'utf8',
)
const exporter = await readFile(
  new URL('../server/static/js/core/doc-pdf-export.js', import.meta.url),
  'utf8',
)

test('PDF export themes avoid color functions unsupported by html2canvas 1.4', () => {
  const unsupportedColor = themeStyles.match(
    /\b(?:color-mix|color|lab|lch|oklab|oklch)\s*\(/i,
  )
  assert.equal(
    unsupportedColor?.[0] ?? null,
    null,
    'html2canvas 1.4 cannot parse modern CSS color functions used by the export clone',
  )
})

test('PDF export failures stay inside the themed interface', () => {
  assert.doesNotMatch(exporter, /window\.alert\('导出 PDF 失败/)
  assert.match(exporter, /pdf-export-error/)
})
