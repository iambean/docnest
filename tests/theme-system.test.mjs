import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const themeNames = [
  'slate-modern',
  'editorial-atlas',
  'precision-index',
  'archive-room',
  'swiss-manual',
]

const themeScript = await readFile(
  new URL('../server/static/js/core/theme.js', import.meta.url),
  'utf8',
)
const themeStyles = await readFile(
  new URL('../server/static/css/themes.css', import.meta.url),
  'utf8',
)
const header = await readFile(
  new URL('../server/views/partials/header.ejs', import.meta.url),
  'utf8',
)

test('theme runtime keeps style and color mode as independent persisted choices', () => {
  assert.doesNotThrow(() => new Function(themeScript))
  assert.match(themeScript, /':theme-style'/)
  assert.match(themeScript, /':theme-mode'/)
  assert.match(themeScript, /docnest:appearance-change/)
  assert.match(header, /id="theme-style-toggle"/)
  assert.match(header, /id="theme-toggle"/)
  assert.match(header, /role="radiogroup" aria-label="主题风格"/)
  assert.match(header, /role="radiogroup" aria-label="明暗模式"/)
})

test('all five theme profiles have runtime metadata and CSS scopes', () => {
  for (const themeName of themeNames) {
    assert.match(themeScript, new RegExp(`'${themeName}'`))
    assert.match(themeStyles, new RegExp(`data-doc-theme="${themeName}"`))
  }
})

test('Slate Modern is the default theme and migrates the legacy name', () => {
  assert.match(themeScript, /label: 'Slate Modern'/)
  assert.match(themeScript, /value === 'current-docs' \? 'slate-modern'/)
  assert.match(header, />Slate Modern</)
})

test('mode controls stay available for future use but are hidden in the style popover', () => {
  assert.match(header, /class="[^"]*theme-mode-section[^"]*"/)
  assert.match(header, /id="theme-mode-options"/)
  assert.match(themeStyles, /\.theme-popover \.theme-mode-section\s*\{\s*display: none;/)
  assert.match(themeScript, /buildModeOptions\(modeOptions\)/)
})

test('Precision Index gives the compact header extra vertical breathing room', () => {
  assert.match(
    themeStyles,
    /body\[data-doc-theme="precision-index"\] \.header \{[\s\S]*?min-height: 68px;[\s\S]*?padding: 0\.6rem 1rem;/,
  )
})

test('Swiss Manual keeps document titles within the shared theme scale', () => {
  assert.match(
    themeStyles,
    /body\[data-doc-theme="swiss-manual"\] \.markdown-body h1 \{[\s\S]*?font-size: clamp\(2\.25rem, 4vw, 3\.75rem\);/,
  )
})

test('theme bootstrap keeps the page hidden until the stored theme reaches the body', () => {
  assert.match(
    themeStyles,
    /html\[data-docnest-theme-pending\] body\s*\{\s*visibility: hidden;/,
  )
  assert.match(themeScript, /setAttribute\('data-docnest-theme-pending', ''\)/)
  assert.match(themeScript, /removeAttribute\('data-docnest-theme-pending'\)/)
})

test('every rendered page loads theme tokens after the base styles', async () => {
  for (const view of ['index.ejs', 'doc.ejs', 'dir.ejs', 'not-found.ejs']) {
    const source = await readFile(new URL(`../server/views/${view}`, import.meta.url), 'utf8')
    const baseIndex = source.indexOf('/static/css/styles.css')
    const themeIndex = source.indexOf('/static/css/themes.css')
    assert.notEqual(baseIndex, -1, `${view} should load base styles`)
    assert.ok(themeIndex > baseIndex, `${view} should load theme styles after base styles`)
    assert.match(source, /partials\/appearance-head/)
  }
})
