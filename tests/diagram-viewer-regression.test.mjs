import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const viewer = await readFile(new URL('../server/static/js/diagram/diagram-viewer.js', import.meta.url), 'utf8')
const zoom = await readFile(new URL('../server/static/js/diagram/diagram-zoom.js', import.meta.url), 'utf8')
const css = await readFile(new URL('../server/static/css/styles.css', import.meta.url), 'utf8')

test('horizontal diagrams start from a reachable left edge and reset to fit zoom', () => {
  assert.match(css, /\.diagram-viewer-svg-container[\s\S]*?justify-content:\s*flex-start/)
  assert.match(viewer, /let defaultZoom = 1/)
  assert.match(viewer, /defaultZoom = currentZoom/)
  assert.match(viewer, /currentZoom = defaultZoom/)
  assert.match(viewer, /container\.scrollLeft = 0/)
  assert.doesNotMatch(viewer, /currentZoom = Math\.max\(isNaN\(initialScale\) \? 1 : initialScale, 1\)/)
})

test('diagram dimensions prefer viewBox over Mermaid percentage dimensions', () => {
  const sandbox = {
    window: {},
    document: {
      addEventListener() {},
      getElementById() { return null },
    },
    setTimeout,
  }
  vm.runInNewContext(viewer, sandbox)

  const svg = (attributes) => ({
    getAttribute(name) { return attributes[name] ?? null },
  })

  const viewBoxDimensions = sandbox.getDiagramIntrinsicDimensions(svg({
    width: '100%',
    height: 'auto',
    viewBox: '0 0 1600 900',
  }))
  assert.equal(viewBoxDimensions.width, 1600)
  assert.equal(viewBoxDimensions.height, 900)

  const attributeDimensions = sandbox.getDiagramIntrinsicDimensions(
    svg({ width: '1200px', height: '800px' }),
  )
  assert.equal(attributeDimensions.width, 1200)
  assert.equal(attributeDimensions.height, 800)
  assert.doesNotMatch(viewer, /parseFloat\(svgElement\.getAttribute\('width'\)\)/)
  assert.match(zoom, /getDiagramIntrinsicDimensions\(currentSvg\)/)
  assert.match(css, /\.markdown-body \.mermaid svg[\s\S]*?width:\s*100%\s*!important/)
})

test('inline Mermaid diagrams can shrink inside the document flex layout', () => {
  assert.match(css, /\.main-content\s*\{[\s\S]*?min-width:\s*0;/)
  assert.match(css, /\.doc-layout\s*\{[\s\S]*?min-width:\s*0;/)
  assert.match(css, /\.markdown-body\s*\{[\s\S]*?min-width:\s*0;/)
  assert.match(css, /\.markdown-body \.mermaid\s*\{[\s\S]*?max-width:\s*100%;/)
  assert.match(css, /\.markdown-body \.mermaid svg\s*\{[\s\S]*?min-width:\s*0\s*!important;/)
})
