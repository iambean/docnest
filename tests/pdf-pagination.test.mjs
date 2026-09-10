import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const exporter = await readFile(new URL('../server/static/js/core/doc-pdf-export.js', import.meta.url), 'utf8')

function loadExporter(document, window = {}) {
  vm.runInNewContext(exporter.replace('  function init() {', `
    window.testPdf = { createExportRoot, addCanvasToPdf, renderCanvas };
    function init() {
  `), { window, document, Set, Promise, console })
  return window.testPdf
}

function paginate(protectedRegions, blockBreakpoints = []) {
  const canvases = new Map()
  const pages = []
  const document = {
    readyState: 'loading',
    addEventListener() {},
    createElement(tag) {
      assert.equal(tag, 'canvas')
      const id = `canvas-${canvases.size}`
      const canvas = {
        getContext() {
          return {
            fillRect() {},
            drawImage(source, x, top, width, height) { canvas.crop = { top, height } },
          }
        },
        toDataURL() { return id },
      }
      canvases.set(id, canvas)
      return canvas
    },
  }
  const source = {
    width: 1860,
    height: 4200,
    getContext() {
      return { getImageData(x, y, width, height) { return { data: new Uint8ClampedArray(width * height * 4).fill(255) } } }
    },
  }
  const pdf = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    addPage() {},
    addImage(id, format, x, y, width, height) {
      pages.push({ ...canvases.get(id).crop, x, y, width, renderedHeight: height })
    },
  }
  loadExporter(document).addCanvasToPdf(pdf, source, 12, blockBreakpoints, null, protectedRegions)
  return pages
}

function assertWholeMedia(pages, region) {
  const containing = pages.filter(p => p.top <= region.top && p.top + p.height >= region.bottom)
  assert.equal(containing.length, 1, `Image [${region.top}, ${region.bottom}] was split across PDF pages: ${JSON.stringify(pages)}`)
  for (const page of pages) {
    assert.ok(page.width <= 186 + 1e-6)
    assert.ok(page.renderedHeight <= 273 + 1e-6)
    assert.ok(page.x >= 12 && page.y >= 12)
  }
  assert.equal(pages[0].top, 0)
  for (let i = 1; i < pages.length; i++) assert.equal(pages[i].top, pages[i - 1].top + pages[i - 1].height)
  assert.equal(pages.at(-1).top + pages.at(-1).height, 4200)
}

test('an oversized diagram is kept whole and scaled to one PDF page', () => {
  const image = { top: 400, bottom: 3800 }
  assertWholeMedia(paginate([image], [image]), image)
})

test('a fitting image moves to the next page even when the preceding page is under 70% full', () => {
  const image = { top: 500, bottom: 2900 }
  const pages = paginate([image], [image])
  assertWholeMedia(pages, image)
  assert.equal(pages[0].top + pages[0].height, 500)
})

test('an image exactly a page high is not fragmented or followed by an empty slice', () => {
  const image = { top: 500, bottom: 3230 }
  const pages = paginate([image], [image])
  assertWholeMedia(pages, image)
  assert.ok(pages.every(page => page.height > 0))
})

// A small DOM fixture exercises the real export clone transformation without a browser dependency.
class Text {
  constructor(text) { this.textContent = text }
  querySelectorAll() { return [] }
  cloneNode() { return new Text(this.textContent) }
}

class Element {
  constructor(tag, text = '') {
    this.tagName = tag.toUpperCase(); this.childNodes = []; this.style = {}; this.attributes = []
    if (text) this.appendChild(new Text(text))
  }
  get children() { return this.childNodes }
  get firstChild() { return this.childNodes[0] || null }
  get textContent() { return this.childNodes.map(c => c.textContent).join('') }
  setAttribute(name, value) {
    this.attributes = this.attributes.filter(a => a.name !== name)
    this.attributes.push({ name, value: String(value) })
  }
  getAttribute(name) { return this.attributes.find(a => a.name === name)?.value ?? null }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child)
    this.childNodes.push(child); child.parentNode = this; return child
  }
  removeChild(child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null }
  replaceChild(next, old) {
    const index = this.childNodes.indexOf(old)
    if (next.parentNode) next.parentNode.removeChild(next)
    this.childNodes[index] = next; next.parentNode = this; old.parentNode = null
  }
  querySelectorAll(selector) {
    const tags = selector.split(',').map(s => s.trim().toUpperCase())
    return this.childNodes.flatMap(child => [...(tags.includes(child.tagName) ? [child] : []), ...child.querySelectorAll(selector)])
  }
  cloneNode(deep) {
    const clone = new Element(this.tagName)
    for (const a of this.attributes) clone.setAttribute(a.name, a.value)
    if (deep) for (const child of this.childNodes) clone.appendChild(child.cloneNode(true))
    return clone
  }
}

test('closed and nested appendices become ordinary flow content in the export clone', () => {
  const article = new Element('article')
  const details = article.appendChild(new Element('details'))
  details.appendChild(new Element('summary', 'Appendix A'))
  details.appendChild(new Element('p', 'First paragraph'))
  const nested = details.appendChild(new Element('details'))
  nested.appendChild(new Element('summary', 'Nested appendix'))
  nested.appendChild(new Element('p', 'Nested paragraph'))
  const second = article.appendChild(new Element('details'))
  second.appendChild(new Element('summary', 'Appendix B'))
  second.appendChild(new Element('p', 'Second paragraph'))
  const document = { readyState: 'loading', addEventListener() {}, createElement: tag => new Element(tag), body: new Element('body') }
  const result = loadExporter(document).createExportRoot(article)
  assert.equal(result.querySelectorAll('details').length, 0, 'Export kept collapsed details; their hidden content can paint over the following appendix')
  assert.equal(result.querySelectorAll('summary').length, 0)
  assert.equal(result.textContent, article.textContent)
  assert.equal(article.querySelectorAll('details').length, 3)
  assert.equal(article.querySelectorAll('summary').length, 3)
})

test('export uses a light palette of the selected theme without changing the live dark theme', () => {
  const body = new Element('body')
  body.setAttribute('data-doc-theme', 'editorial-atlas')
  body.setAttribute('data-theme', 'dark')
  const document = { readyState: 'loading', addEventListener() {}, createElement: tag => new Element(tag), body }
  const result = loadExporter(document).createExportRoot(new Element('article', 'Text'))
  assert.equal(result.getAttribute('data-doc-theme'), 'editorial-atlas')
  assert.equal(result.getAttribute('data-theme'), 'light')
  assert.equal(body.getAttribute('data-theme'), 'dark')
})

test('canvas rendering preserves the viewport used to measure page boundaries', () => {
  let options
  const document = { readyState: 'loading', addEventListener() {} }
  const window = { innerWidth: 1280, innerHeight: 720, html2canvas(root, value) { options = value } }
  loadExporter(document, window).renderCanvas({ scrollWidth: 960, offsetWidth: 960, scrollHeight: 6000, offsetHeight: 6000 })
  assert.equal(options.width, 960)
  assert.equal(options.height, 6000)
  assert.equal(options.windowWidth, 1280, 'vw fonts and media queries must not reflow after DOM measurement')
  assert.equal(options.windowHeight, 720, 'vh-sized diagrams must keep the same geometry in the capture')
})
