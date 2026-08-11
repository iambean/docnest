import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const viewer = await readFile(new URL('../server/static/js/diagram/diagram-viewer.js', import.meta.url), 'utf8')
const css = await readFile(new URL('../server/static/css/styles.css', import.meta.url), 'utf8')

test('horizontal diagrams start from a reachable left edge and reset to fit zoom', () => {
  assert.match(css, /\.diagram-viewer-svg-container[\s\S]*?justify-content:\s*flex-start/)
  assert.match(viewer, /let defaultZoom = 1/)
  assert.match(viewer, /defaultZoom = currentZoom/)
  assert.match(viewer, /currentZoom = defaultZoom/)
  assert.match(viewer, /container\.scrollLeft = 0/)
  assert.doesNotMatch(viewer, /currentZoom = Math\.max\(isNaN\(initialScale\) \? 1 : initialScale, 1\)/)
})
